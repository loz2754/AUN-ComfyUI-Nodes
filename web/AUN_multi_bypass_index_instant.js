import { app } from "../../scripts/app.js";

const clampIndex = (value) => {
    let n = parseInt(value, 10);
    if (Number.isNaN(n)) n = 1;
    if (n < 1) return 1;
    if (n > 10) return 10;
    return n;
};

const parseNodeIds = (value) => {
    if (!value || typeof value !== "string") return [];
    return value
        .split(",")
        .map((part) => parseInt(part.trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0);
};

const applyIndexState = (node) => {
    const graph = app?.graph;
    if (!graph || !node?.widgets) return;

    const indexWidget = node.widgets.find((w) => w.name === "Index");
    const useMuteWidget = node.widgets.find((w) => w.name === "UseMute");
    const selectedIndex = clampIndex(indexWidget?.value ?? 1);
    const useMute = !!(useMuteWidget?.value);

    const idsByGroup = [];
    for (let i = 1; i <= 10; i++) {
        const textWidget = node.widgets.find((w) => w.name === `node_ids_${i}`);
        idsByGroup.push(parseNodeIds(textWidget?.value ?? ""));
    }

    let changed = false;
    for (let group = 1; group <= 10; group++) {
        const isActive = group === selectedIndex;
        const targetMode = isActive ? 0 : (useMute ? 2 : 4);
        for (const nodeId of idsByGroup[group - 1]) {
            const target = graph.getNodeById(nodeId);
            if (!target) continue;
            if (target.mode !== targetMode) {
                target.mode = targetMode;
                changed = true;
            }
            target.__AUN_multiBypassIndex_mode = target.mode;
        }
    }

    if (changed) graph.setDirtyCanvas(true, true);
};

const wrapWidget = (node, widgetName) => {
    const widget = node.widgets?.find((w) => w.name === widgetName);
    if (!widget) return;
    const original = widget.callback;
    widget.callback = function(value) {
        try { original?.call(widget, value); } catch (e) {}
        node.__AUN_applyIndexState?.();
    };
};

app.registerExtension({
    name: "AUN.MultiBypassIndex.Instant",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (!nodeData || nodeData.name !== "AUNMultiBypassIndex") return;
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            onNodeCreated?.apply(this, arguments);

            this.__AUN_applyIndexState = () => applyIndexState(this);

            wrapWidget(this, "Index");
            wrapWidget(this, "UseMute");
            for (let i = 1; i <= 10; i++) {
                wrapWidget(this, `node_ids_${i}`);
            }

            setTimeout(() => this.__AUN_applyIndexState?.(), 0);
        };
    }
});
