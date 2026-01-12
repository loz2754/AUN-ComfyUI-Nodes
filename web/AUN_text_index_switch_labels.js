import { app } from "../../scripts/app.js";

const MAX_INPUTS = 20;
const MIN_INPUTS = 2;
const VALUE_PREFIX = "text";
const NODE_WIDGET_BOUNDARIES = {
    AUNTextIndexSwitch: ["index"],
    AUNRandomTextIndexSwitch: ["minimum", "maximum", "select"],
};
const TEXT_SWITCH_CLASSES = new Set(Object.keys(NODE_WIDGET_BOUNDARIES));
const trackedTextNodes = new Set();

function clampInputCount(value) {
    if (Number.isFinite(value)) {
        return Math.min(MAX_INPUTS, Math.max(MIN_INPUTS, Math.floor(value)));
    }
    return MIN_INPUTS;
}

function getVisibleWidget(node) {
    return node.widgets?.find((w) => w.name === "visible_inputs");
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
        if (target < current && hasLinkedTextInputsAbove(node, target)) {
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
        scheduleTextNodeUpdate(node, target);
        syncBoundedWidgets(node, target);
    };
    widget.__aun_hooked = true;
}

function scheduleTextNodeUpdate(node, nextValue) {
    if (!node) {
        return;
    }
    if (Number.isFinite(nextValue)) {
        node.__aun_pending_visible = clampInputCount(nextValue);
    }
    trackedTextNodes.add(node);
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
            console.warn("AUNTextIndexSwitch: computeSize failed", err);
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

function applyVisibleInputs(node, desiredInputs) {
    if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
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
            node.addInput(name, "STRING");
            changed = true;
        }
    }

    if (changed) {
        updateInputLabels(node);
        resizeNode(node);
    }
}

function updateTrackedTextNodes() {
    for (const node of Array.from(trackedTextNodes)) {
        if (!node || node.type === undefined) {
            trackedTextNodes.delete(node);
            continue;
        }

        const widget = getVisibleWidget(node);
        const widgetValue = widget ? clampInputCount(widget.value) : MIN_INPUTS;
        const pendingValue = node.__aun_pending_visible;
        const desired = clampInputCount(pendingValue ?? widgetValue);

        if (node.__aun_visible_inputs !== desired) {
            node.__aun_visible_inputs = desired;
            applyVisibleInputs(node, desired);
            syncBoundedWidgets(node, desired);
        }

        node.__aun_pending_visible = undefined;
    }

    requestAnimationFrame(updateTrackedTextNodes);
}

function syncBoundedWidgets(node, maxVisible) {
    const widgetNames = NODE_WIDGET_BOUNDARIES[node?.comfyClass];
    if (!widgetNames || !node?.widgets) {
        return;
    }

    const clampValue = (value, min = 1, max = maxVisible) => {
        const numeric = Number.isFinite(value) ? value : min;
        return Math.min(Math.max(numeric, min), max);
    };

    if (node.comfyClass === "AUNRandomTextIndexSwitch") {
        const minWidget = getWidgetByName(node, "minimum");
        const maxWidget = getWidgetByName(node, "maximum");
        const selectWidget = getWidgetByName(node, "select");

        const minVal = clampValue(minWidget?.value ?? 1);
        const maxValRaw = clampValue(maxWidget?.value ?? maxVisible, minVal);
        const maxVal = Math.max(minVal, maxValRaw);
        const selectVal = clampValue(selectWidget?.value ?? minVal, minVal, maxVal);

        updateWidget(minWidget, minVal, maxVisible);
        updateWidget(maxWidget, maxVal, maxVisible);
        updateWidget(selectWidget, selectVal, maxVisible, minVal);
        return;
    }

    for (const name of widgetNames) {
        const widget = getWidgetByName(node, name);
        if (!widget) {
            continue;
        }
        const value = clampValue(widget.value ?? 1);
        updateWidget(widget, value, maxVisible);
    }
}

function updateWidget(widget, value, maxVisible, minValue = 1) {
    if (!widget) {
        return;
    }
    const options = typeof widget.options === "object" ? { ...widget.options } : {};
    options.max = maxVisible;
    if (options.min == null || options.min < minValue) {
        options.min = minValue;
    }
    widget.options = options;
    if (widget.value !== value) {
        widget.value = value;
        if (typeof widget.callback === "function") {
            widget.callback(value);
        }
    }
}

function hasLinkedTextInputsAbove(node, target) {
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

function setupTextSwitch(node) {
    if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
        return; 
    }
    ensureWidgetHook(node);
    node.__aun_visible_inputs = undefined;
    const widgetValue = clampInputCount(getVisibleWidget(node)?.value ?? MIN_INPUTS);
    scheduleTextNodeUpdate(node, widgetValue);
    syncBoundedWidgets(node, widgetValue);
}

function updateInputLabels(node) {
    if (!node || !TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
        return;
    }
    const graph = node.graph || app.graph;

    for (let i = 1; i <= MAX_INPUTS; i++) {
        const inputSlot = node.inputs?.find((slot) => slot.name === `${VALUE_PREFIX}${i}`);
        if (!inputSlot) {
            continue;
        }

        if (inputSlot.link != null) {
            const link = graph.links[inputSlot.link];
            if (link) {
                const originNode = graph.getNodeById(link.origin_id);
                if (originNode && originNode.title) {
                    inputSlot.label = originNode.title;
                }
            }
        } else {
            inputSlot.label = `${VALUE_PREFIX}${i}`;
        }
    }
    app.canvas.setDirty(true);
    app.canvas.draw(true, true);
}

app.registerExtension({
    name: "AUN.TextIndexSwitch.Labels",
    nodeCreated(node) {
        if (TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
            setupTextSwitch(node);
        }
        updateInputLabels(node);
    },
    nodeInputConnected(node, inputSlot, linkInfo) {
        updateInputLabels(node);
    },
    nodeInputDisconnected(node, inputSlot) {
        updateInputLabels(node);
    },
    loadedGraphNode(node) {
        if (TEXT_SWITCH_CLASSES.has(node.comfyClass)) {
            setupTextSwitch(node);
        }
        updateInputLabels(node);
    }
});

let lastTitles = {};
function pollTitles() {
    if (app && app.graph && app.graph._nodes) {
        for (const node of app.graph._nodes) {
            if (node.title !== lastTitles[node.id]) {
                lastTitles[node.id] = node.title;
                for (const n of app.graph._nodes) {
                    if (TEXT_SWITCH_CLASSES.has(n.comfyClass)) {
                        updateInputLabels(n);
                    }
                }
                app.canvas.setDirty(true, true);
                app.canvas.draw(true, true);
            }
        }
    }
    requestAnimationFrame(pollTitles);
}
pollTitles();

updateTrackedTextNodes();
