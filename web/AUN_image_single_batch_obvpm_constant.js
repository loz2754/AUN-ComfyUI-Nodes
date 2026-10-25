import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "AUN.ImageSingleBatch3.OBVPMConstant",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AUNImageSingleBatch3") return;
        nodeType.prototype.obvpmConstantWidget = "set";
        if (!Object.prototype.hasOwnProperty.call(nodeType.prototype, "obvpmConstantOutput")) {
            Object.defineProperty(nodeType.prototype, "obvpmConstantOutput", {
                configurable: true,
                get() {
                    const outs = this.outputs || [];
                    const idx = outs.findIndex((o) => String(o?.type ?? "") === "OBVPM_BUNDLE");
                    return idx >= 0 ? idx : (outs.length ? outs.length - 1 : 0);
                },
            });
        }
        const orig = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (orig) orig.apply(this, arguments);
        };
        nodeType.prototype.obvpmBundleNames = function (slot, path) {
            return ["image", "filename", "cleaned_filename"].slice();
        };
    },
});