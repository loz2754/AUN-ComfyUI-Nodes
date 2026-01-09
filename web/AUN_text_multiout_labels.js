import { app } from "../../scripts/app.js";

function updateInputLabels(node) {
    // This function is specific to AUNGetNodeTitles, so no class check needed inside.
    for (let i = 1; i <= 10; i++) {
        const inputSlot = node.inputs?.find(slot => slot.name === `node_${i}`);
        if (!inputSlot) continue;

        if (inputSlot.link != null) {
            const link = app.graph.links[inputSlot.link];
            if (link) {
                const originNode = app.graph.getNodeById(link.origin_id);
                if (originNode) {
                    // Use node title, or fallback to node type, just like the python backend
                    inputSlot.label = originNode.title || originNode.type;
                }
            }
        } else {
            // Reset to default label if not connected
            inputSlot.label = `node_${i}`;
        }
    }
    // Request a redraw to show the new labels
    node.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "AUN.GetNodeTitles.Labels",
    nodeCreated(node) {
        if (node.comfyClass === "AUNGetNodeTitles") {
            updateInputLabels(node);
        }
    },
    nodeInputConnected(node, inputSlot, linkInfo) {
        if (node.comfyClass === "AUNGetNodeTitles") {
            updateInputLabels(node);
        }
    },
    nodeInputDisconnected(node, inputSlot) {
        if (node.comfyClass === "AUNGetNodeTitles") {
            updateInputLabels(node);
        }
    },
    loadedGraphNode(node) {
        if (node.comfyClass === "AUNGetNodeTitles") {
            updateInputLabels(node);
        }
    }
});

// This ensures that if a connected node's title is changed, our input label updates.
let lastTitles = {};
function pollForTitleChanges() {
    if (app?.graph?._nodes) {
        for (const node of app.graph._nodes) {
            if (node.title !== lastTitles[node.id]) {
                lastTitles[node.id] = node.title;
                // If a title changed, check all our nodes and update them
                app.graph._nodes.forEach(n => {
                    if (n.comfyClass === "AUNGetNodeTitles") updateInputLabels(n);
                });
            }
        }
    }
    requestAnimationFrame(pollForTitleChanges);
}
pollForTitleChanges();
