import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
const MAX_SLOTS = 20;
const LIST_SPLITTER = /[,\n;]+/;
const STATE_WIDGET_NAME = "all_groups_state";
const REFRESH_INTERVAL = 500;
const NODE_MODE_VALUES = {
    ALWAYS: globalThis.LiteGraph?.ALWAYS ?? 0,
    NEVER: globalThis.LiteGraph?.NEVER ?? 2,
    BYPASS: 4
};
const VALID_TOGGLE_RESTRICTIONS = ["default", "max one", "always one", "iterate", "random"];
const VALID_TARGET_TYPES = ["ID", "Title"];

const trackedGroupNodes = new Set();
let globalGroupSignature = null;
let groupWatcherHandle = null;

const OFF_LABELS = {
    Bypass: "Bypass 🔴",
    Mute: "Mute 🔇",
    Collapse: "Collapsed ▶",
    "Bypass+Collapse": "Byp+Col 🔴▶"
};
const ON_LABELS = {
    Collapse: "Expanded ▼",
    "Bypass+Collapse": "Expanded ▼"
};

const clampInt = (value, min = 1, max = MAX_SLOTS) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.min(max, Math.max(min, Math.round(num)));
};

const getWidget = (node, name) => {
    if (!node || !name) return null;
    const visible = node.widgets?.find((widget) => widget.name === name);
    if (visible) return visible;
    return node.__AUN_widgetLookup?.get(name) || null;
};

const applyWidgetHiddenState = (widget, hidden) => {
    if (!widget) return;
    widget.hidden = hidden;
    widget.__AUN_visible = !hidden;
};

const trackWidgetMetadata = (node, widget) => {
    if (!node || !widget) return widget;
    node.__AUN_widgetLookup = node.__AUN_widgetLookup || new Map();
    node.__AUN_allWidgets = node.__AUN_allWidgets || [];
    node.__AUN_widgetOrderCounter = node.__AUN_widgetOrderCounter ?? 0;
    if (widget.name) node.__AUN_widgetLookup.set(widget.name, widget);
    if (!node.__AUN_allWidgets.includes(widget)) {
        if (!Number.isFinite(widget.__AUN_order)) {
            widget.__AUN_order = node.__AUN_widgetOrderCounter++;
        }
        widget.__AUN_visible = widget.__AUN_visible !== false;
        node.__AUN_allWidgets.push(widget);
    }
    return widget;
};

const syncWidgetVisibility = (node) => {
    if (!node?.__AUN_allWidgets) return;
    const sorted = node.__AUN_allWidgets
        .filter((widget) => widget && !widget.__AUN_removed)
        .sort((a, b) => (a.__AUN_order ?? 0) - (b.__AUN_order ?? 0));
    // IMPORTANT: keep hidden widgets in node.widgets so ComfyUI can serialize their values.
    // Visual hiding is handled via widget.hidden + computeSize() returning height 0.
    node.widgets = sorted;
};

const ensureWidgetTracking = (node) => {
    if (!node || node.__AUN_widgetTrackingSetup) return;
    node.__AUN_widgetTrackingSetup = true;
    node.widgets = node.widgets || [];
    node.widgets.forEach((widget) => trackWidgetMetadata(node, widget));
    syncWidgetVisibility(node);
    const originalAddWidget = node.addWidget;
    node.addWidget = function addWidgetTracked(...args) {
        const widget = originalAddWidget?.apply(this, args);
        if (widget) {
            trackWidgetMetadata(this, widget);
            syncWidgetVisibility(this);
        }
        return widget;
    };
    node.__AUN_syncWidgetVisibility = () => syncWidgetVisibility(node);
};

const getAllTrackedWidgets = (node) => node?.__AUN_allWidgets || node?.widgets || [];

const ensureHiddenAwareWidget = (widget) => {
    if (!widget || widget.__AUN_hiddenAware) return;
    const originalCompute = typeof widget.computeSize === "function" ? widget.computeSize : null;
    widget.__AUN_hiddenAware = true;
    widget.computeSize = function computeSizeProxy(...args) {
        const firstArg = args.length ? args[0] : undefined;
        const resolveWidth = () => {
            if (Array.isArray(firstArg) && Number.isFinite(firstArg[0])) return firstArg[0];
            if (Number.isFinite(firstArg)) return firstArg;
            return LiteGraph?.NODE_WIDTH ?? 200;
        };
        if (this.hidden) {
            if (Array.isArray(firstArg)) {
                firstArg[1] = 0;
                return firstArg;
            }
            return [resolveWidth(), 0];
        }
        if (originalCompute) {
            const result = originalCompute.apply(this, args);
            if (Array.isArray(result)) return result;
            if (Array.isArray(firstArg)) return firstArg;
            if (Number.isFinite(result)) return [resolveWidth(), Number(result)];
        }
        return [resolveWidth(), LiteGraph?.NODE_WIDGET_HEIGHT ?? 24];
    };
};

const splitList = (value, { lowercase = false } = {}) => {
    if (!value || typeof value !== "string") return [];
    return value
        .split(LIST_SPLITTER)
        .map((part) => {
            const trimmed = part.trim();
            return lowercase ? trimmed.toLowerCase() : trimmed;
        })
        .filter(Boolean);
};

const editDistanceWithin = (a, b, maxDistance = 2) => {
    if (a === b) return 0;
    if (typeof a !== "string" || typeof b !== "string") return maxDistance + 1;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > maxDistance) return maxDistance + 1;
    if (!la) return lb <= maxDistance ? lb : maxDistance + 1;
    if (!lb) return la <= maxDistance ? la : maxDistance + 1;

    // Levenshtein distance with row-min pruning.
    const prev = new Array(lb + 1);
    const curr = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;

    for (let i = 1; i <= la; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        const ca = a.charCodeAt(i - 1);
        for (let j = 1; j <= lb; j++) {
            const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
            const del = prev[j] + 1;
            const ins = curr[j - 1] + 1;
            const sub = prev[j - 1] + cost;
            const val = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
            curr[j] = val;
            if (val < rowMin) rowMin = val;
        }
        if (rowMin > maxDistance) return maxDistance + 1;
        for (let j = 0; j <= lb; j++) prev[j] = curr[j];
    }
    return prev[lb];
};

const remapRenamedGroupTitle = (currentValue, titles) => {
    const source = typeof currentValue === "string" ? currentValue.trim() : "";
    if (!source) return null;
    if (!Array.isArray(titles) || !titles.length) return null;

    const sourceLower = source.toLowerCase();
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let tie = false;

    for (const title of titles) {
        if (!title) continue;
        const titleLower = String(title).toLowerCase();
        if (titleLower === sourceLower) return title;

        const dist = editDistanceWithin(sourceLower, titleLower, 2);
        if (dist > 2) continue;
        if (dist < bestDistance) {
            bestDistance = dist;
            best = title;
            tie = false;
        } else if (dist === bestDistance) {
            tie = true;
        }
    }

    if (!best || tie) return null;
    return best;
};

const getAllGraphs = (root) => {
    const seen = new Set();
    const result = [];

    const normalizeGraph = (candidate) => {
        if (!candidate) return null;
        // Some nodes return wrappers like { graph: LGraph }
        if (candidate.graph && (candidate.graph._nodes || candidate.graph.nodes)) return candidate.graph;
        return candidate;
    };

    const visit = (graphLike) => {
        const graph = normalizeGraph(graphLike);
        if (!graph || seen.has(graph)) return;
        seen.add(graph);
        result.push(graph);

        const push = (collection) => {
            if (!collection) return;
            if (collection instanceof Map) {
                collection.forEach((value) => visit(value));
                return;
            }
            if (collection instanceof Set) {
                collection.forEach((value) => visit(value));
                return;
            }
            if (Array.isArray(collection)) {
                collection.forEach(visit);
                return;
            }
            // Generic iterable (but avoid strings)
            if (typeof collection !== "string" && typeof collection?.[Symbol.iterator] === "function") {
                for (const value of collection) visit(value);
                return;
            }
            if (typeof collection === "object") {
                Object.values(collection).forEach(visit);
            }
        };

        push(graph.graphs);
        push(graph.subgraphs);
        push(graph._subgraphs);

        const nodes = graph._nodes || graph.nodes;
        if (nodes) {
            const visitNode = (node) => {
                if (!node) return;
                const candidates = [
                    node?.getInnerGraph?.(),
                    node?.subgraph,
                    node?.inner_graph,
                    node?.innerGraph,
                    node?._subgraph,
                    node?.subgraphs
                ];
                candidates.forEach((candidate) => {
                    if (!candidate) return;
                    if (Array.isArray(candidate)) candidate.forEach(visit);
                    else visit(candidate);
                });
            };

            if (Array.isArray(nodes)) nodes.forEach(visitNode);
            else if (nodes instanceof Map) nodes.forEach((value) => visitNode(value));
            else if (nodes instanceof Set) nodes.forEach((value) => visitNode(value));
            else if (typeof nodes === "object") Object.values(nodes).forEach((value) => visitNode(value));
        }
    };

    visit(root);
    return result;
};

const getGraphNodes = (graph) => {
    if (!graph) return [];
    if (Array.isArray(graph._nodes)) return graph._nodes;
    if (Array.isArray(graph.nodes)) return graph.nodes;
    if (graph._nodes instanceof Map) return Array.from(graph._nodes.values());
    if (graph.nodes instanceof Map) return Array.from(graph.nodes.values());
    if (graph._nodes instanceof Set) return Array.from(graph._nodes.values());
    if (graph.nodes instanceof Set) return Array.from(graph.nodes.values());
    return [];
};

const resolveSubgraphByKey = (key) => {
    const normalized = typeof key === "string" ? key.trim() : String(key ?? "").trim();
    if (!normalized) return null;
    try {
        const collection = app?.graph?._subgraphs;
        if (collection instanceof Map) {
            const value = collection.get(normalized);
            if (!value) return null;
            if (value.graph && (value.graph._nodes || value.graph.nodes)) return value.graph;
            if (value._nodes || value.nodes) return value;
            return null;
        }
        if (collection && typeof collection === "object") {
            const value = collection[normalized];
            if (!value) return null;
            if (value.graph && (value.graph._nodes || value.graph.nodes)) return value.graph;
            if (value._nodes || value.nodes) return value;
        }
    } catch (_) {
        // ignore
    }
    return null;
};

const getInnerGraphsFromNode = (node) => {
    if (!node) return [];
    const candidates = [
        // ComfyUI core subgraph wrapper nodes store the subgraph UUID in `type`.
        node.type,
        node.getInnerGraph?.(),
        node.subgraph,
        node.inner_graph,
        node.innerGraph,
        node._subgraph,
        node.subgraphs
    ];
    const graphs = [];
    const push = (value) => {
        if (!value) return;
        // If we see a string UUID key that exists in app.graph._subgraphs, resolve it.
        if (typeof value === "string") {
            const resolved = resolveSubgraphByKey(value);
            if (resolved) {
                graphs.push(resolved);
                return;
            }
        }
        if (Array.isArray(value)) {
            value.forEach(push);
            return;
        }
        if (value instanceof Map) {
            value.forEach((entry) => push(entry));
            return;
        }
        if (value instanceof Set) {
            value.forEach((entry) => push(entry));
            return;
        }
        if (typeof value !== "string" && typeof value?.[Symbol.iterator] === "function") {
            for (const entry of value) push(entry);
            return;
        }
        // Some implementations return wrappers like { graph: ... }
        const normalized = value.graph && (value.graph._nodes || value.graph.nodes) ? value.graph : value;
        if (normalized && (normalized._nodes || normalized.nodes)) graphs.push(normalized);
    };
    candidates.forEach(push);
    return graphs;
};

const forEachNodeAndInnerNodes = (node, visitor, visitedGraphs = new Set(), visitedNodes = new Set()) => {
    if (!node || visitedNodes.has(node)) return;
    visitedNodes.add(node);
    visitor(node);

    const innerGraphs = getInnerGraphsFromNode(node);
    innerGraphs.forEach((graph) => {
        if (!graph || visitedGraphs.has(graph)) return;
        visitedGraphs.add(graph);
        getGraphNodes(graph).forEach((innerNode) => {
            forEachNodeAndInnerNodes(innerNode, visitor, visitedGraphs, visitedNodes);
        });
    });
};

const findNodeById = (id) => {
    if (id == null) return null;
    const target = String(id);
    const graphs = getAllGraphs(app.graph);
    for (const graph of graphs) {
        const nodes = getGraphNodes(graph);
        if (!nodes.length) continue;
        for (const node of nodes) {
            if (String(node?.id) === target) return node;
            const storedUnique = node?.properties?.unique_id ?? node?.properties?.UNIQUE_ID ?? node?.properties?.["unique_id"];
            if (storedUnique != null && String(storedUnique) === target) return node;
        }
    }
    return null;
};

const sanitizeLegacyValues = function sanitizeLegacyValues() {
    if (!this) return;
    let dirty = false;
    const normalize = (value) => (typeof value === "string" ? value : value == null ? "" : String(value));

    const restrictionWidget = getWidget(this, "toggle_restriction");
    if (restrictionWidget) {
        const normalized = normalize(restrictionWidget.value).trim();
        if (!VALID_TOGGLE_RESTRICTIONS.includes(normalized)) {
            restrictionWidget.value = VALID_TOGGLE_RESTRICTIONS[0];
            dirty = true;
        }
    }

    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const typeWidget = getWidget(this, `target_type_${slot}`);
        if (!typeWidget) continue;
        const normalized = normalize(typeWidget.value).trim();
        if (!VALID_TARGET_TYPES.includes(normalized)) {
            typeWidget.value = VALID_TARGET_TYPES[0];
            dirty = true;
        }
    }

    if (dirty) this.setDirtyCanvas?.(true, true);
};

const collectGroupsByTitle = () => {
    const graphs = getAllGraphs(app.graph);
    const groups = new Map();

    for (const graph of graphs) {
        const list = graph?.groups || [];
        for (const group of list) {
            const key = (group?.title || "").trim().toLowerCase();
            if (!key) continue;
            if (!groups.has(key)) {
                groups.set(key, { title: group.title || "", entries: [] });
            }
            const entry = groups.get(key);
            // Keep displayed title in sync even if only casing/spacing changes.
            if (group.title && entry.title !== group.title) entry.title = group.title;
            entry.entries.push(group);
        }
    }

    return groups;
};

const getSortedGroupTitles = (map) =>
    Array.from(map.values())
        .map((entry) => entry.title || "")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

const buildComboValues = (map) => ["", ...getSortedGroupTitles(map)];

const computeGroupSignature = (map) => Array.from(map.values()).map((entry) => `${entry.title}:${entry.entries.length}`).sort().join("|");

const ensureGlobalGroupWatcher = () => {
    if (groupWatcherHandle) return;
    const refreshTrackedNodes = () => {
        if (!trackedGroupNodes.size) return;
        const groupMap = collectGroupsByTitle();
        const signature = computeGroupSignature(groupMap);
        if (signature === globalGroupSignature) return;
        globalGroupSignature = signature;
        const shared = {
            groupMap,
            signature,
            comboValues: buildComboValues(groupMap)
        };
        trackedGroupNodes.forEach((node) => {
            if (!node || !node.graph) {
                trackedGroupNodes.delete(node);
                return;
            }
            if (!node.widgets && !node.__AUN_allWidgets) return;
            if (node.__AUN_useAllGroups) {
                node.__AUN_refreshWidgets?.();
            } else {
                node.refreshGroupDropdowns?.(true, shared);
            }
        });
    };

    // Hook graph.change() for near-instant UI refresh on group add/rename.
    const graph = app.graph;
    if (graph && !graph.__AUN_groupChangeHooked && typeof graph.change === "function") {
        graph.__AUN_groupChangeHooked = true;
        const originalChange = graph.change;
        graph.change = function changeHooked(...args) {
            const result = originalChange.apply(this, args);
            if (trackedGroupNodes.size) {
                clearTimeout(graph.__AUN_groupChangeDebounce);
                graph.__AUN_groupChangeDebounce = setTimeout(() => {
                    graph.__AUN_groupChangeDebounce = null;
                    refreshTrackedNodes();
                }, 0);
            }
            return result;
        };
    }

    groupWatcherHandle = setInterval(() => {
        refreshTrackedNodes();
    }, REFRESH_INTERVAL);
};

const scheduleAutoHeightUpdate = (node, attempts = 3, delay = 0) => {
    if (!node) return;
    if (node.__AUN_autoHeightTimer) {
        clearTimeout(node.__AUN_autoHeightTimer);
        node.__AUN_autoHeightTimer = null;
    }
    node.__AUN_autoHeightTimer = setTimeout(() => {
        node.__AUN_autoHeightTimer = null;
        node.__AUN_updateAutoHeight?.();
        if (attempts > 1) scheduleAutoHeightUpdate(node, attempts - 1, 50);
    }, delay);
};

const registerGroupNode = (node) => {
    if (!node || node.__AUN_groupTrackingSetup) return;
    node.__AUN_groupTrackingSetup = true;
    trackedGroupNodes.add(node);
    ensureGlobalGroupWatcher();
    const graph = app.graph;
    if (graph && !graph.__AUN_groupTrackingHooked) {
        graph.__AUN_groupTrackingHooked = true;
        const originalGraphOnNodeRemoved = graph.onNodeRemoved;
        graph.onNodeRemoved = function onNodeRemoved(...args) {
            const [removedNode] = args;
            if (removedNode) trackedGroupNodes.delete(removedNode);
            if (typeof originalGraphOnNodeRemoved === "function") {
                return originalGraphOnNodeRemoved.apply(this, args);
            }
            return undefined;
        };
    }
    const originalOnRemoved = node.onRemoved;
    node.onRemoved = function onRemoved(...args) {
        trackedGroupNodes.delete(this);
        this.__AUN_groupTrackingSetup = false;
        if (typeof originalOnRemoved === "function") {
            return originalOnRemoved.apply(this, args);
        }
        return undefined;
    };
};

const ensureBounds = (node) => {
    if (!node) return [0, 0, 0, 0];
    let bounds = node.getBounding?.();
    if (bounds && bounds.every((value) => value === 0)) {
        const ctx = node.graph?.primaryCanvas?.canvas?.getContext?.("2d");
        if (ctx && node.updateArea) {
            try { node.updateArea(ctx); } catch (error) { console.warn("[AUN] updateArea failed", error); }
            bounds = node.getBounding?.();
        }
    }
    if (!bounds) {
        const [x, y] = node.pos || [0, 0];
        const [w, h] = node.size || [0, 0];
        bounds = [x, y, w, h];
    }
    return bounds;
};

const getGroupBounds = (group) => {
    if (!group) return [0, 0, 0, 0];
    const cached = group._bounding;
    if (cached && cached.length === 4) return cached;
    const [x, y] = group.pos || [0, 0];
    const [w, h] = group.size || [0, 0];
    return [x, y, w, h];
};

const isNodeInsideGroup = (node, group, cache) => {
    if (node.group === group) return true;
    const key = String(node.id);
    if (!cache.has(key)) cache.set(key, ensureBounds(node));
    const [x, y, w, h] = cache.get(key);
    const [gx, gy, gw, gh] = getGroupBounds(group);
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    return cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh;
};

const isNodeDisabled = (node, mode) => {
    switch (mode) {
        case "Mute":
            return node.mode === 2;
        case "Collapse":
            return !!node.flags?.collapsed;
        case "Bypass+Collapse":
            return node.mode === 4 && !!node.flags?.collapsed;
        default:
            return node.mode === 4;
    }
};

const evaluateGroupState = (groups, mode) => {
    const cache = new Map();
    let total = 0;
    let disabled = 0;

    for (const group of groups) {
        const graph = group?.graph;
        const nodes = getGraphNodes(graph);
        if (!nodes.length) continue;
        for (const node of nodes) {
            if (!isNodeInsideGroup(node, group, cache)) continue;
            forEachNodeAndInnerNodes(node, (target) => {
                total += 1;
                if (isNodeDisabled(target, mode)) disabled += 1;
            });
        }
    }

    return { total, disabled };
};

const evaluateNodeTargets = (predicate, mode) => {
    const graphs = getAllGraphs(app.graph);
    let total = 0;
    let disabled = 0;
    graphs.forEach((graph) => {
        const nodes = getGraphNodes(graph);
        if (!nodes.length) return;
        nodes.forEach((node) => {
            if (!predicate(node)) return;
            total += 1;
            if (isNodeDisabled(node, mode)) disabled += 1;
        });
    });
    return { total, disabled };
};

const setNodeStateForMode = (node, mode, isActive) => {
    if (!node) return;
    let changed = false;
    const ensureFlags = () => {
        node.flags = node.flags || {};
    };
    const setModeValue = (value) => {
        if (typeof value !== "number") return;
        if (node.mode !== value) {
            node.mode = value;
            changed = true;
        }
    };
    const setCollapsed = (value) => {
        ensureFlags();
        if (!!node.flags.collapsed !== value) {
            node.flags.collapsed = value;
            changed = true;
        }
    };

    if (isActive) {
        setModeValue(NODE_MODE_VALUES.ALWAYS);
        if (mode === "Collapse" || mode === "Bypass+Collapse") {
            setCollapsed(false);
        } else if (mode === "Mute") {
            setCollapsed(false);
        }
    } else {
        switch (mode) {
            case "Mute":
                setModeValue(NODE_MODE_VALUES.NEVER);
                break;
            case "Collapse":
                setCollapsed(true);
                break;
            case "Bypass+Collapse":
                setModeValue(NODE_MODE_VALUES.BYPASS);
                setCollapsed(true);
                break;
            default:
                setModeValue(NODE_MODE_VALUES.BYPASS);
                break;
        }
    }

    if (changed) {
        node.graph?.change?.();
        node.setDirtyCanvas?.(true, true);
    }
};

const applyUniversalUpdate = (mode, groupsPayload) => {
    if (!Array.isArray(groupsPayload) || !groupsPayload.length) return;
    const graphs = getAllGraphs(app.graph);
    const allNodes = [];
    const nodesById = new Map();
    graphs.forEach((graph) => {
        const nodes = getGraphNodes(graph);
        if (!nodes.length) return;
        nodes.forEach((node) => {
            allNodes.push(node);
            nodesById.set(String(node.id), node);
        });
    });

    const groupMap = collectGroupsByTitle();

    const parseIncludeExcludeTargets = (targets) => {
        const includes = [];
        const excludes = [];
        if (!Array.isArray(targets)) return { includes, excludes };
        targets.forEach((raw) => {
            const value = String(raw ?? "").trim();
            if (!value) return;
            const first = value[0];
            if (first === "!" || first === "-") {
                const cleaned = value.slice(1).trim();
                if (cleaned) excludes.push(cleaned);
            } else {
                includes.push(value);
            }
        });
        return { includes, excludes };
    };

    const updateGroupTitle = (title, isActive) => {
        const key = (title || "").trim().toLowerCase();
        if (!key) return;
        const entry = groupMap.get(key);
        if (!entry) return;
        entry.entries.forEach((group) => {
            const graph = group.graph;
            const nodes = getGraphNodes(graph);
            if (!nodes.length) return;
            const cache = new Map();
            nodes.forEach((node) => {
                if (isNodeInsideGroup(node, group, cache)) {
                    forEachNodeAndInnerNodes(node, (target) => setNodeStateForMode(target, mode, isActive));
                }
            });
        });
    };

    const updateById = (id, isActive) => {
        const normalized = String(id ?? "").trim();
        if (!normalized) return;
        const node = nodesById.get(normalized) || nodesById.get(String(Number(normalized)));
        if (!node) return;
        forEachNodeAndInnerNodes(node, (target) => setNodeStateForMode(target, mode, isActive));
    };

    const updateByTitle = (includeTargets, excludeTargets, isActive) => {
        const includes = (includeTargets || [])
            .map((entry) => String(entry ?? "").trim().toLowerCase())
            .filter(Boolean);
        if (!includes.length) return;
        const excludes = new Set(
            (excludeTargets || [])
                .map((entry) => String(entry ?? "").trim().toLowerCase())
                .filter(Boolean)
        );

        allNodes.forEach((node) => {
            const title = String(node.title || "").toLowerCase();
            const included = includes.some((needle) => title.includes(needle));
            if (!included) return;
            const excluded = excludes.size && Array.from(excludes).some((needle) => title.includes(needle));
            if (excluded) return;
            forEachNodeAndInnerNodes(node, (target) => setNodeStateForMode(target, mode, isActive));
        });
    };

    groupsPayload.forEach(({ type, targets, is_active }) => {
        const { includes, excludes } = parseIncludeExcludeTargets(targets);
        if (!includes.length) return;

        if (type === "Group") {
            const excludeSet = new Set(excludes.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
            includes.forEach((target) => {
                const key = String(target).trim().toLowerCase();
                if (excludeSet.has(key)) return;
                updateGroupTitle(target, is_active);
            });
        } else if (type === "ID") {
            const excludeSet = new Set(excludes.map((value) => String(value).trim()).filter(Boolean));
            includes.forEach((target) => {
                const key = String(target).trim();
                if (excludeSet.has(key)) return;
                updateById(target, is_active);
            });
        } else if (type === "Title") {
            updateByTitle(includes, excludes, is_active);
        }
    });

    // Ensure UI refresh also updates subgraph canvases.
    try {
        graphs.forEach((graph) => graph?.setDirtyCanvas?.(true, true));
        app?.graph?.setDirtyCanvas?.(true, true);
    } catch (_) {
        // ignore
    }
};

const serializeAllGroupsState = (activeSet, titles) => {
    const active = [];
    const inactive = [];
    titles.forEach((title) => {
        if (activeSet.has(title)) active.push(title);
        else inactive.push(title);
    });
    return JSON.stringify({ active, inactive });
};

const parseAllGroupsState = (value, titles) => {
    const allowed = new Set(titles);
    const active = new Set();
    if (!value || typeof value !== "string") return active;

    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed?.active)) {
            parsed.active.forEach((entry) => {
                if (typeof entry === "string" && allowed.has(entry)) {
                    active.add(entry);
                }
            });
            return active;
        }
    } catch (_) {
        // fall through
    }

    splitList(value).forEach((entry) => {
        if (allowed.has(entry)) active.add(entry);
    });
    return active;
};

const ensureAllGroupsStateWidget = (node) => {
    if (!node.__AUN_isGroupNode) return;
    node.widgets = node.widgets || [];
    let widget = getWidget(node, STATE_WIDGET_NAME);
    if (!widget) {
        widget = node.addWidget?.("text", STATE_WIDGET_NAME, node.properties?.[STATE_WIDGET_NAME] || "", undefined, {
            multiline: true
        });
        if (!widget) return;
        widget.computeSize = () => [0, 0];
    }
    applyWidgetHiddenState(widget, true);
    const stored = typeof node.properties?.[STATE_WIDGET_NAME] === "string" ? node.properties[STATE_WIDGET_NAME] : "";
    widget.value = stored;
    node.__AUN_syncWidgetVisibility?.();
};

const getAllGroupsStateValue = (node) => {
    if (!node) return "";
    const widget = getWidget(node, STATE_WIDGET_NAME);
    if (widget && typeof widget.value === "string") return widget.value;
    const stored = node.properties?.[STATE_WIDGET_NAME];
    return typeof stored === "string" ? stored : "";
};

const setAllGroupsStateValue = (node, value) => {
    if (!node) return;
    const safe = typeof value === "string" ? value : "";
    const widget = getWidget(node, STATE_WIDGET_NAME);
    if (widget) widget.value = safe;
    node.properties = node.properties || {};
    node.properties[STATE_WIDGET_NAME] = safe;
};

const updateOutputs = (node, { showOutputs, slotCount, useAllGroups, isGroupNode }) => {
    if (!node.outputs) return;
    const desired = showOutputs ? (useAllGroups ? 1 : slotCount + 1) : 1;
    let target = desired;

    for (let i = node.outputs.length - 1; i >= target; i--) {
        if (node.outputs[i]?.links?.length) {
            target = i + 1;
            break;
        }
    }

    while (node.outputs.length > target) node.removeOutput(node.outputs.length - 1);
    while (node.outputs.length < target) node.addOutput(`Switch ${node.outputs.length}`, "BOOLEAN");

    if (!showOutputs) return;

    for (let i = 1; i < node.outputs.length; i++) {
        const rawLabel = isGroupNode ? getWidget(node, `group_name_${i}`)?.value : getWidget(node, `label_${i}`)?.value;
        const labelText = typeof rawLabel === "string" ? rawLabel : (rawLabel == null ? "" : String(rawLabel));
        const finalLabel = labelText.trim() || String(i);
        node.outputs[i].name = `Switch ${finalLabel}`;
        node.outputs[i].label = node.outputs[i].name;
    }
};

const pruneDynamicWidgets = (node) => {
    if (!node?.__AUN_allWidgets) return;
    let changed = false;
    node.__AUN_allWidgets = node.__AUN_allWidgets.filter((widget) => {
        if (!widget?._AUN_dynamic_group) return true;
        changed = true;
        node.__AUN_widgetLookup?.delete(widget.name);
        widget.__AUN_visible = false;
        widget.__AUN_removed = true;
        if (typeof widget.onRemove === "function") widget.onRemove();
        return false;
    });
    if (changed) node.__AUN_syncWidgetVisibility?.();
};

const buildAllGroupsUI = (node, showGroupsUI, mode) => {
    if (!node.widgets && !node.__AUN_allWidgets) return;

    const groups = collectGroupsByTitle();
    const titles = Array.from(groups.values()).map((entry) => entry.title).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const stateValue = getAllGroupsStateValue(node);
    const active = parseAllGroupsState(stateValue, titles);
    const persistState = () => {
        setAllGroupsStateValue(node, serializeAllGroupsState(active, titles));
    };
    const offLabel = OFF_LABELS[mode] || OFF_LABELS.Bypass;
    const onLabel = ON_LABELS[mode] || "🟢";

    pruneDynamicWidgets(node);

    const header = node.addWidget("toggle", "All Groups", titles.length > 0 && active.size === titles.length, (value) => {
        if (node._AUN_updatingGroups) return;
        node._AUN_updatingGroups = true;
        if (value) titles.forEach((title) => active.add(title));
        else active.clear();

        getAllTrackedWidgets(node).forEach((widget) => {
            if (widget._groupTitle) widget.value = value;
        });

        persistState();
        node.__AUN_executeInstant?.();
        node._AUN_updatingGroups = false;
    }, { on: onLabel, off: offLabel });
    header._AUN_dynamic_group = true;
    applyWidgetHiddenState(header, !showGroupsUI);
    header.serializeValue = () => undefined;
    ensureHiddenAwareWidget(header);

    titles.forEach((title) => {
        const widget = node.addWidget("toggle", `• ${title}`, active.has(title), (value) => {
            if (node._AUN_updatingGroups) return;
            node._AUN_updatingGroups = true;
            if (value) active.add(title); else active.delete(title);
            header.value = active.size === titles.length;
            persistState();
            node.__AUN_executeInstant?.();
            node._AUN_updatingGroups = false;
        }, { on: onLabel, off: offLabel });
        widget._AUN_dynamic_group = true;
        widget._groupTitle = title;
        applyWidgetHiddenState(widget, !showGroupsUI);
        widget.serializeValue = () => undefined;
        ensureHiddenAwareWidget(widget);
    });

    header.value = titles.length > 0 && active.size === titles.length;
    persistState();
    node.__AUN_syncWidgetVisibility?.();
};

const refreshGroupDropdowns = function refreshGroupDropdowns(force = false, sharedData) {
    if ((!this.widgets && !this.__AUN_allWidgets) || !this.__AUN_isGroupNode || this.__AUN_useAllGroups) return;

    const groupMap = sharedData?.groupMap || collectGroupsByTitle();
    const signature = sharedData?.signature ?? computeGroupSignature(groupMap);
    if (!force && this._AUN_lastGroupSignature === signature) return;
    this._AUN_lastGroupSignature = signature;

    const titles = sharedData?.comboValues || buildComboValues(groupMap);
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    const showInputs = !this.properties?._AUN_compactMode;

    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const original = getWidget(this, `group_name_${slot}`);
        if (!original) continue;
        applyWidgetHiddenState(original, true);
        ensureHiddenAwareWidget(original);

        // If the stored selection is no longer in the list (e.g. group rename / casing change),
        // try to remap it to the new canonical title so the combo updates immediately.
        const currentRaw = typeof original.value === "string" ? original.value.trim() : "";
        if (currentRaw) {
            const exactExists = titles.includes(currentRaw);
            if (!exactExists) {
                const lower = currentRaw.toLowerCase();
                const remapped = titles.find((title) => title && title.toLowerCase() === lower);
                if (remapped) {
                    original.value = remapped;
                } else {
                    const fuzzy = remapRenamedGroupTitle(currentRaw, titles);
                    if (fuzzy) original.value = fuzzy;
                }
            }
        }

        let combo = getWidget(this, `__AUN_group_combo_${slot}`);
        if (!combo) {
            combo = this.addWidget("combo", `__AUN_group_combo_${slot}`, original.value || "", (value) => {
                original.value = value;
                this.__AUN_refreshWidgets?.();
                this.__AUN_executeInstant?.();
            }, { values: titles });
            combo.serializeValue = () => undefined;
            ensureHiddenAwareWidget(combo);
        } else {
            ensureHiddenAwareWidget(combo);
        }
        combo.label = "Select Group";

        combo.options = combo.options || {};
        combo.options.values = titles;
        if (!titles.includes(combo.value)) combo.value = "";
        if (combo.value !== original.value) combo.value = original.value;
        applyWidgetHiddenState(combo, !(slot <= slotCount && showInputs));
    }
    this.__AUN_syncWidgetVisibility?.();
};

const refreshWidgets = function refreshWidgets() {
    if (!this.widgets && !this.__AUN_allWidgets) return;
    getAllTrackedWidgets(this).forEach(ensureHiddenAwareWidget);
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    const showOutputs = !!getWidget(this, "show_outputs")?.value;
    const isCompact = !!this.properties?._AUN_compactMode;
    const isGroupNode = this.__AUN_isGroupNode;
    const useAllGroups = isGroupNode && !!getWidget(this, "use_all_groups")?.value;
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const showFullInputs = !isCompact;
    const showGroupsCompact = isCompact && useAllGroups && isGroupNode;
    const showSelectedSlotsCompact = isCompact && !useAllGroups;
    const restriction = getWidget(this, "toggle_restriction")?.value || "default";
    const offIcon = OFF_LABELS[mode] || OFF_LABELS.Bypass;
    const onIcon = ON_LABELS[mode] || "🟢";
    const isNodeController = this.__AUN_isUniversalNode && !isGroupNode;
    const allowCompactDetails = !isNodeController;

    this.__AUN_useAllGroups = useAllGroups;

    if (isGroupNode && useAllGroups) {
        const restrictionWidget = getWidget(this, "toggle_restriction");
        if (restrictionWidget && restrictionWidget.value !== "default") {
            restrictionWidget.value = "default";
            this.setDirtyCanvas?.(true, true);
        }
    }

    let activeSlotCount = 0;
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const switchWidget = getWidget(this, `switch_${slot}`);
        const labelWidget = getWidget(this, `label_${slot}`);
        const targetWidget = getWidget(this, `targets_${slot}`);
        const typeWidget = getWidget(this, `target_type_${slot}`);
        const groupWidget = getWidget(this, `group_name_${slot}`);
        const comboWidget = getWidget(this, `__AUN_group_combo_${slot}`);
        const labelValue = typeof labelWidget?.value === "string" ? labelWidget.value.trim() : "";
        const slotDisplayName = labelValue || `Slot ${slot}`;

        const withinRange = slot <= slotCount;
        const slotSelected = !!switchWidget?.value;
        const targetType = typeWidget?.value || "ID";
        const groupNames = isGroupNode ? splitList(groupWidget?.value) : [];
        const slotHasTargets = isGroupNode
            ? groupNames.length > 0
            : splitList(targetWidget?.value, { lowercase: targetType !== "ID" }).length > 0;
        const slotActive = slotSelected && slotHasTargets;
        if (slotActive) activeSlotCount += 1;
        const showSlotDetails = withinRange && (showFullInputs || (showSelectedSlotsCompact && allowCompactDetails && (slotActive || (restriction === "max one" || restriction === "always one"))));
        const showGroupSlot = withinRange && isGroupNode && !useAllGroups && showFullInputs;
        if (switchWidget) {
            const hideForUseAll = useAllGroups && isGroupNode;
            // In compact mode we still want to show toggles for configured slots even when OFF,
            // otherwise users can't see/enable them.
            const hideForCompactSelection = showSelectedSlotsCompact && !slotHasTargets && !isNodeController;
            applyWidgetHiddenState(switchWidget, !withinRange || hideForUseAll || hideForCompactSelection);
            switchWidget.options = switchWidget.options || {};
            switchWidget.options.on = onIcon;
            switchWidget.options.off = offIcon;
            switchWidget.options.label_on = onIcon;
            switchWidget.options.label_off = offIcon;
            switchWidget.label_on = onIcon;
            switchWidget.label_off = offIcon;
            if (isGroupNode && !useAllGroups) {
                const displayLabel = groupNames[0] || `Group Slot ${slot}`;
                switchWidget.label = displayLabel;
            } else {
                switchWidget.label = slotDisplayName;
            }
        }
        if (labelWidget) applyWidgetHiddenState(labelWidget, !showSlotDetails || isGroupNode);
        if (targetWidget) applyWidgetHiddenState(targetWidget, !showSlotDetails || isGroupNode);
        if (typeWidget) applyWidgetHiddenState(typeWidget, !showSlotDetails || isGroupNode);
        if (groupWidget) applyWidgetHiddenState(groupWidget, !showGroupSlot);
        if (comboWidget) applyWidgetHiddenState(comboWidget, !showGroupSlot);
    }

    const stateWidget = getWidget(this, STATE_WIDGET_NAME);
    if (stateWidget) {
        applyWidgetHiddenState(stateWidget, true);
        stateWidget.value = getAllGroupsStateValue(this);
    }

    if (isGroupNode) {
        if (useAllGroups) buildAllGroupsUI(this, showFullInputs || showGroupsCompact, mode);
        else pruneDynamicWidgets(this);
    } else {
        pruneDynamicWidgets(this);
    }

    const hideWhenCompact = isCompact;
    const compactToggleWidgets = [
        "mode",
        "slot_count",
        "toggle_restriction",
        "show_outputs",
        "use_all_groups"
    ];
    compactToggleWidgets.forEach((name) => {
        const widget = getWidget(this, name);
        if (!widget) return;
        const hideForAllGroups = name === "toggle_restriction" && isGroupNode && useAllGroups;
        applyWidgetHiddenState(widget, hideWhenCompact || hideForAllGroups);
    });

    const singleSlot = slotCount <= 1;
    const allSwitch = getWidget(this, "AllSwitch");
    if (allSwitch) {
        const hideForGroups = useAllGroups && isGroupNode;
        const hideForCompactSingle = isCompact && activeSlotCount <= 1;
        const shouldHide = hideForGroups || hideForCompactSingle || singleSlot;
        applyWidgetHiddenState(allSwitch, shouldHide);
        if (shouldHide && allSwitch.value) {
            allSwitch.value = false;
            this.setDirtyCanvas?.(true, true);
        }
    }

    updateOutputs(this, { showOutputs, slotCount, useAllGroups, isGroupNode });
    if (!useAllGroups) this.refreshGroupDropdowns?.();
    this.setDirtyCanvas?.(true, true);
    this.__AUN_syncWidgetVisibility?.();
    this.__AUN_updateAutoHeight?.();
    scheduleAutoHeightUpdate(this);
};

const syncTogglesWithGraph = function syncTogglesWithGraph() {
    if ((!this.widgets && !this.__AUN_allWidgets) || this.configuring) return;
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    const useAllGroups = this.__AUN_useAllGroups;
    const restriction = getWidget(this, "toggle_restriction")?.value || "default";
    if (restriction === "iterate" || restriction === "random") return;
    let dirty = false;

    if (this.__AUN_isGroupNode) {
        const groups = collectGroupsByTitle();
        if (useAllGroups) {
            const titles = Array.from(groups.values()).map((entry) => entry.title).filter(Boolean).sort((a, b) => a.localeCompare(b));
            const stateString = getAllGroupsStateValue(this);
            const active = parseAllGroupsState(stateString, titles);
            titles.forEach((title) => {
                const entry = groups.get(title.toLowerCase());
                const { total, disabled } = evaluateGroupState(entry?.entries || [], mode);
                if (!total) return;
                const shouldBeActive = disabled === 0;
                if (shouldBeActive && !active.has(title)) { active.add(title); dirty = true; }
                if (!shouldBeActive && active.has(title)) { active.delete(title); dirty = true; }
                const widget = getAllTrackedWidgets(this).find((w) => w._groupTitle === title);
                if (widget && widget.value !== shouldBeActive) { widget.value = shouldBeActive; dirty = true; }
            });
            const header = getAllTrackedWidgets(this).find((widget) => widget.name === "All Groups");
            if (header) {
                const shouldAll = titles.length > 0 && active.size === titles.length;
                if (header.value !== shouldAll) { header.value = shouldAll; dirty = true; }
            }
            setAllGroupsStateValue(this, serializeAllGroupsState(active, titles));
            if (dirty) this.setDirtyCanvas(true, true);
            return;
        }

        let allOn = true;
        let allOff = true;

        for (let slot = 1; slot <= slotCount; slot++) {
            const switchWidget = getWidget(this, `switch_${slot}`);
            if (!switchWidget || switchWidget.hidden) continue;
            const names = splitList(getWidget(this, `group_name_${slot}`)?.value, { lowercase: true });
            if (!names.length) { allOn = false; continue; }
            const entries = names.flatMap((name) => groups.get(name)?.entries || []);
            if (!entries.length) { allOn = false; continue; }

            const { total, disabled } = evaluateGroupState(entries, mode);
            if (!total) { allOn = false; continue; }
            const shouldBeActive = disabled === 0;
            if (switchWidget.value !== shouldBeActive) {
                switchWidget.value = shouldBeActive;
                dirty = true;
            }
            if (shouldBeActive) allOff = false;
            else allOn = false;
        }

        const allSwitch = getWidget(this, "AllSwitch");
        if (allSwitch && !allSwitch.hidden) {
            if (allOn && allSwitch.value !== true) { allSwitch.value = true; dirty = true; }
            if (allOff && allSwitch.value !== false) { allSwitch.value = false; dirty = true; }
        }
    } else {
        let allOn = true;
        let allOff = true;

        for (let slot = 1; slot <= slotCount; slot++) {
            const switchWidget = getWidget(this, `switch_${slot}`);
            if (!switchWidget || switchWidget.hidden) continue;
            const targetType = getWidget(this, `target_type_${slot}`)?.value || "ID";
            const rawTargets = splitList(getWidget(this, `targets_${slot}`)?.value, { lowercase: targetType !== "ID" });
            if (!rawTargets.length) { allOn = false; continue; }
            const targetSet = new Set(rawTargets);

            const predicate = (node) => {
                if (targetType === "ID") return targetSet.has(String(node.id));
                const title = String(node.title || "").toLowerCase();
                return rawTargets.some((value) => title.includes(value));
            };

            const { total, disabled } = evaluateNodeTargets(predicate, mode);
            if (!total) { allOn = false; continue; }
            const shouldBeActive = disabled === 0;
            if (switchWidget.value !== shouldBeActive) {
                switchWidget.value = shouldBeActive;
                dirty = true;
            }
            if (shouldBeActive) allOff = false;
            else allOn = false;
        }

        const allSwitch = getWidget(this, "AllSwitch");
        if (allSwitch && !allSwitch.hidden) {
            if (allOn && allSwitch.value !== true) { allSwitch.value = true; dirty = true; }
            if (allOff && allSwitch.value !== false) { allSwitch.value = false; dirty = true; }
        }
    }

    if (dirty) this.setDirtyCanvas(true, true);
};

const executeInstant = function executeInstant() {
    if ((!this.widgets && !this.__AUN_allWidgets) || this.configuring) return;
    const mode = getWidget(this, "mode")?.value || "Bypass";
    const slotCount = clampInt(getWidget(this, "slot_count")?.value || 3);
    const allSwitch = !!getWidget(this, "AllSwitch")?.value;
    const groupsPayload = [];

    if (this.__AUN_isGroupNode) {
        if (this.__AUN_useAllGroups) {
            const map = collectGroupsByTitle();
            const titles = Array.from(map.values()).map((entry) => entry.title).filter(Boolean).sort((a, b) => a.localeCompare(b));
            const stateValue = getAllGroupsStateValue(this);
            const active = parseAllGroupsState(stateValue, titles);
            const activeTitles = Array.from(active);
            const inactiveTitles = titles.filter((title) => !active.has(title));
            if (activeTitles.length) groupsPayload.push({ type: "Group", targets: activeTitles, is_active: true });
            if (inactiveTitles.length) groupsPayload.push({ type: "Group", targets: inactiveTitles, is_active: false });
        } else {
            const activeGroups = new Set();
            const inactiveGroups = new Set();
            for (let slot = 1; slot <= slotCount; slot++) {
                const names = splitList(getWidget(this, `group_name_${slot}`)?.value);
                if (!names.length) continue;
                const switchWidget = getWidget(this, `switch_${slot}`);
                const isActive = (switchWidget ? !!switchWidget.value : false) || allSwitch;
                names.forEach((name) => {
                    // Active wins across overlapping slots.
                    if (isActive) {
                        activeGroups.add(name);
                        inactiveGroups.delete(name);
                    } else if (!activeGroups.has(name)) {
                        inactiveGroups.add(name);
                    }
                });
            }
            const activeTitles = Array.from(activeGroups);
            const inactiveTitles = Array.from(inactiveGroups).filter((name) => !activeGroups.has(name));
            if (activeTitles.length) groupsPayload.push({ type: "Group", targets: activeTitles, is_active: true });
            if (inactiveTitles.length) groupsPayload.push({ type: "Group", targets: inactiveTitles, is_active: false });
        }
    } else {
        const activeIds = new Set();
        const inactiveIds = new Set();
        const activeTitles = new Set();
        const inactiveTitles = new Set();

        for (let slot = 1; slot <= slotCount; slot++) {
            const switchWidget = getWidget(this, `switch_${slot}`);
            if (!switchWidget || switchWidget.hidden) continue;
            const targetType = getWidget(this, `target_type_${slot}`)?.value || "ID";
            const targets = splitList(getWidget(this, `targets_${slot}`)?.value);
            if (!targets.length) continue;
            const isActive = (switchWidget ? !!switchWidget.value : false) || allSwitch;
            targets.forEach((target) => {
                if (targetType === "ID") {
                    // Active wins across overlapping slots.
                    if (isActive) {
                        activeIds.add(target);
                        inactiveIds.delete(target);
                    } else if (!activeIds.has(target)) {
                        inactiveIds.add(target);
                    }
                } else {
                    // Active wins across overlapping slots.
                    if (isActive) {
                        activeTitles.add(target);
                        inactiveTitles.delete(target);
                    } else if (!activeTitles.has(target)) {
                        inactiveTitles.add(target);
                    }
                }
            });
        }

        const filteredActiveIds = Array.from(activeIds);
        const filteredInactiveIds = Array.from(inactiveIds).filter((id) => !activeIds.has(id));
        const filteredActiveTitles = Array.from(activeTitles);
        const filteredInactiveTitles = Array.from(inactiveTitles).filter((title) => !activeTitles.has(title));

        if (filteredActiveIds.length) groupsPayload.push({ type: "ID", targets: filteredActiveIds, is_active: true });
        if (filteredInactiveIds.length) groupsPayload.push({ type: "ID", targets: filteredInactiveIds, is_active: false });
        if (filteredActiveTitles.length) groupsPayload.push({ type: "Title", targets: filteredActiveTitles, is_active: true });
        if (filteredInactiveTitles.length) groupsPayload.push({ type: "Title", targets: filteredInactiveTitles, is_active: false });
    }

    if (!groupsPayload.length) return;
    applyUniversalUpdate(mode, groupsPayload);
    api.dispatchEvent(new CustomEvent("AUN_universal_update", { detail: { mode, groups: groupsPayload, __AUN_alreadyApplied: true } }));
    this._AUN_lastInstantExecution = Date.now();
};

api?.addEventListener?.("AUN_universal_update", (event) => {
    const detail = event?.detail;
    if (!detail || detail.__AUN_alreadyApplied) return;
    const mode = detail.mode;
    const groups = detail.groups;
    if (typeof mode !== "string" || !Array.isArray(groups)) return;
    applyUniversalUpdate(mode, groups);
});

const enforceRestriction = (node, slot, value) => {
    const restriction = getWidget(node, "toggle_restriction")?.value || "default";
    if (!value && restriction !== "always one") return true;
    const slotCount = clampInt(getWidget(node, "slot_count")?.value || 3);

    if (restriction === "max one" || restriction === "always one") {
        if (value) {
            node._AUN_batchToggle = true;
            for (let other = 1; other <= slotCount; other++) {
                if (other === slot) continue;
                const otherWidget = getWidget(node, `switch_${other}`);
                if (otherWidget && otherWidget.value) {
                    otherWidget.value = false;
                    otherWidget.callback?.call(otherWidget, false);
                }
            }
            node._AUN_batchToggle = false;
        } else if (restriction === "always one") {
            const anyOn = Array.from({ length: slotCount }).some((_, index) => getWidget(node, `switch_${index + 1}`)?.value);
            if (!anyOn) {
                const widget = getWidget(node, `switch_${slot}`);
                if (widget) widget.value = true;
                return false;
            }
        }
    }
    return true;
};

const attachSwitchHandlers = (node) => {
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const widget = getWidget(node, `switch_${slot}`);
        if (!widget) continue;
        const original = widget.callback;
        widget.callback = function callback(value) {
            if (node.__AUN_useAllGroups && node.__AUN_isGroupNode) {
                widget.value = false;
                return;
            }
            if (original) original.call(widget, value);
            if (!enforceRestriction(node, slot, value)) return;
            if (node._AUN_batchToggle) return;
            if (!value) {
                const allSwitch = getWidget(node, "AllSwitch");
                if (allSwitch && allSwitch.value) allSwitch.value = false;
            }
            node.__AUN_executeInstant?.();
        };
    }
};

const attachInputHandlers = (node) => {
    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
        const labelWidget = getWidget(node, `label_${slot}`);
        if (labelWidget) {
            const original = labelWidget.callback;
            labelWidget.callback = function callback(value) {
                if (original) original.call(labelWidget, value);
                node.__AUN_refreshWidgets?.();
            };
        }

        const targetWidget = getWidget(node, `targets_${slot}`);
        if (targetWidget) {
            const original = targetWidget.callback;
            targetWidget.callback = function callback(value) {
                if (original) original.call(targetWidget, value);
                node.__AUN_executeInstant?.();
            };
        }

        const groupWidget = getWidget(node, `group_name_${slot}`);
        if (groupWidget) {
            const original = groupWidget.callback;
            groupWidget.callback = function callback(value) {
                if (original) original.call(groupWidget, value);
                node.__AUN_refreshWidgets?.();
                node.__AUN_executeInstant?.();
            };
        }
    }
};

const attachAllSwitchHandler = (node) => {
    const widget = getWidget(node, "AllSwitch");
    if (!widget) return;
    const original = widget.callback;
    widget.callback = function callback(value) {
        if (node.__AUN_useAllGroups && node.__AUN_isGroupNode) {
            widget.value = false;
            return;
        }
        if (original) original.call(widget, value);
        node._AUN_batchToggle = true;
        const total = clampInt(getWidget(node, "slot_count")?.value || 3);
        for (let slot = 1; slot <= total; slot++) {
            const sw = getWidget(node, `switch_${slot}`);
            if (sw && sw.value !== value) {
                sw.value = value;
                sw.callback?.call(sw, value);
            }
        }
        node._AUN_batchToggle = false;
        node.__AUN_executeInstant?.();
    };
};

const decorateNode = (node, nodeData) => {
    const type = nodeData?.name || node?.type || node?.comfyClass;
    node.__AUN_isGroupNode = type === "AUNMultiGroupUniversal" || node.widgets?.some((w) => w.name === "group_name_1");
    node.__AUN_isUniversalNode = type === "AUNMultiUniversal" || node.widgets?.some((w) => w.name === "targets_1");
    if (!node.__AUN_isGroupNode && !node.__AUN_isUniversalNode) return;
    ensureWidgetTracking(node);

    node.__AUN_updateAutoHeight = () => {
        // Always recompute height from the currently visible widgets so the node
        // stays tightly sized to the active slot_count configuration.
        const currentWidth = node.size?.[0] ?? 200;
        const computeTarget = [currentWidth, 0];
        let computed = null;
        if (typeof node.computeSize === "function") {
            const originalWidgets = node.widgets;
            if (Array.isArray(originalWidgets) && originalWidgets.length) {
                const visibleWidgets = originalWidgets.filter((widget) => !widget?.hidden);
                if (visibleWidgets.length !== originalWidgets.length) {
                    node.widgets = visibleWidgets;
                    try {
                        computed = node.computeSize(computeTarget);
                    } finally {
                        node.widgets = originalWidgets;
                    }
                } else {
                    computed = node.computeSize(computeTarget);
                }
            } else {
                computed = node.computeSize(computeTarget);
            }
        }
        const width = currentWidth;
        const heightFallback = node.size?.[1] ?? LiteGraph?.NODE_TITLE_HEIGHT ?? 60;
        const height = Number.isFinite(computed?.[1]) ? computed[1] : heightFallback;
        if (!Number.isFinite(height)) return;
        if (typeof node.setSize === "function") {
            node.__AUN_internalResize = true;
            node.setSize([width, height]);
            node.__AUN_internalResize = false;
        } else {
            node.size = Array.isArray(node.size) ? node.size : [width, height];
            node.size[0] = width;
            node.size[1] = height;
        }
    };

    if (node.__AUN_isGroupNode) {
        node.properties = node.properties || {};
        if (typeof node.properties[STATE_WIDGET_NAME] !== "string") {
            node.properties[STATE_WIDGET_NAME] = "";
        }
        ensureAllGroupsStateWidget(node);
    }

    node.__AUN_sanitizeWidgets = sanitizeLegacyValues.bind(node);
    node.__AUN_sanitizeWidgets?.();

    node.properties = node.properties || {};
    if (typeof node.properties._AUN_compactMode !== "boolean") {
        node.properties._AUN_compactMode = true;
    }

    node.__AUN_refreshWidgets = refreshWidgets.bind(node);
    node.refreshGroupDropdowns = refreshGroupDropdowns.bind(node);
    node.syncTogglesWithGraph = syncTogglesWithGraph.bind(node);
    node.__AUN_executeInstant = executeInstant.bind(node);
    node.__AUN_toggleCompactMode = (nextState) => {
        node.properties = node.properties || {};
        const current = !!node.properties._AUN_compactMode;
        const target = typeof nextState === "boolean" ? nextState : !current;
        if (current === target) return;
        node.properties._AUN_compactMode = target;
        node.__AUN_refreshWidgets?.();
        node.__AUN_updateAutoHeight?.();
        scheduleAutoHeightUpdate(node);
        node.setDirtyCanvas?.(true, true);
    };

    const originalOnResize = node.onResize;
    node.onResize = function onResize(...args) {
        if (!this.__AUN_internalResize) {
            this.__AUN_manualResize = true;
        }
        return originalOnResize?.apply(this, args);
    };

    const originalOnRemoved = node.onRemoved;
    node.onRemoved = function onRemoved(...args) {
        if (this.__AUN_autoHeightTimer) {
            clearTimeout(this.__AUN_autoHeightTimer);
            this.__AUN_autoHeightTimer = null;
        }
        return originalOnRemoved?.apply(this, args);
    };

    if (node.__AUN_isGroupNode) {
        registerGroupNode(node);
    }

    attachSwitchHandlers(node);
    attachInputHandlers(node);
    attachAllSwitchHandler(node);

    const originalDblClick = node.onDblClick;
    node.onDblClick = function onDblClick(event, pos) {
        originalDblClick?.apply(this, arguments);
        if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) {
            // Ignore title-bar double-clicks so ComfyUI can keep using them for rename.
            return;
        }
        this.__AUN_toggleCompactMode?.();
    };

    const trackedWidgets = ["slot_count", "toggle_restriction", "mode", "show_outputs", "use_all_groups"];
    trackedWidgets.forEach((name) => {
        const widget = getWidget(node, name);
        if (!widget) return;
        const original = widget.callback;
        widget.callback = function callback(value) {
            if (original) original.call(widget, value);
            node.__AUN_refreshWidgets?.();
            if (name === "slot_count" || name === "use_all_groups") node.refreshGroupDropdowns?.(true);
            if (name === "mode" || name === "use_all_groups") node.__AUN_executeInstant?.();
        };
    });

    setTimeout(() => {
        node.__AUN_refreshWidgets?.();
        node.refreshGroupDropdowns?.(true);
    }, 250);

    const originalDraw = node.onDrawBackground;
    node.onDrawBackground = function onDrawBackground(ctx) {
        if (originalDraw) originalDraw.apply(this, arguments);
        const now = Date.now();
        if (!this._AUN_lastSync || now - this._AUN_lastSync > REFRESH_INTERVAL) {
            this._AUN_lastSync = now;
            this.refreshGroupDropdowns?.();
            this.syncTogglesWithGraph?.();
        }
    };
};

const extendNodePrototype = (nodeType, nodeData) => {
    const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function onNodeCreated() {
        originalOnNodeCreated?.apply(this, arguments);
        decorateNode(this, nodeData);
    };

    const originalOnAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = function onAdded() {
        originalOnAdded?.apply(this, arguments);
        this.__AUN_sanitizeWidgets?.();
        this.__AUN_refreshWidgets?.();
        this.refreshGroupDropdowns?.(true);
    };

    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function onConfigure() {
        originalOnConfigure?.apply(this, arguments);
        this.__AUN_sanitizeWidgets?.();
        this.__AUN_refreshWidgets?.();
        this.refreshGroupDropdowns?.(true);
    };

    const originalMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function getExtraMenuOptions(graphcanvas, options) {
        originalMenu?.apply(this, arguments);
        const compact = !!this.properties?._AUN_compactMode;
        options.push({
            content: compact ? "AUN: Show all controls" : "AUN: Compact mode",
            callback: () => this.__AUN_toggleCompactMode?.(!compact)
        });
    };

    const originalOnPropertyChanged = nodeType.prototype.onPropertyChanged;
    nodeType.prototype.onPropertyChanged = function onPropertyChanged(name) {
        originalOnPropertyChanged?.apply(this, arguments);
        if (name === "_AUN_compactMode") {
            this.__AUN_refreshWidgets?.();
            this.setDirtyCanvas(true, true);
        }
    };
};

app.registerExtension({
    name: "AUN.Universal.Instant",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData) return;
        if (!["AUNMultiUniversal", "AUNMultiGroupUniversal"].includes(nodeData.name)) return;
        extendNodePrototype(nodeType, nodeData);
    }
});

api?.addEventListener?.("AUN_update_switches", (event) => {
    const detail = event?.detail;
    if (!detail) return;
    const { node_id: nodeId, active_slot: activeSlot } = detail;
    const node = findNodeById(nodeId);
    if (!node) return;

    node._AUN_batchToggle = true;
    for (let slotIndex = 1; slotIndex <= MAX_SLOTS; slotIndex++) {
        const widget = getWidget(node, `switch_${slotIndex}`);
        if (!widget) continue;
        const shouldBeActive = slotIndex === activeSlot;
        if (widget.value !== shouldBeActive) {
            widget.value = shouldBeActive;
        }
    }
    node._AUN_batchToggle = false;

    node.__AUN_refreshWidgets?.();
    node.setDirtyCanvas?.(true, true);
});

