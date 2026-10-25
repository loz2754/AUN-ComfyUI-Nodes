import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "AUN.WildcardAddToPrompt.OBVPMConstant",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "AUNWildcardAddToPrompt") return;
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
        nodeType.prototype.obvpmBundleNames = function (slot, path) {
            return ["prompt", "populated_text"].slice();
        };
    },
});