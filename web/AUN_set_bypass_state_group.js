import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const getChildGraphs = (graph) => {
    if (!graph || !graph._subgraphs) return [];
    const subgraphs = (typeof graph._subgraphs.values === "function")
        ? Array.from(graph._subgraphs.values())
        : Object.values(graph._subgraphs);
    return subgraphs
        .map((s) => s?.graph || s?._graph || s)
        .filter((g) => g && g !== graph);
};

const getAllGraphs = (root, visited = new Set()) => {
    const graph = root || app.graph;
    if (!graph || visited.has(graph)) return [];
    visited.add(graph);
    const result = [graph];
    for (const child of getChildGraphs(graph)) {
        result.push(...getAllGraphs(child, visited));
    }
    if (graph._nodes) {
        for (const node of graph._nodes) {
            const inner = node.getInnerGraph?.() || node.subgraph;
            if (inner && inner !== graph) {
                result.push(...getAllGraphs(inner, visited));
            }
        }
    }
    return result;
};

const computeGroupSignature = () => {
    const allGraphs = getAllGraphs(app.graph);
    const allGroups = allGraphs.flatMap(g => g.groups || []);
    return allGroups
        .map((group, idx) => {
            const title = group?.title ?? "";
            const pos = group?.pos || [];
            const size = group?.size || [];
            return `${title}::${pos[0] ?? 0},${pos[1] ?? 0}::${size[0] ?? 0},${size[1] ?? 0}::${idx}`;
        })
        .sort()
        .join("|");
};

let lastGroupSignature = "";
const refreshNodesForGroupChanges = () => {
    const graph = app?.graph;
    if (!graph) return;
    const signature = computeGroupSignature();
    if (signature === lastGroupSignature) return;
    lastGroupSignature = signature;
    try {
        const allGraphs = getAllGraphs(app.graph);
        for (const g of allGraphs) {
            if (!g._nodes) continue;
            for (const node of g._nodes) {
                if (node?.type === "AUNSetBypassStateGroup") {
                    node._setupMultiSelect?.();
                    node.syncTogglesWithGraph?.();
                }
            }
        }
    } catch (e) {}
};

const ensureGroupWatcher = (() => {
    let started = false;
    return () => {
        if (started) return;
        started = true;
        setInterval(() => {
            try { refreshNodesForGroupChanges(); } catch (e) {}
        }, 400);
    };
})();

app.registerExtension({
    name: "AUN.SetBypassStateGroup.Event",
    async setup(app) {
        ensureGroupWatcher();
        // Apply bypass state for one or multiple selected groups when server event is received
        api.addEventListener("AUN_set_bypass_state_group", (event) => {
            try {
                const detail = event.detail || {};
                const isActive = !!detail.is_active;
                let titles = [];
                if (Array.isArray(detail.group_titles)) titles = detail.group_titles.map(t => `${t}`.trim()).filter(Boolean);
                else if (typeof detail.group_title === 'string') titles = [detail.group_title.trim()].filter(Boolean); // back-compat
                if (!titles.length) return;

                const allGraphs = getAllGraphs(app.graph);
                for (const graph of allGraphs) {
                    const groupsByTitle = new Map();
                    for (const g of (graph.groups || [])) {
                        if (!groupsByTitle.has(g.title)) groupsByTitle.set(g.title, []);
                        groupsByTitle.get(g.title).push(g);
                    }

                    const selectedGroups = [];
                    for (const t of titles) {
                        const arr = groupsByTitle.get(t) || [];
                        for (const g of arr) selectedGroups.push(g);
                    }
                    if (!selectedGroups.length) continue;

                    const boundsMap = {};
                    const ensureBounds = (node) => {
                        let b = node.getBounding?.();
                        if (b && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0) {
                            const ctx = node.graph?.primaryCanvas?.canvas?.getContext?.('2d');
                            if (ctx && node.updateArea) {
                                try { node.updateArea(ctx); } catch (e) {}
                                b = node.getBounding?.();
                            }
                        }
                        return b || [node.pos?.[0] ?? 0, node.pos?.[1] ?? 0, node.size?.[0] ?? 0, node.size?.[1] ?? 0];
                    };
                    for (const n of (graph._nodes || [])) boundsMap[String(n.id)] = ensureBounds(n);

                    const insideGroup = (node, groups) => {
                        if (node.group && groups.some(g => node.group === g)) return true;
                        const b = boundsMap[String(node.id)];
                        const cx = b[0] + b[2] * 0.5, cy = b[1] + b[3] * 0.5;
                        for (const g of groups) {
                            const GB = g._bounding || [g.pos?.[0] ?? 0, g.pos?.[1] ?? 0, g.size?.[0] ?? 0, g.size?.[1] ?? 0];
                            if (cx >= GB[0] && cx < GB[0] + GB[2] && cy >= GB[1] && cy < GB[1] + GB[3]) return true;
                        }
                        return false;
                    };

                    for (const node of (graph._nodes || [])) {
                        if (insideGroup(node, selectedGroups)) node.mode = isActive ? 0 : 4;
                    }
                    if (graph.setDirtyCanvas) graph.setDirtyCanvas(true, true);
                }
                app.graph.setDirtyCanvas(true, true);
            } catch (e) {}
        });

        const originalOnGraphChanged = app.graph.onGraphChanged;
        app.graph.onGraphChanged = function() {
            originalOnGraphChanged?.apply(this, arguments);
            try {
                for (const node of app.graph._nodes) {
                    if (node?.type === "AUNSetBypassStateGroup") {
                        node._setupMultiSelect?.();
                        node.syncTogglesWithGraph?.();
                    }
                }
            } catch (e) {}
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AUNSetBypassStateGroup") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                onNodeCreated?.apply(this, arguments);

                this.setGroupBypassState = (groupTitles, isActive) => {
                    const titles = Array.isArray(groupTitles) ? groupTitles : [groupTitles];
                    if (!titles.length) return;

                    const allGraphs = getAllGraphs(app.graph);
                    for (const graph of allGraphs) {
                        const groupsByTitle = new Map();
                        for (const g of (graph.groups || [])) {
                            if (!groupsByTitle.has(g.title)) groupsByTitle.set(g.title, []);
                            groupsByTitle.get(g.title).push(g);
                        }
                        const selectedGroups = [];
                        for (const t of titles) {
                            const arr = groupsByTitle.get(t) || [];
                            for (const g of arr) selectedGroups.push(g);
                        }
                        if (!selectedGroups.length) continue;

                        const boundsMap = {};
                        const ensureBounds = (node) => {
                            let b = node.getBounding?.();
                            if (b && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0) {
                                const ctx = node.graph?.primaryCanvas?.canvas?.getContext?.('2d');
                                if (ctx && node.updateArea) {
                                    try { node.updateArea(ctx); } catch (e) {}
                                    b = node.getBounding?.();
                                }
                            }
                            return b || [node.pos?.[0] ?? 0, node.pos?.[1] ?? 0, node.size?.[0] ?? 0, node.size?.[1] ?? 0];
                        };
                        for (const n of (graph._nodes || [])) boundsMap[String(n.id)] = ensureBounds(n);

                        for (const node of (graph._nodes || [])) {
                            let inAny = false;
                            if (node.group && selectedGroups.some(g => node.group === g)) inAny = true;
                            else {
                                const b = boundsMap[String(node.id)];
                                const cx = b[0] + b[2] * 0.5, cy = b[1] + b[3] * 0.5;
                                for (const g of selectedGroups) {
                                    const GB = g._bounding || [g.pos?.[0] ?? 0, g.pos?.[1] ?? 0, g.size?.[0] ?? 0, g.size?.[1] ?? 0];
                                    if (cx >= GB[0] && cx < GB[0] + GB[2] && cy >= GB[1] && cy < GB[1] + GB[3]) { inAny = true; break; }
                                }
                            }
                            if (inAny) node.mode = isActive ? 0 : 4;
                        }
                        if (graph.setDirtyCanvas) graph.setDirtyCanvas(true, true);
                    }
                    app.graph.setDirtyCanvas(true, true);
                };

                this._setupMultiSelect = () => {
                    if (!Array.isArray(this.widgets)) {
                        setTimeout(() => this._setupMultiSelect?.(), 100);
                        return;
                    }
                    const widgetName = "group_titles";
                    const idx = this.widgets.findIndex(w => w.name === widgetName);
                    if (idx === -1) return;
                    const w = this.widgets[idx];
                    w.hidden = true;
                    const selectedSet = new Set((w.value || "").split(',').map(s => s.trim()).filter(Boolean));

                    this.widgets = this.widgets.filter(ww => !ww._AUN_group_toggle);

                    const allToggle = this.addWidget("toggle", "All Groups", false, (v) => {
                        this._isCurrentlySettingState = true;
                        const allGraphs = getAllGraphs(app.graph);
                        const titles = Array.from(new Set(allGraphs.flatMap(g => (g.groups || []).map(gg => gg.title))));
                        if (v) {
                            for (const t of titles) selectedSet.add(t);
                        } else {
                            selectedSet.clear();
                        }
                        for (const tw of this.widgets) {
                            if (tw._AUN_group_toggle && tw._groupTitle) {
                                tw.value = v;
                            }
                        }
                        w.value = Array.from(selectedSet).join(", ");
                        this.setGroupBypassState(titles, v);
                        app.graph.setDirtyCanvas(true, true);
                        this._isCurrentlySettingState = false;
                    }, { on: "🟢", off: "🔴" });
                    allToggle._AUN_group_toggle = true;

                    const allGraphs = getAllGraphs(app.graph);
                    const titles = Array.from(new Set(allGraphs.flatMap(g => (g.groups || []).map(gg => gg.title)))).sort((a, b) => a.localeCompare(b));
                    for (const title of titles) {
                        const initial = selectedSet.has(title);
                        const tg = this.addWidget("toggle", `• ${title}`, initial, (v) => {
                            this._isCurrentlySettingState = true;
                            if (v) selectedSet.add(title); else selectedSet.delete(title);
                            w.value = Array.from(selectedSet).join(", ");
                            this.setGroupBypassState([title], v);
                            this._isCurrentlySettingState = false;
                        }, { on: "🟢", off: "🔴" });
                        tg._AUN_group_toggle = true;
                        tg._groupTitle = title;
                    }
                    w.value = Array.from(selectedSet).join(", ");
                    const newSize = this.computeSize();
                    if (this.size) {
                        this.size[1] = newSize[1];
                    } else {
                        this.size = newSize;
                    }
                };

                this.syncTogglesWithGraph = () => {
                    if (!Array.isArray(this.widgets)) return;
                    if (this._isCurrentlySettingState) return;
                    const csvWidget = this.widgets.find(w => w.name === "group_titles");
                    if (!csvWidget) return;

                    const allGraphs = getAllGraphs(app.graph);
                    const allGroups = allGraphs.flatMap(g => g.groups || []);
                    const toggleTitles = this.widgets
                        .filter((w) => w._AUN_group_toggle && w._groupTitle)
                        .map((w) => w._groupTitle);
                    
                    const uniqueGroupTitles = Array.from(new Set(allGroups.map(g => g.title)));
                    if (uniqueGroupTitles.length && toggleTitles.length !== uniqueGroupTitles.length) {
                        this._setupMultiSelect();
                    }

                    const activeGroups = new Set();
                    let allGroupsAreActive = allGroups.length > 0;
                    let allGroupsAreBypassed = allGroups.length > 0;

                    const groupsByTitle = new Map();
                    for (const g of allGroups) {
                        if (!groupsByTitle.has(g.title)) groupsByTitle.set(g.title, []);
                        groupsByTitle.get(g.title).push(g);
                    }

                    for (const [title, groups] of groupsByTitle.entries()) {
                        let titleIsBypassed = true;
                        let titleIsActive = true;
                        let hasNodes = false;

                        for (const group of groups) {
                            const graph = group.graph;
                            if (!graph) continue;
                            
                            const boundsMap = {};
                            const ensureBounds = (node) => {
                                let b = node.getBounding?.();
                                if (b && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0) {
                                    const ctx = node.graph?.primaryCanvas?.canvas?.getContext?.('2d');
                                    if (ctx && node.updateArea) {
                                        try { node.updateArea(ctx); } catch (e) {}
                                        b = node.getBounding?.();
                                    }
                                }
                                return b || [node.pos?.[0] ?? 0, node.pos?.[1] ?? 0, node.size?.[0] ?? 0, node.size?.[1] ?? 0];
                            };
                            for (const n of (graph._nodes || [])) boundsMap[String(n.id)] = ensureBounds(n);

                            const isNodeInGroup = (node, group) => {
                                if (node.group === group) return true;
                                const b = boundsMap[String(node.id)];
                                const cx = b[0] + b[2] * 0.5, cy = b[1] + b[3] * 0.5;
                                const GB = group._bounding || [group.pos?.[0] ?? 0, group.pos?.[1] ?? 0, group.size?.[0] ?? 0, group.size?.[1] ?? 0];
                                return cx >= GB[0] && cx < GB[0] + GB[2] && cy >= GB[1] && cy < GB[1] + GB[3];
                            };

                            const nodesInGroup = (graph._nodes || []).filter(n => isNodeInGroup(n, group));
                            if (nodesInGroup.length) {
                                hasNodes = true;
                                if (!nodesInGroup.every(n => n.mode === 4)) titleIsBypassed = false;
                                if (!nodesInGroup.every(n => n.mode === 0)) titleIsActive = false;
                            }
                        }

                        const toggle = this.widgets.find(w => w._groupTitle === title);
                        if (toggle) {
                            let newState = toggle.value;
                            if (titleIsActive) newState = true;
                            else if (titleIsBypassed) newState = false;

                            if (toggle.value !== newState) {
                                toggle.value = newState;
                            }
                        }

                        if (!titleIsBypassed) {
                            activeGroups.add(title);
                            allGroupsAreBypassed = false;
                        } else {
                            allGroupsAreActive = false;
                        }
                    }

                    const allToggle = this.widgets.find(w => w.name === "All Groups");
                    if (allToggle) {
                        let newState = false;
                        if (!allGroups.length) newState = false;
                        else if (allGroupsAreActive) newState = true;
                        else if (allGroupsAreBypassed) newState = false;
                        else newState = false;
                        if (allToggle.value !== newState) allToggle.value = newState;
                    }

                    const newCsv = Array.from(activeGroups).join(", ");
                    if (csvWidget.value !== newCsv) {
                        csvWidget.value = newCsv;
                    }
                };

                setTimeout(() => {
                    this._setupMultiSelect();
                    this.syncTogglesWithGraph();
                }, 100);

                const originalOnConfigure = this.onConfigure;
                this.onConfigure = (info) => {
                    originalOnConfigure?.call(this, info);
                    setTimeout(() => {
                        this._setupMultiSelect();
                        this.syncTogglesWithGraph();
                    }, 0);
                };

                const originalOnDrawBackground = this.onDrawBackground;
                this.onDrawBackground = (ctx) => {
                    originalOnDrawBackground?.call(this, ctx);
                    const now = Date.now();
                    if (!this._lastSyncTime || (now - this._lastSyncTime > 500)) {
                        this._lastSyncTime = now;
                        this.syncTogglesWithGraph();
                    }
                    if (!this.__convertedOnce) {
                        this.__convertedOnce = true;
                        setTimeout(() => {
                            this._setupMultiSelect();
                            this.syncTogglesWithGraph();
                        }, 100);
                    }
                };
            };
        }
    }
});
