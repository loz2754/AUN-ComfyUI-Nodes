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
    loadedGraphNode(node) {
        setupNode(node);
    }
});

updateTrackedNodes();
