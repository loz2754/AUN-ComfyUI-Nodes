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

            // --- Compact Mode Enhancement ---
            // Add a compact mode property and toggle
            if (this.properties === undefined) this.properties = {};
            if (this.properties._AUN_compactMode === undefined) this.properties._AUN_compactMode = false;

            // Add a right-click menu to toggle compact mode
            const origGetMenuOptions = this.getMenuOptions;
            this.getMenuOptions = function () {
                const options = origGetMenuOptions ? origGetMenuOptions.apply(this, arguments) : [];
                options.push(null);
                options.push({
                    content: this.properties._AUN_compactMode ? "Disable Compact Mode" : "Enable Compact Mode",
                    callback: () => {
                        this.properties._AUN_compactMode = !this.properties._AUN_compactMode;
                        if (typeof updateCompactMode === "function") updateCompactMode();
                        this.setDirtyCanvas(true, true);
                    }
                });
                return options;
            };

            // Hide all widgets except 'choose' in compact mode
            const updateCompactMode = () => {
                const compact = !!this.properties._AUN_compactMode;
                this.widgets.forEach(w => {
                    if (w.name === "choose") {
                        w.hidden = false;
                        if (w.options) w.options.noDraw = false;
                        if (w._AUN_origLabel !== undefined) w.label = w._AUN_origLabel;
                        if (w._AUN_origValue !== undefined) w.value = w._AUN_origValue;
                    } else {
                        w.hidden = false;
                        if (!w.options) w.options = {};
                        w.options.noDraw = false;
                        // Save original label and value
                        if (w._AUN_origLabel === undefined) w._AUN_origLabel = w.label;
                        if (w._AUN_origValue === undefined) w._AUN_origValue = w.value;
                        if (compact) {
                            w.label = "";
                            w.value = "";
                        } else {
                            w.label = w._AUN_origLabel;
                            w.value = w._AUN_origValue;
                        }
                    }
                });
                // Set a fixed height in compact mode, restore original otherwise
                if (compact) {
                    // Override computeSize to force minimum height in compact mode
                    this._AUN_origComputeSize = this._AUN_origComputeSize || this.computeSize;
                    this.computeSize = function() {
                        const slotCount = (this.inputs?.length || 0) + (this.outputs?.length || 0);
                        const minHeight = 24 + slotCount * 16 + 24; // 24 for title, 16 per slot, 24 padding
                        return [this.size ? this.size[0] : 210, Math.max(120, minHeight)];
                    };
                    var currentWidth = this.size ? this.size[0] : 210;
                    this.setSize(this.computeSize());
                } else {
                    // Restore original computeSize
                    if (this._AUN_origComputeSize) {
                        this.computeSize = this._AUN_origComputeSize;
                    }
                    if (typeof this.computeSize === "function") {
                        const computed = this.computeSize();
                        this.setSize([currentWidth, computed[1]]);
                    } else {
                        this.setSize([this.size[0], 180]); // fallback default
                    }
                }
                this.setDirtyCanvas(true, true);
                // Force slot positions to update immediately
                if (typeof this.updateConnectionsPos === "function") {
                    this.updateConnectionsPos();
                }
                if (this.graph && typeof this.graph._version === "number") {
                    this.graph._version++;
                }
            };

            // --- Widget tracking and hidden-aware logic (from AUN_universal_instant) ---
            this.__AUN_widgetLookup = new Map();
            this.__AUN_allWidgets = [];
            this.widgets.forEach((widget) => {
                this.__AUN_widgetLookup.set(widget.name, widget);
                this.__AUN_allWidgets.push(widget);
                if (!widget.__AUN_hiddenAware) {
                    const origCompute = typeof widget.computeSize === "function" ? widget.computeSize : null;
                    widget.__AUN_hiddenAware = true;
                    widget.computeSize = function(...args) {
                        if (this.hidden) return [args[0]?.[0] || 210, 0];
                        return origCompute ? origCompute.apply(this, args) : [args[0]?.[0] || 210, 24];
                    };
                }
            });
            const getWidget = (name) => this.__AUN_widgetLookup.get(name);
            // --- End widget tracking ---

            // --- Compact mode refresh logic (from AUN_universal_instant) ---
            this.__AUN_refreshWidgets = () => {
                const compact = !!this.properties._AUN_compactMode;
                this.__AUN_allWidgets.forEach(w => {
                    if (w.name === "choose") {
                        w.hidden = false;
                    } else {
                        w.hidden = compact;
                    }
                });
                this.setDirtyCanvas(true, true);
                // Always set a minimum height in compact mode
                let currentWidth = this.size ? this.size[0] : 210;
                if (compact) {
                    this.setSize([currentWidth, 80]); // 80px minimum height
                } else {
                    if (typeof this.computeSize === "function") {
                        const computed = this.computeSize();
                        this.setSize([currentWidth, computed[1]]);
                    }
                }
            };
            // --- End compact mode refresh logic ---

            // Patch widget add/remove to always update compact mode
            const origAddWidget = this.addWidget;
            this.addWidget = function () {
                const result = origAddWidget.apply(this, arguments);
                this.__AUN_refreshWidgets();
                return result;
            };
            const origRemoveWidget = this.removeWidget;
            this.removeWidget = function () {
                const result = origRemoveWidget.apply(this, arguments);
                this.__AUN_refreshWidgets();
                return result;
            };

            // Initial update
            setTimeout(() => {
                updateLabels();
                this.__AUN_refreshWidgets();
            }, 0);

            // Also update compact mode when toggled
            this.onPropertyChanged = (name, value) => {
                if (name === "_AUN_compactMode") {
                    this.__AUN_refreshWidgets();
                    this.setDirtyCanvas(true, true);
                }
            };

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

            // --- Robust double-click compact mode toggle ---
            // Attach at prototype level to avoid being overwritten
            if (!nodeType.prototype._AUN_dblClickPatch) {
                nodeType.prototype._AUN_dblClickPatch = true;
                nodeType.prototype.onDblClick = function(e, pos, graphcanvas) {
                    // Allow double-click anywhere below the title bar (y >= 20)
                    if (pos && pos[1] >= 0) {
                        this.properties._AUN_compactMode = !this.properties._AUN_compactMode;
                        this.__AUN_refreshWidgets();
                        this.setDirtyCanvas(true, true);
                        return true;
                    }
                    return false;
                };
            }

            // Expose updateCompactMode for prototype use
            this.updateCompactMode = updateCompactMode;

            // Remove any previous dummy widget workaround
            if (this._AUN_dummyWidget) {
                const idx = this.widgets.indexOf(this._AUN_dummyWidget);
                if (idx !== -1) this.widgets.splice(idx, 1);
                this._AUN_dummyWidget = undefined;
            }

            // --- Reorder widgets and slots to: text_a, text_b, label_a, label_b, choose ---
            const desiredOrder = ["text_a", "text_b", "label_a", "label_b", "choose"];
            this.widgets.sort((a, b) => {
                const ia = desiredOrder.indexOf(a.name);
                const ib = desiredOrder.indexOf(b.name);
                if (ia === -1 && ib === -1) return 0;
                if (ia === -1) return 1;
                if (ib === -1) return -1;
                return ia - ib;
            });
            // Also reorder inputs if possible
            if (Array.isArray(this.inputs)) {
                this.inputs.sort((a, b) => {
                    const ia = desiredOrder.indexOf(a.name);
                    const ib = desiredOrder.indexOf(b.name);
                    if (ia === -1 && ib === -1) return 0;
                    if (ia === -1) return 1;
                    if (ib === -1) return -1;
                    return ia - ib;
                });
            }
            // In compact mode, move label_a and label_b inputs to the end of the inputs array
            if (Array.isArray(this.inputs)) {
                const compact = !!this.properties._AUN_compactMode;
                // In compact mode, move label_a and label_b inputs to the end of the inputs array
                if (Array.isArray(this.inputs)) {
                    const slotOrder = compact
                        ? ["text_a", "text_b", "choose", "label_a", "label_b"]
                        : ["text_a", "text_b", "label_a", "label_b", "choose"];
                    this.inputs.sort((a, b) => {
                        const ia = slotOrder.indexOf(a.name);
                        const ib = slotOrder.indexOf(b.name);
                        if (ia === -1 && ib === -1) return 0;
                        if (ia === -1) return 1;
                        if (ib === -1) return -1;
                        return ia - ib;
                    });
                }
            }
        };
    }
});
