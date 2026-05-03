import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const TARGET_CLASSES = new Set([
  "AUNRandomTextIndexSwitch",
  "AUNRandomTextIndexSwitchV2",
]);

const getWidget = (node, names) => {
  if (!node?.widgets) return null;
  for (const name of names) {
    const widget = node.widgets.find((w) => w.name === name);
    if (widget) return widget;
  }
  return null;
};

const parsePositiveInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const extractExecutedIndex = (message) => {
  if (!message || typeof message !== "object") return null;

  const readCandidate = (candidate) => {
    if (candidate == null) return null;
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const parsed = readCandidate(item);
        if (parsed != null) return parsed;
      }
      return null;
    }
    return parsePositiveInt(candidate);
  };

  // Prefer named output from RETURN_NAMES ("index").
  const named = readCandidate(message.index);
  if (named != null) return named;

  // Fallback for positional payload shape.
  const positional = readCandidate(message[2]);
  if (positional != null) return positional;

  return null;
};

const getSelectedIndex = (node) => {
  const modeWidget = getWidget(node, ["mode"]);
  const modeValue = String(modeWidget?.value || "");

  // In dynamic modes, only trust the last executed output index.
  if (modeValue && modeValue !== "Select") {
    return parsePositiveInt(node?.__aun_last_exec_index);
  }

  // In Select mode, show the live selected value.
  if (modeValue === "Select") {
    const selectWidget = getWidget(node, ["select"]);
    const selectValue = parsePositiveInt(selectWidget?.value);
    if (selectValue != null) return selectValue;
  }

  // Fallback for cases where mode widget is absent.
  const lastExec = parsePositiveInt(node?.__aun_last_exec_index);
  if (lastExec != null) return lastExec;

  return null;
};

const getSelectedInputInfo = (node, selectedIndex) => {
  if (!node?.inputs?.length || selectedIndex == null) return null;
  const targetName = `text${selectedIndex}`;
  const inputIndex = node.inputs.findIndex((slot) => slot?.name === targetName);
  if (inputIndex < 0) return null;

  const slot = node.inputs[inputIndex];
  const slotHeight = globalThis?.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const slotStartY = node.constructor?.slot_start_y ?? 0;
  const centerY = slotStartY + inputIndex * slotHeight + slotHeight * 0.5 + 4;
  const label = String(slot?.label || slot?.name || targetName);
  return { centerY, label };
};

const normalizeTitle = (node) => {
  if (!node || !TARGET_CLASSES.has(node.comfyClass)) return;

  if (!node.__aun_indicator_base_title) {
    const current = String(node.title || node.comfyClass || "AUN Switch");
    node.__aun_indicator_base_title = current.replace(
      /\s*\[Selected:[^\]]*\]$/,
      "",
    );
  }
  if (node.title !== node.__aun_indicator_base_title) {
    node.title = node.__aun_indicator_base_title;
  }
};

const installDrawBadge = (node) => {
  if (!node || node.__aun_indicator_draw_hooked) return;
  const original = node.onDrawForeground;

  node.onDrawForeground = function (ctx) {
    original?.apply(this, arguments);

    if (this.flags?.collapsed) return;

    const selected = getSelectedIndex(this);

    // Highlight selected text input row with a subtle strip and arrow.
    const inputInfo = getSelectedInputInfo(this, selected);
    if (inputInfo) {
      const labelX = 12;
      const labelWidth = Math.ceil(ctx.measureText(inputInfo.label).width);
      const arrowX = Math.min(this.size[0] - 14, labelX + labelWidth + 8);
      const rowY = Math.round(inputInfo.centerY - 8);

      ctx.save();
      ctx.fillStyle = "rgba(95, 170, 255, 0.16)";
      ctx.fillRect(6, rowY, Math.max(30, arrowX - 2), 16);
      ctx.fillStyle = "rgba(180, 220, 255, 0.95)";
      ctx.font = "11px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("▶", arrowX, inputInfo.centerY + 0.5);
      ctx.restore();
    }
  };

  node.__aun_indicator_draw_hooked = true;
};

const startRefreshMonitor = (node) => {
  if (!node || node.__aun_indicator_monitor_id) return;
  let lastSignature = "";

  const check = () => {
    if (!node || node.type === undefined) {
      if (node?.__aun_indicator_monitor_id) {
        clearInterval(node.__aun_indicator_monitor_id);
        node.__aun_indicator_monitor_id = null;
      }
      return;
    }

    const signature = String(getSelectedIndex(node));
    if (signature !== lastSignature) {
      lastSignature = signature;
      const graph = node.graph ?? app.graph;
      graph?.setDirtyCanvas(true, true);
    }
  };

  node.__aun_indicator_monitor_id = setInterval(check, 150);
  setTimeout(check, 0);

  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function () {
    if (node.__aun_indicator_monitor_id) {
      clearInterval(node.__aun_indicator_monitor_id);
      node.__aun_indicator_monitor_id = null;
    }
    return originalOnRemoved?.apply(this, arguments);
  };
};

const wrapWidget = (node, widget) => {
  if (!widget || widget.__aun_indicator_hooked) return;
  const original = widget.callback;
  widget.callback = function (value) {
    try {
      original?.call(widget, value);
    } catch (e) {}
    const graph = node.graph ?? app.graph;
    graph?.setDirtyCanvas(true, true);
  };
  widget.__aun_indicator_hooked = true;
};

const setupNode = (node) => {
  if (!node || !TARGET_CLASSES.has(node.comfyClass)) return;

  normalizeTitle(node);
  installDrawBadge(node);
  startRefreshMonitor(node);

  for (const widget of node.widgets || []) {
    if (["Index", "index", "select", "mode"].includes(widget.name)) {
      wrapWidget(node, widget);
    }
  }

  // Trigger redraw after initial layout and potential async widget hydration.
  const graph = node.graph ?? app.graph;
  setTimeout(() => graph?.setDirtyCanvas(true, true), 0);
  setTimeout(() => graph?.setDirtyCanvas(true, true), 120);
};

app.registerExtension({
  name: "AUN.IndexSelectedIndicator",
  async setup() {
    api.addEventListener("AUN_random_text_index_selected", ({ detail }) => {
      if (!detail || !app?.graph) return;
      const nodeId = detail.node_id;
      const index = parsePositiveInt(detail.index);
      if (nodeId == null || index == null) return;

      const node =
        app.graph.getNodeById(Number(nodeId)) || app.graph.getNodeById(nodeId);
      if (!node || !TARGET_CLASSES.has(node.comfyClass)) return;

      node.__aun_last_exec_index = index;
      if (detail.mode != null) {
        node.__aun_last_exec_mode = String(detail.mode);
      }
      app.graph.setDirtyCanvas(true, true);
    });
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!nodeData || !TARGET_CLASSES.has(nodeData.name)) return;

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      originalOnExecuted?.apply(this, arguments);
      const parsed = extractExecutedIndex(message);
      if (parsed != null) {
        this.__aun_last_exec_index = parsed;
        const graph = this.graph ?? app.graph;
        graph?.setDirtyCanvas(true, true);
      }
    };
  },
  nodeCreated(node) {
    setupNode(node);
  },
  loadedGraphNode(node) {
    setupNode(node);
  },
});
