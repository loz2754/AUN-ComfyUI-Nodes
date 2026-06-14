import { app } from "../../scripts/app.js";
import { NODE_MODE } from "./index.js";
import { getWidget } from "./widgets.js";
import { applyWidgetHiddenState } from "./widgets.js";

const clampIndex = (value, slotCount) => {
    let n = parseInt(value, 10);
    if (Number.isNaN(n)) n = 1;
    return Math.min(Math.max(n, 1), slotCount);
};

const parseNodeIds = (value) => {
    if (!value || typeof value !== "string") return [];
    return value
        .split(",")
        .map((part) => parseInt(part.trim(), 10))
        .filter((id) => Number.isInteger(id) && id > 0);
};

const recalcNodeSize = (node) => {
    const slotCountWidget = getWidget(node, "slot_count");
    if (!slotCountWidget) return;

    const slotCount = Math.min(Math.max(parseInt(slotCountWidget.value, 10) || 20, 2), 20);
    const visibleWidgets = 2 + slotCount;
    const titleH = LiteGraph.NODE_TITLE_HEIGHT || 30;
    const widgetH = LiteGraph.NODE_WIDGET_HEIGHT || 20;
    const margin = 8;
    const oldWidth = node.size?.[0] ?? LiteGraph.NODE_WIDTH ?? 200;
    node.size = [oldWidth, titleH + margin + visibleWidgets * widgetH];
};

const applyIndexState = (node, mode) => {
    const graph = app?.graph;
    if (!graph || !node?.widgets) return;

    const slotCountWidget = getWidget(node, "slot_count");
    const indexWidget = getWidget(node, "Index");
    if (!slotCountWidget || !indexWidget) return;

    const slotCount = Math.min(Math.max(parseInt(slotCountWidget.value, 10) || 20, 2), 20);
    const selectedIndex = clampIndex(indexWidget.value, slotCount);

    const idsByGroup = [];
    for (let i = 1; i <= slotCount; i++) {
        const textWidget = getWidget(node, `node_ids_${i}`);
        idsByGroup.push(parseNodeIds(textWidget?.value ?? ""));
    }

    const inactiveMode = mode === "mute" ? NODE_MODE.MUTED : NODE_MODE.BYPASSED;
    let changed = false;

    for (let group = 1; group <= slotCount; group++) {
        const isActive = group === selectedIndex;
        const targetMode = isActive ? NODE_MODE.ACTIVE : inactiveMode;
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

const syncSlotVisibility = (node) => {
    const slotCountWidget = getWidget(node, "slot_count");
    const indexWidget = getWidget(node, "Index");
    if (!slotCountWidget) return;

    const slotCount = Math.min(Math.max(parseInt(slotCountWidget.value, 10) || 20, 2), 20);

    for (let i = 1; i <= 20; i++) {
        const w = getWidget(node, `node_ids_${i}`);
        if (w) {
            applyWidgetHiddenState(w, i > slotCount);
        }
    }

    if (indexWidget) {
        indexWidget.options.max = slotCount;
        if (indexWidget.value > slotCount) {
            indexWidget.value = slotCount;
            if (typeof indexWidget.callback === "function") {
                indexWidget.callback.call(indexWidget, slotCount);
            }
        }
    }

    recalcNodeSize(node);

    if (node.graph?.setDirtyCanvas) {
        node.graph.setDirtyCanvas(true, true);
    }
    if (node.setDirtyCanvas) {
        node.setDirtyCanvas(true, true);
    }
};

const wrapWidget = (node, widgetName, callback) => {
    const widget = node.widgets?.find((w) => w.name === widgetName);
    if (!widget) return;
    const original = widget.callback;
    widget.callback = function (value) {
        try { original?.call(widget, value); } catch (e) { }
        callback?.();
    };
};

app.registerExtension({
    name: "AUN.MultiIndex.Instant",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData) return;
        const type = nodeData.name;
        if (type !== "AUNMultiBypassIndex" && type !== "AUNMultiMuteIndex") return;

        const mode = (type === "AUNMultiMuteIndex") ? "mute" : "bypass";
        const hookNode = (n) => {
            const apply = () => applyIndexState(n, mode);

            wrapWidget(n, "Index", apply);
            wrapWidget(n, "slot_count", () => {
                syncSlotVisibility(n);
                apply();
            });
            for (let i = 1; i <= 20; i++) {
                wrapWidget(n, `node_ids_${i}`, apply);
            }
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            hookNode(this);
            setTimeout(() => {
                syncSlotVisibility(this);
                applyIndexState(this, mode);
            }, 100);
        };
    }
});
