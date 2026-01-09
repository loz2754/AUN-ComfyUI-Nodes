import { app } from "/scripts/app.js";

app.registerExtension({
    name: "AUN.MultiBypassIndex",
    async nodeCreated(node) {
        if (node.comfyClass === "AUNMultiBypassIndex") {
            // Add the immediate execution method
            node.executeBypassState = function(nodeIdsStr, isActive, switchNumber) {
                try {
                    if (!nodeIdsStr || nodeIdsStr.trim() === "" || nodeIdsStr === "0") {
                        return; // Skip empty or default values
                    }
                    
                    // Parse comma-separated node_ids (same logic as the Python code)
                    const nodeIdList = [];
                    for (const nodeIdStr of nodeIdsStr.split(',')) {
                        const trimmed = nodeIdStr.trim();
                        if (trimmed) {
                            const nodeId = parseInt(trimmed, 10);
                            if (!isNaN(nodeId) && nodeId > 0) {
                                nodeIdList.push(nodeId);
                            } else if (trimmed !== "0") {
                                console.warn(`[AUNMultiBypassIndex] Invalid node_id in ${this.title}: '${trimmed}' - skipping`);
                            }
                        }
                    }
                    
                    if (nodeIdList.length === 0) {
                        return; // No valid node IDs
                    }
                    
                    // Execute for each node immediately
                    for (const nodeId of nodeIdList) {
                        const targetNode = app.graph.getNodeById(nodeId);
                        if (targetNode) {
                            // Set bypass state: 0 = active, 4 = bypassed
                            targetNode.mode = isActive ? 0 : 4; // On (true) = Active (0), Off (false) = Bypassed (4)
                        } else {
                            console.warn(`[AUNMultiBypassIndex] ${this.title} - ${switchNumber}: Node with ID ${nodeId} not found.`);
                        }
                    }
                    
                    // Send to backend for consistency (using existing bypass endpoint)
                    app.api.fetchApi("/AUN_save_bypass_states", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            node_ids: nodeIdList,
                            bypass_state: isActive // Backend expects is_active, which matches our switch state
                        })
                    }).catch(e => console.warn(`[AUNMultiBypassIndex] Could not notify backend for ${this.title}:`, e));
                    
                    app.graph.setDirtyCanvas(true, true);
                    
                } catch (error) {
                    console.error(`[AUNMultiBypassIndex] Error during immediate execution for ${this.title} ${switchNumber}:`, error);
                }
            };

            // Add instant index switching
            setTimeout(() => {
                const indexWidget = node.widgets.find(w => w.name === "Index");
                if (indexWidget) {
                    let lastValue = indexWidget.value;
                    const checkChange = () => {
                        if (indexWidget.value !== lastValue) {
                            lastValue = indexWidget.value;
                            const value = indexWidget.value;
                            console.log(`[AUNMultiBypassIndex] Index changed to ${value} via poll`);
                            const index = value;
                            for (let group = 1; group <= 10; group++) {
                                const isActive = (group === index);
                                const nodeIdsWidget = node.widgets.find(w => w.name === `node_ids_${group}`);
                                if (nodeIdsWidget) {
                                    node.executeBypassState(nodeIdsWidget.value, isActive, `Index-${group}`);
                                }
                            }
                        }
                    };
                    // Poll every 100ms for changes
                    setInterval(checkChange, 100);
                    console.log("[AUNMultiBypassIndex] Polling for index changes started");
                } else {
                    console.log("[AUNMultiBypassIndex] Index widget not found");
                }
            }, 2000);
        }
    }
});