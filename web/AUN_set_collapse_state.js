import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "AUN.SetCollapseState.Event",
    async setup(app) {
        // Handle setting collapse state
        app.api.addEventListener("AUN_set_collapse_state", (event) => {
            const updates = event.detail.updates || [event.detail];
            
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

            for (const update of updates) {
                if (typeof update.node_id !== 'undefined' && typeof update.collapse !== 'undefined') {
                    const nodeId = update.node_id;
                    const shouldCollapse = update.collapse;
                    
                    let targetNode = null;
                    for (const graph of graphs) {
                        targetNode = graph.getNodeById(nodeId);
                        if (targetNode) break;
                    }

                    if (targetNode) {
                        const applyToNode = (n, collapse) => {
                            const isCurrentlyCollapsed = n.flags && n.flags.collapsed;
                            if (collapse && !isCurrentlyCollapsed) {
                                n.collapse();
                            } else if (!collapse && isCurrentlyCollapsed) {
                                n.collapse();
                            }
                            
                            // Recursively apply to subgraph if it exists
                            const inner = n.getInnerGraph?.() || n.subgraph || n.inner_graph;
                            if (inner && inner._nodes) {
                                for (const innerNode of inner._nodes) {
                                    applyToNode(innerNode, collapse);
                                }
                            }
                        };
                        applyToNode(targetNode, shouldCollapse);
                    }
                }
            }
            app.graph.setDirtyCanvas(true, true);
        });
    }
});
