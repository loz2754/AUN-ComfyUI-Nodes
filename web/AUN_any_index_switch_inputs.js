import { app } from "../../scripts/app.js";

const MAX_INPUTS = 20;
const MIN_INPUTS = 2;
const VALUE_PREFIX = "value";
const trackedNodes = new Set();

function clampInputCount(value) {
    if (Number.isFinite(value)) {
        return Math.min(MAX_INPUTS, Math.max(MIN_INPUTS, Math.floor(value)));
    }
    return MIN_INPUTS;
}

function getVisibleWidget(node) {
    return node.widgets?.find((w) => w.name === "visible_inputs");
}

function getIndexWidget(node) {
    return node.widgets?.find((w) => w.name === "index");
}

function getWidgetByName(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

function ensureWidgetHook(node) {
    const widget = getVisibleWidget(node);
    if (!widget || widget.__aun_hooked) {
        return;
    }

    const originalCallback = typeof widget.callback === "function" ? widget.callback : null;
    widget.__aun_last_confirmed = clampInputCount(widget.value ?? MIN_INPUTS);
    widget.callback = (value) => {
        if (widget.__aun_block) {
            return;
        }
        const target = clampInputCount(value);
        const current = node.__aun_visible_inputs ?? widget.__aun_last_confirmed ?? target;
        if (target < current && hasLinkedInputsAbove(node, target)) {
            const proceed = window.confirm(
                `Reducing visible inputs to ${target} will disconnect slots above ${target}. Continue?`
            );
            if (!proceed) {
                widget.__aun_block = true;
                widget.value = current;
                widget.__aun_block = false;
                (node.graph ?? app.graph)?.setDirtyCanvas(true, true);
                return;
            }
        }
        widget.__aun_last_confirmed = target;
        if (originalCallback) {
            originalCallback(target);
        }
        scheduleUpdate(node, target);
        syncIndexWidget(node, target);
    };
    widget.__aun_hooked = true;
}

function scheduleUpdate(node, nextValue) {
    if (!node) {
        return;
    }
    if (Number.isFinite(nextValue)) {
        node.__aun_pending_visible = clampInputCount(nextValue);
    }
    trackedNodes.add(node);
}

function applyInputSockets(node, desiredInputs) {
    if (!node || node.comfyClass !== "AUNAnyIndexSwitch") {
        return;
    }

    const target = clampInputCount(desiredInputs);
    const inputs = node.inputs ?? [];
    let changed = false;

    for (let i = inputs.length - 1; i >= 0; i--) {
        const input = inputs[i];
        if (!input || typeof input.name !== "string") {
            continue;
        }
        if (!input.name.startsWith(VALUE_PREFIX)) {
            continue;
        }
        const suffix = parseInt(input.name.substring(VALUE_PREFIX.length), 10);
        if (Number.isFinite(suffix) && suffix > target) {
            node.removeInput(i);
            changed = true;
        }
    }

    for (let i = 1; i <= target; i++) {
        const name = `${VALUE_PREFIX}${i}`;
        if (!node.inputs?.some((input) => input?.name === name)) {
            node.addInput(name, "*");
            changed = true;
        }
    }

    if (changed) {
        resizeNode(node);
        updateInputLabels(node);
    }
}

function resizeNode(node) {
    if (typeof node?.computeSize === "function") {
        try {
            const newSize = node.computeSize();
            if (node.size && typeof node.size.length === "number" && node.size.length >= 2) {
                node.size[1] = newSize[1];
            } else {
                node.size = newSize;
            }
        } catch (err) {
            console.warn("AUNAnyIndexSwitch: computeSize failed", err);
        }
    }
    const graph = node.graph ?? app.graph;
    if (graph) {
        if (typeof graph._needs_size_update !== "undefined") {
            graph._needs_size_update = true;
        }
        graph.setDirtyCanvas(true, true);
    }
}

function hasLinkedInputsAbove(node, target) {
    const inputs = node.inputs ?? [];
    for (const input of inputs) {
        if (!input || typeof input.name !== "string" || input.link == null) {
            continue;
        }
        if (!input.name.startsWith(VALUE_PREFIX)) {
            continue;
        }
        const suffix = parseInt(input.name.substring(VALUE_PREFIX.length), 10);
        if (Number.isFinite(suffix) && suffix > target) {
            return true;
        }
    }
    return false;
}

function updateInputLabels(node) {
    if (!node || node.comfyClass !== "AUNAnyIndexSwitch") return;
    const graph = node.graph || app.graph;
    if (!graph) return;

    const labelMode = getWidgetByName(node, "label_mode")?.value || "Node Title";

    for (let i = 1; i <= MAX_INPUTS; i++) {
        const slot = node.inputs?.find((s) => s.name === `${VALUE_PREFIX}${i}`);
        if (!slot) continue;

        if (slot.link != null) {
            const links = graph.links;
            const link = links?.get ? links.get(slot.link) : links?.[slot.link];
            if (link) {
                const srcNode = graph.getNodeById ? graph.getNodeById(link.origin_id) : null;
                if (srcNode) {
                    if (labelMode === "Slot Label") {
                        const originSlot = link.origin_slot;
                        const output = srcNode.outputs?.[originSlot];
                        slot.label = output?.label || output?.name || `${VALUE_PREFIX}${i}`;
                    } else {
                        slot.label = srcNode.title || srcNode.type || `${VALUE_PREFIX}${i}`;
                    }
                    continue;
                }
            }
        }
        slot.label = `${VALUE_PREFIX}${i}`;
    }
    if (app.canvas) {
        app.canvas.setDirty(true);
        app.canvas.draw(true, true);
    }
}

function updateTrackedNodes() {
    for (const node of Array.from(trackedNodes)) {
        if (!node || node.type === undefined) {
            trackedNodes.delete(node);
            continue;
        }

        const widget = getVisibleWidget(node);
        const widgetValue = widget ? clampInputCount(widget.value) : MIN_INPUTS;
        const pendingValue = node.__aun_pending_visible;
        const desired = clampInputCount(pendingValue ?? widgetValue);

        if (node.__aun_visible_inputs !== desired) {
            node.__aun_visible_inputs = desired;
            applyInputSockets(node, desired);
            syncIndexWidget(node, desired);
        }

        node.__aun_pending_visible = undefined;
    }

    requestAnimationFrame(updateTrackedNodes);
}

function setupNode(node) {
    if (!node || node.comfyClass !== "AUNAnyIndexSwitch") {
        return;
    }
    ensureWidgetHook(node);
    node.__aun_visible_inputs = undefined;
    const widgetValue = clampInputCount(getVisibleWidget(node)?.value ?? MIN_INPUTS);
    scheduleUpdate(node, widgetValue);
    syncIndexWidget(node, widgetValue);

    const labelModeWidget = getWidgetByName(node, "label_mode");
    if (labelModeWidget && !labelModeWidget.__aun_label_hooked) {
        labelModeWidget.__aun_label_hooked = true;
        const origCb = labelModeWidget.callback;
        labelModeWidget.callback = function (value) {
            if (origCb) origCb.call(this, value);
            updateInputLabels(node);
        };
    }

    setTimeout(() => updateInputLabels(node), 0);
}

function syncIndexWidget(node, maxVisible) {
    const indexWidget = getIndexWidget(node);
    if (!indexWidget) {
        return;
    }
    const clampedValue = Math.min(indexWidget.value ?? 1, maxVisible);
    if (typeof indexWidget.options === "object") {
        indexWidget.options = {
            ...indexWidget.options,
            max: maxVisible,
        };
    } else {
        indexWidget.options = { max: maxVisible };
    }
    if (clampedValue !== indexWidget.value) {
        indexWidget.value = clampedValue;
        if (typeof indexWidget.callback === "function") {
            indexWidget.callback(clampedValue);
        }
    }
}

app.registerExtension({
    name: "AUN.AnyIndexSwitch.InputLimiter",
    nodeCreated(node) {
        setupNode(node);
    },
    nodeInputConnected(node, inputSlot) {
        if (node.comfyClass === "AUNAnyIndexSwitch") {
            updateInputLabels(node);
        }
    },
    nodeInputDisconnected(node, inputSlot) {
        if (node.comfyClass === "AUNAnyIndexSwitch") {
            updateInputLabels(node);
        }
    },
    loadedGraphNode(node) {
        setupNode(node);
    }
});

let lastTitles = {};
function pollTitles() {
    if (app && app.graph && app.graph._nodes) {
        for (const node of app.graph._nodes) {
            if (node.title !== lastTitles[node.id]) {
                lastTitles[node.id] = node.title;
                for (const n of app.graph._nodes) {
                    if (n.comfyClass === "AUNAnyIndexSwitch") {
                        updateInputLabels(n);
                    }
                }
                if (app.canvas) {
                    app.canvas.setDirty(true, true);
                    app.canvas.draw(true, true);
                }
            }
        }
    }
    requestAnimationFrame(pollTitles);
}
pollTitles();

updateTrackedNodes();
