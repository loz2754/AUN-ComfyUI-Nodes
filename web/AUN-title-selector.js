import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Register the extension
app.registerExtension({
    name: "AUN.NodeTitleSelector",
    
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "AUNNodeTitleSelector") {
            console.log("Registering AUNNodeTitleSelector node");
            
            // Override the widget creation
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }
                
                console.log("AUNNodeTitleSelector created, converting widget to combo");
                
                // Find the title widget and convert to combo
                const widget = this.widgets.find(w => w.name === "selected_title");
                if (widget) {
                    // Store the original value
                    const originalValue = widget.value;
                    
                    // Remove the original widget
                    this.removeWidget(widget);
                    
                    // Add a combo widget
                    const newWidget = this.addWidget(
                        "combo", 
                        "selected_title", 
                        originalValue || "Select a node...", 
                        function(value) {
                            // This will be called when the value changes
                            console.log("Selected title:", value);
                        }, 
                        { values: ["Select a node..."] }
                    );
                    
                    console.log("Widget converted to combo");
                }
            };
        }
    }
});

// Listen for title updates
api.addEventListener("AUN_update_titles", (event) => {
    console.log("Received title update event:", event.detail);
    
    const { node_id, titles } = event.detail;
    
    // Find the node
    const node = app.graph._nodes_by_id[node_id];
    if (node) {
        // Find the title widget
        const widget = node.widgets.find(w => w.name === "selected_title");
        if (widget) {
            console.log("Updating widget options with titles:", titles);
            
            // Update the options
            widget.options.values = titles;
            
            // If current value isn't in the list, set to first option
            if (titles.length > 0 && !titles.includes(widget.value)) {
                widget.value = titles[0];
            }
            
            // Force widget update
            if (widget.callback) {
                widget.callback(widget.value);
            }
            
            // Force a redraw
            node.setDirtyCanvas(true, true);
        } else {
            console.log("Widget not found");
        }
    } else {
        console.log("Node not found:", node_id);
    }
});
