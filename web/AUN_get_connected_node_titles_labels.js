import { app } from "../../scripts/app.js";

const MAX_INPUTS = 10;
const MIN_INPUTS = 1;
const NODE_PREFIX = "node_";
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
        if (target < current && (hasLinkedInputsAbove(node, target) || hasLinkedOutputsAbove(node, target))) {
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

function rebuildOutputSockets(node) {
    const visibleInputs = clampInputCount(getVisibleWidget(node)?.value ?? MIN_INPUTS);
    const expectedCount = visibleInputs + 1;
    const currentCount = node.outputs?.length ?? 0;

    if (currentCount === expectedCount) return false;

    const graph = node.graph || app.graph;
    if (!graph) return false;

    // Save selected_title connections (it's always the last output)
    const savedSelectedConnections = [];
    const outputs = node.outputs ?? [];
    const selectedOutput = outputs[outputs.length - 1];
    if (selectedOutput && selectedOutput.links) {
        for (const linkId of selectedOutput.links) {
            const link = graph.links?.get ? graph.links.get(linkId) : graph.links?.[linkId];
            if (link) {
                savedSelectedConnections.push({
                    target_id: link.target_id,
                    target_slot: link.target_slot,
                });
            }
        }
    }

    // Remove all outputs
    while (node.outputs.length > 0) {
        node.removeOutput(0);
    }

    // Add label outputs
    for (let i = 0; i < visibleInputs; i++) {
        node.addOutput(`label${i + 1}_out`, "STRING");
    }

    // Add selected_title
    node.addOutput("selected_title", "STRING");

    // Restore selected_title connections
    const selectedIdx = node.outputs.length - 1;
    for (const conn of savedSelectedConnections) {
        const targetNode = graph.getNodeById(conn.target_id);
        if (targetNode) {
            try {
                node.connect(selectedIdx, targetNode, conn.target_slot);
            } catch (e) {
                // ignore connection errors
            }
        }
    }

    return true;
}

function applyVisibleInputs(node, desiredInputs) {
    if (!node || node.comfyClass !== "AUNGetConnectedNodeTitles") {
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
        if (!input.name.startsWith(NODE_PREFIX)) {
            continue;
        }
        const suffix = parseInt(input.name.substring(NODE_PREFIX.length), 10);
        if (Number.isFinite(suffix) && suffix > target) {
            node.removeInput(i);
            changed = true;
        }
    }

    for (let i = 1; i <= target; i++) {
        const name = `${NODE_PREFIX}${i}`;
        if (!node.inputs?.some((input) => input?.name === name)) {
            node.addInput(name, "*");
            changed = true;
        }
    }

    const outputsChanged = rebuildOutputSockets(node);

    if (changed || outputsChanged) {
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
            console.warn("AUNGetConnectedNodeTitles: computeSize failed", err);
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
        if (!input.name.startsWith(NODE_PREFIX)) {
            continue;
        }
        const suffix = parseInt(input.name.substring(NODE_PREFIX.length), 10);
        if (Number.isFinite(suffix) && suffix > target) {
            return true;
        }
    }
    return false;
}

function hasLinkedOutputsAbove(node, target) {
    const outputs = node.outputs ?? [];
    for (let i = target; i < outputs.length - 1; i++) {
        const output = outputs[i];
        if (output && output.links && output.links.length > 0) {
            return true;
        }
    }
    return false;
}

function updateInputLabels(node) {
    const graph = node.graph || app.graph;
    const visibleInputs = clampInputCount(getVisibleWidget(node)?.value ?? MIN_INPUTS);

    for (let i = 1; i <= visibleInputs; i++) {
        const inputSlot = node.inputs?.find(slot => slot.name === `${NODE_PREFIX}${i}`);
        if (!inputSlot) continue;

        if (inputSlot.link != null) {
            const links = graph.links;
            const link = links?.get ? links.get(inputSlot.link) : links?.[inputSlot.link];
            if (link) {
                const originNode = graph.getNodeById ? graph.getNodeById(link.origin_id) : null;
                if (originNode) {
                    inputSlot.label = originNode.title || originNode.type || `${NODE_PREFIX}${i}`;
                    continue;
                }
            }
        }
        inputSlot.label = `${NODE_PREFIX}${i}`;
    }
    node.setDirtyCanvas(true, true);
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
            applyVisibleInputs(node, desired);
            syncIndexWidget(node, desired);
        }

        node.__aun_pending_visible = undefined;
    }

    requestAnimationFrame(updateTrackedNodes);
}

function setupNode(node) {
    if (!node || node.comfyClass !== "AUNGetConnectedNodeTitles") {
        return;
    }
    ensureWidgetHook(node);
    node.__aun_visible_inputs = undefined;
    const widgetValue = clampInputCount(getVisibleWidget(node)?.value ?? MIN_INPUTS);
    scheduleUpdate(node, widgetValue);
    syncIndexWidget(node, widgetValue);
    setTimeout(() => {
        rebuildOutputSockets(node);
        updateInputLabels(node);
    }, 0);
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
    name: "AUN.GetConnectedNodeTitles.Labels",
    nodeCreated(node) {
        setupNode(node);
    },
    nodeInputConnected(node, inputSlot) {
        if (node.comfyClass === "AUNGetConnectedNodeTitles") {
            updateInputLabels(node);
        }
    },
    nodeInputDisconnected(node, inputSlot) {
        if (node.comfyClass === "AUNGetConnectedNodeTitles") {
            updateInputLabels(node);
        }
    },
    loadedGraphNode(node) {
        setupNode(node);
    }
});

let lastTitles = {};
function pollForTitleChanges() {
    if (app?.graph?._nodes) {
        for (const node of app.graph._nodes) {
            if (node.title !== lastTitles[node.id]) {
                lastTitles[node.id] = node.title;
                app.graph._nodes.forEach(n => {
                    if (n.comfyClass === "AUNGetConnectedNodeTitles") updateInputLabels(n);
                });
            }
        }
    }
    requestAnimationFrame(pollForTitleChanges);
}
pollForTitleChanges();

updateTrackedNodes();
