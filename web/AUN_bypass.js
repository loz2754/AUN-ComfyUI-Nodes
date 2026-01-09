import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";

function setAUNBypassState(event) {
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
    const updates = event.detail.updates || [event.detail];

    for (const update of updates) {
        let node = null;
        for (const graph of graphs) {
            node = graph.getNodeById(update.node_id);
            if (node) break;
        }

        if (node) {
            const applyToNode = (n, active) => {
                n.mode = active ? 0 : 4;
                
                // Recursively apply to subgraph if it exists
                const inner = n.getInnerGraph?.() || n.subgraph || n.inner_graph;
                if (inner && inner._nodes) {
                    for (const innerNode of inner._nodes) {
                        applyToNode(innerNode, active);
                    }
                }
            };
            applyToNode(node, update.is_active);
        }
    }
    app.canvas.setDirty(true);
}

api.addEventListener("AUN_node_bypass_state", setAUNBypassState);
