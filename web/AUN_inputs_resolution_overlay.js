import { app } from "../../scripts/app.js";

const TARGET_CLASSES = new Set(["AUNInputsBasic"]);

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

function refreshLinkedValues(node) {
    try {
        node.__aun_wValue = undefined;
        node.__aun_hValue = undefined;
        const inputs = node?.inputs;
        if (!Array.isArray(inputs)) return;
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const linkId = input?.link;
            if (linkId == null) continue;
            const name = input?.name;
            const obj = node?.graph?.links?.[linkId];
            if (!obj) continue;
            const origin = app?.graph?.getNodeById?.(obj.origin_id);
            if (!origin) continue;
            const originSlot = obj.origin_slot;
            const raw = origin?.widgets?.[originSlot]?.value;
            if (raw != null) {
                const num = parseFloat(raw);
                if (!isNaN(num)) {
                    if (name === "width") node.__aun_wValue = num;
                    if (name === "height") node.__aun_hValue = num;
                }
            }
        }
    } catch(_) {}
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
        refreshLinkedValues(node);
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
        refreshLinkedValues(this);
        return r;
    };
    const origDisconnect = node.onDisconnectInput;
    node.onDisconnectInput = function (slot) {
        const r = typeof origDisconnect === "function" ? origDisconnect.apply(this, arguments) : undefined;
        refreshLinkedValues(this);
        return r;
    };

    node.__aun_resolution_overlay_hooked = true;
}

function setupNode(node) {
    if (!node) return;
    if (!TARGET_CLASSES.has(node.comfyClass) && !TARGET_CLASSES.has(node.type)) return;
    wrapWidgets(node);
    refreshLinkedValues(node);
    installOverlay(node);
    // Retry caching in case inputs not yet populated
    setTimeout(() => refreshLinkedValues(node), 100);
    setTimeout(() => refreshLinkedValues(node), 500);
    const graph = node.graph ?? app.graph;
    setTimeout(() => graph?.setDirtyCanvas(true, true), 0);
    setTimeout(() => graph?.setDirtyCanvas(true, true), 120);
}

app.registerExtension({
    name: "AUN.InputsResolutionOverlay",
    nodeCreated(node) { setupNode(node); },
    loadedGraphNode(node) { setupNode(node); },
});
