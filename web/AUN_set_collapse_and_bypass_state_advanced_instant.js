import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function parseIds(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

function findNodeById(id) {
    const getAllGraphs = (root) => {
        let graphs = [root];
        const getChildGraphs = (graph) => {
            if (!graph) return;
            if (graph._subgraphs) {
                const subs = graph._subgraphs instanceof Map ? graph._subgraphs.values() : Object.values(graph._subgraphs);
                for (const sub of subs) {
                    if (sub && !graphs.includes(sub)) {
                        graphs.push(sub);
                        getChildGraphs(sub);
                    }
                }
            }
            if (graph._nodes) {
                for (const node of graph._nodes) {
                    const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
                    if (inner && !graphs.includes(inner)) {
                        graphs.push(inner);
                        getChildGraphs(inner);
                    }
                }
            }
        };
        getChildGraphs(root);
        return graphs;
    };

    const graphs = getAllGraphs(app.graph);
    for (const graph of graphs) {
        const node = graph.getNodeById(id);
        if (node) return node;
    }
    return null;
}

const applyRecursiveState = (node, isActive, modeType, collapse) => {
    if (!node) return;

    // Apply Bypass/Mute
    if (modeType === "bypass") {
        node.mode = isActive ? 0 : 4;
    } else if (modeType === "mute") {
        node.mode = isActive ? 0 : 2;
    }

    // Apply Collapse
    if (collapse !== undefined) {
        const isCollapsed = !!(node.flags && node.flags.collapsed);
        if (collapse && !isCollapsed) node.collapse?.();
        else if (!collapse && isCollapsed) node.collapse?.();
    }

    // Recursively apply to subgraph
    const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
    if (inner && inner._nodes) {
        for (const innerNode of inner._nodes) {
            applyRecursiveState(innerNode, isActive, modeType, collapse);
        }
    }
};

function applyCollapseToIds(ids, collapse) {
    for (const nodeId of ids) {
        const target = findNodeById(nodeId);
        if (!target) continue;
        applyRecursiveState(target, true, null, collapse);
    }
}

function applyBypassToIds(ids, bypass) {
    for (const nodeId of ids) {
        const target = findNodeById(nodeId);
        if (!target) continue;
        // bypass=true => set mode to 4 (bypassed); bypass=false => mode 0 (active)
        applyRecursiveState(target, !bypass, "bypass");
    }
}

function applyMuteToIds(ids, mute) {
    for (const nodeId of ids) {
        const target = findNodeById(nodeId);
        if (!target) continue;
        // mute=true => set mode to 2 (muted); mute=false => mode 0 (active)
        applyRecursiveState(target, !mute, "mute");
    }
}

app.registerExtension({
    name: "AUN.SetCollapseAndBypass.Advanced.Instant",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
    const matches = nodeData && nodeData.name && (nodeData.name === "AUNSetCollapseAndBypassStateAdvanced" || nodeData.name.includes("Collapse & Bypass/Mute (Advanced)"));
        if (!matches) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const nodeIdsWidget = this.widgets.find(w => w.name === "node_ids");
            const combinedWidget = this.widgets.find(w => w.name === "combined");
            const useMuteWidget = this.widgets.find(w => w.name === "use_mute");
            const collapseWidget = this.widgets.find(w => w.name === "collapse");
            const activeWidget = this.widgets.find(w => w.name === "active");

            const executeCombined = (value) => {
                const raw = nodeIdsWidget?.value || "";
                const ids = parseIds(raw);
                if (ids.length === 0) return;
                // combined true = collapse + disable (bypass or mute based on use_mute)
                const collapseState = !!value;
                const disableState = !!value; // true means disabled
                applyCollapseToIds(ids, collapseState);
                const useMute = !!(useMuteWidget?.value);
                if (useMute) applyMuteToIds(ids, disableState);
                else applyBypassToIds(ids, disableState);
                app.graph.setDirtyCanvas(true, true);
            };

            const executeCollapse = (value) => {
                const raw = nodeIdsWidget?.value || "";
                const ids = parseIds(raw);
                if (ids.length === 0) return;
                applyCollapseToIds(ids, !!value);
                app.graph.setDirtyCanvas(true, true);
            };

            const executeActive = (value) => {
                const raw = nodeIdsWidget?.value || "";
                const ids = parseIds(raw);
                if (ids.length === 0) return;
                // Active true => enabled; Active false => disabled (bypass or mute based on use_mute)
                const active = !!value;
                const useMute = !!(useMuteWidget?.value);
                if (useMute) applyMuteToIds(ids, !active);
                else applyBypassToIds(ids, !active);
                app.graph.setDirtyCanvas(true, true);
            };

            if (combinedWidget) {
                const orig = combinedWidget.callback;
                combinedWidget.callback = (v) => {
                    if (orig) orig.call(combinedWidget, v);
                    executeCombined(v);
                };
            }

            if (collapseWidget) {
                const orig = collapseWidget.callback;
                collapseWidget.callback = (v) => {
                    if (orig) orig.call(collapseWidget, v);
                    // only apply individual when combined is false
                    if (!combinedWidget || !combinedWidget.value) executeCollapse(v);
                };
            }

            if (activeWidget) {
                const orig = activeWidget.callback;
                activeWidget.callback = (v) => {
                    if (orig) orig.call(activeWidget, v);
                    if (!combinedWidget || !combinedWidget.value) executeActive(v);
                };
            }
        };
    }
});

// Also listen for server events so UI updates when events come from Python side
try {
    api.addEventListener("AUN_set_collapse_state", (event) => {
        try {
            const nodeId = event.detail?.node_id;
            const collapse = event.detail?.collapse;
            if (!nodeId) return;
            const target = findNodeById(nodeId);
            if (!target) return;
            applyRecursiveState(target, true, null, collapse);
            app.graph.setDirtyCanvas(true, true);
        } catch (e) {}
    });

    api.addEventListener("AUN_node_bypass_state", (event) => {
        try {
            const nodeId = event.detail?.node_id;
            const isActive = event.detail?.is_active;
            if (!nodeId) return;
            const target = findNodeById(nodeId);
            if (!target) return;
            applyRecursiveState(target, isActive, "bypass");
            app.graph.setDirtyCanvas(true, true);
        } catch (e) {}
    });

    api.addEventListener("AUN-node-mute-state", (event) => {
        try {
            const nodeId = event.detail?.node_id;
            const isActive = event.detail?.is_active;
            if (!nodeId) return;
            const target = findNodeById(nodeId);
            if (!target) return;
            applyRecursiveState(target, isActive, "mute");
            app.graph.setDirtyCanvas(true, true);
        } catch (e) {}
    });
} catch (e) {
    // ignore if api isn't available at load time
}
