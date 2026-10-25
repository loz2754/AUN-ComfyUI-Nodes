import { app } from "../../scripts/app.js";

const AUN_INPUT_CLASSES = new Set([
    "AUNInputs", "AUNInputsBasic", "AUNInputsRefine", "AUNInputsRefineBasic",
    "AUNInputsDiffusers", "AUNInputsDiffusersBasic", "AUNInputsDiffusersRefineBasic",
    "AUNInputsHybrid", "AUNInputsWan22Basic", "AUNInputsMiniMaxH3Basic",
    "AUNImageSingleBatch3", "AUNImageLoadResize", "AUNImageResize", "AUNManualAutoImageSwitch", "AUNKSamplerPlusv3", "AUNPromptCycler", "AUNMultiPromptCycler", "AUNWildcardAddToPrompt",
    "AUNTextIndexSwitch", "AUNTextIndexSwitch3", "AUNTextIndexSwitch4", "AUNTextIndexSwitch5", "AUNTextIndexSwitch5Diffusers",
    "AUNRandomTextIndexSwitch", "AUNRandomTextIndexSwitchV2",
]);

function resolveExecNode(root, execId) {
    const parts = String(execId).split(":");
    let graph = root;
    let node = null;
    for (let i = 0; i < parts.length; i++) {
        const n = graph?.getNodeById ? graph.getNodeById(Number(parts[i])) : null;
        if (!n) return null;
        if (i === parts.length - 1) { node = n; break; }
        if (n.subgraph) graph = n.subgraph; else return null;
    }
    return node;
}

function isAunSetter(node) {
    if (!node) return false;
    const cls = node.type ?? node.comfyClass;
    return AUN_INPUT_CLASSES.has(cls);
}

function slotForSetter(node) {
    try {
        const v = node?.obvpmConstantOutput;
        if (typeof v === "number") return v;
    } catch (e) {}
    const outs = node?.outputs || [];
    const idx = outs.findIndex((o) => String(o?.type ?? "") === "OBVPM_BUNDLE");
    return idx >= 0 ? idx : (outs.length ? outs.length - 1 : 0);
}

function fixPromptSlots(root, prompt) {
    if (!prompt || typeof prompt !== "object") return;
    for (const entry of Object.values(prompt)) {
        const inVal = entry?.inputs?.in;
        if (!Array.isArray(inVal) || inVal.length !== 2) continue;
        const [sid, slot] = inVal;
        if (slot !== 0) continue;
        const setterNode = resolveExecNode(root, sid);
        if (!isAunSetter(setterNode)) continue;
        const correct = slotForSetter(setterNode);
        if (correct !== 0) inVal[1] = correct;
    }
}

let _gtp = app.graphToPrompt;
let _wrapped = null;

function wrapGraphToPrompt() {
    const cur = app.graphToPrompt;
    if (cur && cur.__AUN_OBVPM_SLOT_FIX) return;
    if (typeof cur !== "function") return;
    const base = cur;
    const wrapped = async function (...args) {
        const result = await base.apply(this, args);
        try {
            const root = args[0]?.serialize ? args[0] : (app.rootGraph ?? app.graph);
            fixPromptSlots(root, result?.output);
        } catch (e) {}
        return result;
    };
    wrapped.__AUN_OBVPM_SLOT_FIX = true;
    _gtp = wrapped;
}

try {
    Object.defineProperty(app, "graphToPrompt", {
        configurable: true,
        get() { return _gtp; },
        set(v) {
            _gtp = v;
            queueMicrotask(wrapGraphToPrompt);
        },
    });
} catch (e) {
    wrapGraphToPrompt();
}

queueMicrotask(() => { wrapGraphToPrompt(); patchKJ(); });

function patchKJ() {
    const GetNode = globalThis.LiteGraph?.registered_node_types?.["GetNode"];
    if (!GetNode || GetNode.prototype.__AUN_OBVPM_SLOT_FIX) return;
    GetNode.prototype.__AUN_OBVPM_SLOT_FIX = true;
    const base = GetNode.prototype.resolveVirtualOutput;
    GetNode.prototype.resolveVirtualOutput = function (slot) {
        try {
            const hit = (typeof this.findSetter === "function") ? this.findSetter(this.graph) : null;
            if (hit && isAunSetter(hit)) {
                return { node: hit, slot: slotForSetter(hit) };
            }
        } catch (e) {}
        return base?.apply(this, arguments);
    };
}

app.registerExtension({
    name: "AUN.obvpmSlotFix",
    setup() {
        wrapGraphToPrompt();
        patchKJ();
    },
    beforeRegisterNodeDef() {
        wrapGraphToPrompt();
    },
});
