import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "AUN.Bookmark",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AUNBookmark") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                this.title = "🔖";

                // Ensure zoom widget has correct precision
                const zoomWidget = this.widgets.find(w => w.name === "zoom");
                if (zoomWidget) {
                    zoomWidget.options = zoomWidget.options || {};
                    zoomWidget.options.precision = 3;
                    zoomWidget.options.step = 0.001;
                }
                
                // Keypress handler
                this.__AUN_onKeypress = (event) => {
                    // Don't trigger if typing in an input
                    const target = event.target;
                    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
                        return;
                    }
                    
                    const shortcutWidget = this.widgets.find(w => w.name === "shortcut_key");
                    const shortcut = (shortcutWidget?.value || "").toLowerCase().trim();
                    if (!shortcut) return;

                    // Support single character or "Digit1", "KeyA" etc if needed, but let's keep it simple
                    if (event.key.toLowerCase() === shortcut) {
                        this.__AUN_goToBookmark();
                        event.preventDefault();
                        event.stopPropagation();
                    }
                };

                this.__AUN_goToBookmark = () => {
                    const canvas = app.canvas;
                    if (!canvas || !canvas.ds) return;

                    const zoomWidget = this.widgets.find(w => w.name === "zoom");
                    const zoom = parseFloat(zoomWidget?.value || 1);
                    
                    // rgthree style: place node at top-left
                    // LiteGraph coordinate system: screen_pos = (world_pos * scale) + offset
                    // To have world_pos at (16, 40) on screen:
                    // 16 = (this.pos[0] * zoom) + offset[0]  => offset[0] = 16 - (this.pos[0] * zoom)
                    
                    canvas.ds.scale = zoom;
                    canvas.ds.offset[0] = 16 - (this.pos[0] * zoom);
                    canvas.ds.offset[1] = 40 - (this.pos[1] * zoom);
                    
                    canvas.setDirty(true, true);
                };

                window.addEventListener("keydown", this.__AUN_onKeypress);
            };

            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                if (onRemoved) onRemoved.apply(this, arguments);
                if (this.__AUN_onKeypress) {
                    window.removeEventListener("keydown", this.__AUN_onKeypress);
                }
            };
        }
    }
});
