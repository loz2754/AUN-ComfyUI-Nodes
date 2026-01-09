import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "AUN.TextSwitch.DynamicLabels",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "TextSwitch2InputWithTextOutput") return;

        // Force the 'choose' input to be treated as a combo in the UI
        // even though the backend sees it as a STRING for validation purposes.
        if (nodeData.input && nodeData.input.required && nodeData.input.required.choose) {
            nodeData.input.required.choose = [["Text A", "Text B", "None"], { default: "None" }];
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            const labelA = this.widgets.find(w => w.name === "label_a");
            const labelB = this.widgets.find(w => w.name === "label_b");
            const choose = this.widgets.find(w => w.name === "choose");

            if (!labelA || !labelB || !choose) return;

            const updateLabels = () => {
                const valA = (labelA.value || "Text A").trim();
                const valB = (labelB.value || "Text B").trim();
                
                const oldVal = choose.value;
                
                // Ensure it's a combo and update options
                choose.type = "combo";
                choose.options = choose.options || {};
                const oldOptions = choose.options.values || [];
                
                const newOptions = [valA, valB, "None"];
                choose.options.values = newOptions;
                
                // If the current selection was one of the old labels, update it to the new label
                if (oldOptions.length >= 2) {
                    if (oldVal === oldOptions[0]) {
                        choose.value = valA;
                    } else if (oldVal === oldOptions[1]) {
                        choose.value = valB;
                    }
                }
                
                // Ensure the current value is valid within the new options
                if (!newOptions.includes(choose.value)) {
                    // If it's not in the list (e.g. after a manual edit or first load), 
                    // we don't force it to None unless it's empty to avoid losing state
                    if (!choose.value) choose.value = "None";
                }
                
                this.setDirtyCanvas(true, true);
            };

            // Hook into label changes
            const oldCbA = labelA.callback;
            labelA.callback = (v) => {
                if (oldCbA) oldCbA.apply(labelA, [v]);
                updateLabels();
            };

            const oldCbB = labelB.callback;
            labelB.callback = (v) => {
                if (oldCbB) oldCbB.apply(labelB, [v]);
                updateLabels();
            };

            // Initial update
            setTimeout(() => updateLabels(), 0);
        };
    }
});
