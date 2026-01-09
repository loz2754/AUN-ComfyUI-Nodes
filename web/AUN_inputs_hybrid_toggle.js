import { app } from "../../scripts/app.js";

const SOURCE_CHECKPOINT = "Checkpoint";
const SOURCE_DIFFUSION = "Diffusion model";
function debugLog(...args) {
    try {
        if (!(typeof window !== "undefined" && window.AUN_INPUTS_TOGGLE_DEBUG)) {
            return;
        }
    } catch (err) {
        return;
    }
    try {
        console.log("[AUNInputsHybridToggle]", ...args);
    } catch (err) {
        // ignore logging errors
    }
}
const CHECKPOINT_WIDGETS = ["ckpt_name", "clip_skip"];
const DIFFUSION_WIDGETS = ["diffusion_name", "clip_name", "clip_type", "vae_name"];
const WIDTH_MARGIN = 12;

function findWidget(node, name) {
    return node?.widgets?.find((widget) => widget?.name === name);
}

function resolveComboValue(widget) {
    if (!widget) {
        return undefined;
    }
    const raw = widget.value;
    if (typeof raw === "string") {
        return raw;
    }
    if (typeof raw === "number") {
        const candidates = [widget.options?.values, widget.options?.choices];
        for (const list of candidates) {
            if (!Array.isArray(list)) {
                continue;
            }
            if (raw >= 0 && raw < list.length) {
                const entry = list[raw];
                if (entry && typeof entry === "object" && "value" in entry) {
                    return entry.value;
                }
                return entry;
            }
        }
    }
    return raw;
}

function setWidgetHidden(node, name, hidden) {
    const widget = findWidget(node, name);
    if (!widget) {
        debugLog("Widget not found", name, "on", node?.title);
        return;
    }
    debugLog("setWidgetHidden", node?.title, name, hidden);
    widget.hidden = hidden;
    widget.flags = widget.flags || {};
    widget.flags.hidden = hidden;
    widget.flags.collapsed = hidden;
    if (hidden && typeof widget.__aun_originalComputeSize === "undefined") {
        widget.__aun_originalComputeSize = widget.computeSize;
    }
    if (typeof widget.__aun_originalComputeSize === "function") {
        widget.computeSize = function () {
            if (widget.hidden) {
                return [0, 0];
            }
            return widget.__aun_originalComputeSize?.apply(widget, arguments);
        };
    }
    node.widgets_dirty = true;
}
function resizeNode(node) {
    if (!node) {
        return;
    }
    if (typeof node.computeSize === "function") {
        try {
            const next = node.computeSize();
            if (node.size && typeof node.size.length === "number" && node.size.length >= 2) {
                node.size[1] = next[1];
            } else {
                node.size = [next[0] + WIDTH_MARGIN, next[1]];
            }
        } catch (err) {
            console.warn("AUNInputsHybrid: computeSize failed", err);
        }
    }
    const graph = node.graph ?? app.graph;
    graph?.setDirtyCanvas(true, true);
}

function forceClipSkipDefault(node) {
    const widget = findWidget(node, "clip_skip");
    if (!widget) {
        return;
    }
    if (widget.value === -1) {
        return;
    }
    widget.value = -1;
    if (typeof widget.callback === "function") {
        try {
            widget.callback(-1);
        } catch (err) {
            console.warn("AUNInputsHybrid: clip_skip callback failed", err);
        }
    }
    node.properties = node.properties || {};
    node.properties.clip_skip = -1;
}

function applyMode(node, mode) {
    const hideCheckpointWidgets = mode === SOURCE_DIFFUSION;
    const hideDiffusionWidgets = mode !== SOURCE_DIFFUSION;
    debugLog("applyMode", node?.title, mode, { hideCheckpointWidgets, hideDiffusionWidgets });

    for (const name of CHECKPOINT_WIDGETS) {
        setWidgetHidden(node, name, hideCheckpointWidgets);
    }
    for (const name of DIFFUSION_WIDGETS) {
        setWidgetHidden(node, name, hideDiffusionWidgets);
    }

    if (hideCheckpointWidgets) {
        forceClipSkipDefault(node);
    }

    resizeNode(node);
}

function setupNode(node) {
    if (!node || node.comfyClass !== "AUNInputsHybrid") {
        return;
    }
    debugLog("setupNode", node.title);
    const modelWidget = findWidget(node, "model_source");
    if (!modelWidget) {
        debugLog("model_source widget missing, retrying", node.title);
        setTimeout(() => setupNode(node), 50);
        return;
    }
    if (!modelWidget.__aun_hybrid_hooked) {
        const originalCallback = typeof modelWidget.callback === "function" ? modelWidget.callback : null;
        modelWidget.callback = (value) => {
            if (originalCallback) {
                try {
                    originalCallback(value);
                } catch (err) {
                    console.warn("AUNInputsHybrid: model_source callback failed", err);
                }
            }
            const resolved = resolveComboValue(modelWidget);
            debugLog("model_source changed", resolved, "raw", value);
            applyMode(node, resolved === SOURCE_DIFFUSION ? SOURCE_DIFFUSION : SOURCE_CHECKPOINT);
        };
        modelWidget.__aun_hybrid_hooked = true;
    }
    const initialResolved = resolveComboValue(modelWidget);
    debugLog("initial mode", node.title, initialResolved);
    const initialMode = initialResolved === SOURCE_DIFFUSION ? SOURCE_DIFFUSION : SOURCE_CHECKPOINT;
    applyMode(node, initialMode);
}

app.registerExtension({
    name: "AUN.InputsHybrid.Visibility",
    nodeCreated(node) {
        debugLog("nodeCreated", node?.title, node?.comfyClass);
        setupNode(node);
    },
    loadedGraphNode(node) {
        debugLog("loadedGraphNode", node?.title, node?.comfyClass);
        setupNode(node);
    },
});
