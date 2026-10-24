import { app } from "../../scripts/app.js";

const BUNDLE_FIELDS = {
    AUNInputsBasic: ["model","clip","vae","ckpt_name","sampler","scheduler","cfg","steps","latent","width","height","seed","batch_size"],
    AUNInputs: ["model","clip","vae","ckpt_name","sampler","scheduler","cfg","steps","latent","width","height","seed","MainFolder","Filename","prefix","date_format","batch_size","name_mode"],
    AUNInputsRefine: ["model","clip","vae","refine_model","ckpt_name","ckpt_name_refine","sampler","scheduler","cfg","steps","latent","width","height","seed","MainFolder","Filename","prefix","date_format","batch_size","name_mode","speed_lora_ratio"],
    AUNInputsRefineBasic: ["model","clip","vae","refine_model","ckpt_name","ckpt_name_refine","sampler","scheduler","cfg","steps","latent","width","height","seed","batch_size","speed_lora_ratio"],
    AUNInputsDiffusers: ["model","clip","vae","model_name","sampler","scheduler","cfg","steps","latent","width","height","seed","MainFolder","Filename","prefix","date_format","batch_size","name_mode"],
    AUNInputsDiffusersBasic: ["model","clip","vae","model_name","sampler","scheduler","cfg","steps","latent","width","height","seed","batch_size"],
    AUNInputsDiffusersRefineBasic: ["model","clip","vae","refine_model","model_name","model_name_refine","sampler","scheduler","cfg","steps","latent","width","height","seed","batch_size","speed_lora_ratio"],
    AUNInputsHybrid: ["model","clip","vae","model_name","sampler","scheduler","cfg","steps","latent","width","height","seed","MainFolder","Filename","prefix","date_format","batch_size","name_mode"],
    AUNInputsWan22Basic: ["model_high","model_low","clip","vae","clip_vision","high_model_name","low_model_name","sampler","scheduler","cfg_high","cfg_low","boundary","sigma_shift","steps","seed","fps","frame_rate","frames","rife_multiplier","rife","latent","width","height","batch_size"],
    AUNInputsMiniMaxH3Basic: ["model","clip","vae_video","vae_audio","unet_name","sampler","scheduler","cfg","steps","seed","width","height","frames","fps","frame_rate","seconds","rife_multiplier","rife"],
    AUNImageToBundle: ["image","filename","cleaned_filename"],
};

function attach(node, name) {
    const fields = BUNDLE_FIELDS[name];
    if (!fields) return;
    node.obvpmBundleNames = function (slot, path) {
        return fields.slice();
    };
}

app.registerExtension({
    name: "AUNNodes.Inputs.BundleNames",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const name = nodeData.name;
        if (!BUNDLE_FIELDS[name]) return;
        nodeType.prototype.obvpmConstantWidget = "set";
        // Derive the bundle output slot from the node's actual outputs at
        // runtime, so it never drifts out of sync with RETURN_TYPES (and never
        // falls back to slot 0 / MODEL when a hardcoded number is stale).
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
            attach(this, name);
        };
        nodeType.prototype.obvpmBundleNames = function (slot, path) {
            return (BUNDLE_FIELDS[name] || []).slice();
        };
    }
});
