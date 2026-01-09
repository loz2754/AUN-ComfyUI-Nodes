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

const applyIndexState = (node, mode) => {
    const graph = app?.graph;
    if (!graph || !node?.widgets) return;

    const indexWidget = node.widgets.find((w) => w.name === "Index");
    const selectedIndex = clampIndex(indexWidget?.value ?? 1);
    const idsByGroup = [];
    for (let i = 1; i <= 10; i++) {
        const textWidget = node.widgets.find((w) => w.name === `node_ids_${i}`);
        idsByGroup.push(parseNodeIds(textWidget?.value ?? ""));
    }

    const inactiveMode = mode === "mute" ? 2 : 4;
    let changed = false;

    for (let group = 1; group <= 10; group++) {
        const isActive = group === selectedIndex;
        const targetMode = isActive ? 0 : inactiveMode;
        for (const nodeId of idsByGroup[group - 1]) {
            const target = graph.getNodeById(nodeId);
            if (!target) continue;
            if (target.mode !== targetMode) {
                target.mode = targetMode;
                changed = true;
            }
        }
    }

    if (changed) graph.setDirtyCanvas(true, true);
};

const wrapWidget = (node, widgetName, callback) => {
    const widget = node.widgets?.find((w) => w.name === widgetName);
    if (!widget) return;
    const original = widget.callback;
    widget.callback = function(value) {
        try { original?.call(widget, value); } catch (e) {}
        callback?.();
    };
};

app.registerExtension({
    name: "AUN.MultiIndex.Instant",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData) return;
        const type = nodeData.name;
        if (type !== "AUNMultiBypassIndex" && type !== "AUNMultiMuteIndex") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            onNodeCreated?.apply(this, arguments);

            const mode = (type === "AUNMultiMuteIndex") ? "mute" : "bypass";
            const apply = () => applyIndexState(this, mode);
            this.__AUN_multiIndexUpdate = apply;

            wrapWidget(this, "Index", apply);
            for (let i = 1; i <= 10; i++) {
                wrapWidget(this, `node_ids_${i}`, apply);
            }

            setTimeout(apply, 0);
        };
    }
});
