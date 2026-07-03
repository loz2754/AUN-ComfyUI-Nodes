import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const TARGET_CLASSES = new Set([
    "AUNInputsBasic",
    "AUNInputs",
    "AUNInputsRefine",
    "AUNInputsRefineBasic",
    "AUNInputsDiffusers",
    "AUNInputsDiffusersBasic",
    "AUNInputsDiffusersRefineBasic",
    "AUNInputsHybrid",
]);

const ASPECT_RATIOS = {
    "1:1 (Square)": [1, 1],
    "2:3 (Portrait Photo)": [2, 3],
    "3:2 (Photo)": [3, 2],
    "3:4 (Portrait Standard)": [3, 4],
    "4:3 (Standard)": [4, 3],
    "9:16 (Portrait Widescreen)": [9, 16],
    "16:9 (Widescreen)": [16, 9],
    "21:9 (Ultrawide)": [21, 9],
};

const PRESETS = {
    "512x512": [512, 512],
    "512x682": [512, 682],
    "512x768": [512, 768],
    "640x1536": [640, 1536],
    "720x720": [720, 720],
    "768x1024": [768, 1024],
    "768x1344": [768, 1344],
    "832x1216": [832, 1216],
    "896x1152": [896, 1152],
    "910x512": [910, 512],
    "952x512": [952, 512],
    "1024x512": [1024, 512],
    "1024x1024": [1024, 1024],
    "1224x512": [1224, 512],
};

function findWidget(node, name) {
    return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function resolveComboValue(widget) {
    if (!widget) return undefined;
    const raw = widget.value;
    if (typeof raw === "string") return raw;
    if (typeof raw === "number") {
        const candidates = [widget.options?.values, widget.options?.choices];
        for (const list of candidates) {
            if (!Array.isArray(list)) continue;
            if (raw >= 0 && raw < list.length) {
                const entry = list[raw];
                if (entry && typeof entry === "object" && "value" in entry) return entry.value;
                return entry;
            }
        }
    }
    return raw;
}

function getResolvedValue(node) {
    const inputs = node?.inputs;
    if (!Array.isArray(inputs)) return {};

    const myOutputs = app?.nodeOutputs?.[String(node.id)];
    if (myOutputs) {
        let w = myOutputs[9], h = myOutputs[10];
        if (w == null) w = myOutputs["9"] ?? myOutputs[String(9)];
        if (h == null) h = myOutputs["10"] ?? myOutputs[String(10)];
        if (w == null) w = myOutputs.width ?? myOutputs["width"];
        if (h == null) h = myOutputs.height ?? myOutputs["height"];
        if (w != null && h != null) {
            return { width: parseFloat(w), height: parseFloat(h) };
        }
    }

    const result = {};
    for (const input of inputs) {
        const linkId = input?.link;
        if (linkId == null) continue;
        const name = input?.name;
        if (name !== "width" && name !== "height") continue;
        const obj = node?.graph?.links?.[linkId];
        if (!obj) continue;
        const origin = app?.graph?.getNodeById?.(obj.origin_id);
        if (!origin) continue;
        const widget = findWidget(origin, name);
        if (widget?.value != null) result[name] = parseFloat(widget.value);
    }
    if (result.width != null && result.height != null) {
        return { width: result.width, height: result.height };
    }
    return {};
}

function refreshOverlay(node) {
    const resolved = getResolvedValue(node);
    if (resolved.width != null && resolved.height != null) {
        node.__aun_wValue = resolved.width;
        node.__aun_hValue = resolved.height;
    } else {
        node.__aun_wValue = undefined;
        node.__aun_hValue = undefined;
    }
}

function refreshAllOverlays() {
    const nodes = app.graph?._nodes;
    if (!nodes) return;
    for (const node of nodes) {
        if (!TARGET_CLASSES.has(node.comfyClass) && !TARGET_CLASSES.has(node.type)) continue;
        refreshOverlay(node);
        node.setDirtyCanvas?.(true, true);
    }
}

function computeLabel(node) {
    const aspectRatio = resolveComboValue(findWidget(node, "aspect_ratio"));
    const megapixels = parseFloat(findWidget(node, "megapixels")?.value) || 1.0;
    const multiple = parseInt(findWidget(node, "multiple")?.value) || 8;
    const aspectMode = resolveComboValue(findWidget(node, "aspect_mode"));

    let width = 720;
    let height = 720;

    if (ASPECT_RATIOS[aspectRatio]) {
        const [w_r, h_r] = ASPECT_RATIOS[aspectRatio];
        const totalPixels = megapixels * 1024 * 1024;
        const scale = Math.sqrt(totalPixels / (w_r * h_r));
        width = Math.round(w_r * scale / multiple) * multiple;
        height = Math.round(h_r * scale / multiple) * multiple;
    } else if (PRESETS[aspectRatio]) {
        [width, height] = PRESETS[aspectRatio];
    } else {
        const wLinked = node.__aun_wValue;
        const hLinked = node.__aun_hValue;
        width = (wLinked != null ? wLinked : parseFloat(findWidget(node, "width")?.value)) || 720;
        height = (hLinked != null ? hLinked : parseFloat(findWidget(node, "height")?.value)) || 720;
    }

    if (aspectMode === "Swap") {
        [width, height] = [height, width];
    }

    let label = `W:${width} H:${height}`;
    if (aspectMode === "Random") {
        label += " (random)";
    }
    return label;
}

function wrapWidget(node, widget) {
    if (!widget || widget.__aun_resolution_hooked) return;
    const original = widget.callback;
    widget.callback = function (value) {
        try { if (typeof original === "function") original.call(widget, value); } catch (e) {}
        refreshOverlay(node);
        const graph = node.graph ?? app.graph;
        graph?.setDirtyCanvas(true, true);
    };
    widget.__aun_resolution_hooked = true;
}

const TRIGGER_NAMES = ["aspect_ratio", "megapixels", "multiple", "width", "height", "aspect_mode"];

function wrapWidgets(node) {
    for (const name of TRIGGER_NAMES) {
        const widget = findWidget(node, name);
        if (widget) wrapWidget(node, widget);
    }
}

const OVERLAY_H = 14;

function installOverlay(node) {
    if (node.__aun_resolution_overlay_hooked) return;
    const origDrawFg = node.onDrawForeground;
    const origComputeSize = node.computeSize;

    node.computeSize = function () {
        const [w, h] = typeof origComputeSize === "function"
            ? origComputeSize.apply(this, arguments)
            : [this.size?.[0] ?? 200, 200];
        return [w, h + OVERLAY_H];
    };

    node.onDrawForeground = function (ctx) {
        if (typeof origDrawFg === "function") origDrawFg.apply(this, arguments);
        if (this.flags?.collapsed) return;

        const label = computeLabel(this);
        if (!label) return;

        const x = this.size[0] / 2;
        const y = this.size[1] - 5;

        ctx.save();
        ctx.font = "11px monospace";
        const textWidth = ctx.measureText(label).width;
        const padX = 6;
        const bgX = x - textWidth / 2 - padX;
        const bgY = y - 14 - 2;
        const bgW = textWidth + padX * 2;
        const bgH = 18;

        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, bgH, 4);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, x, y);
        ctx.restore();
    };

    const origConnect = node.onConnectInput;
    node.onConnectInput = function (slot, type, output, originNode, outputSlot) {
        const r = typeof origConnect === "function" ? origConnect.apply(this, arguments) : undefined;
        refreshOverlay(this);
        return r;
    };
    const origDisconnect = node.onDisconnectInput;
    node.onDisconnectInput = function (slot) {
        const r = typeof origDisconnect === "function" ? origDisconnect.apply(this, arguments) : undefined;
        refreshOverlay(this);
        return r;
    };

    node.__aun_resolution_overlay_hooked = true;
}

function refreshWithRedraw(node, delay) {
    setTimeout(() => {
        refreshOverlay(node);
        const graph = node.graph ?? app.graph;
        graph?.setDirtyCanvas(true, true);
    }, delay);
}

function setupNode(node) {
    if (!node) return;
    if (!TARGET_CLASSES.has(node.comfyClass) && !TARGET_CLASSES.has(node.type)) return;
    wrapWidgets(node);
    installOverlay(node);
    refreshWithRedraw(node, 0);
    refreshWithRedraw(node, 150);
    refreshWithRedraw(node, 500);
    refreshWithRedraw(node, 1500);
}

api.addEventListener("status", async ({ detail }) => {
    if (detail?.exec_info?.queue_remaining != null && detail.exec_info.queue_remaining === 0) {
        refreshAllOverlays();
    }
});

app.registerExtension({
    name: "AUN.InputsResolutionOverlay",
    nodeCreated(node) { setupNode(node); },
    loadedGraphNode(node) { setupNode(node); },
});
