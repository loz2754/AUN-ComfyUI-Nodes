import { app } from "../../scripts/app.js";

const BUNDLE_NAMES = {
    AUNTextIndexSwitch: ["text", "label"],
    AUNTextIndexSwitch3: ["text", "label", "index"],
    AUNTextIndexSwitch4: ["text", "label", "index"],
    AUNTextIndexSwitch5: ["text", "label", "index", "model", "sampler", "scheduler", "cfg", "steps", "seed"],
    AUNTextIndexSwitch5Diffusers: ["text", "label", "index", "diffusion_name", "clip_name", "vae_name", "clip_type", "sampler", "scheduler", "cfg", "steps", "seed"],
    AUNRandomTextIndexSwitch: ["text", "label", "index"],
    AUNRandomTextIndexSwitchV2: ["text", "label", "index", "prefixed_label"],
};

app.registerExtension({
    name: "AUN.TextIndexSwitches.OBVPMConstant",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const fields = BUNDLE_NAMES[nodeData.name];
        if (!fields) return;
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
            return fields.slice();
        };
    },
});