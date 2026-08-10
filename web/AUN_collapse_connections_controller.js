import { app } from "../../scripts/app.js";
import {
  forceGraphRedraw,
  getAllGraphs,
  getWidget,
  applyWidgetHiddenState,
  chainWidgetCallback,
  findNodeById,
} from "./index.js";
import {
  setNodeCollapseConnections,
  isGlobalCollapseEnabled,
  isConnectionCollapsed,
} from "./AUN_global_collapse_connections.js";

const NODE_TYPE = "AUNCollapseConnectionsController";
const MAX_SLOTS = 20;
const BANNER_H = 26;
const WIDGETS_START_Y = 20;
const BANNER_TEXT = "⚠ Enable 'Global collapse connections' (Settings → AUN)";
const REFRESH_INTERVAL = 500;

const SLOT_RE = /^(label|targets|switch)_(\d+)$/;

const clampSlotCount = (value) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.min(MAX_SLOTS, Math.max(1, n));
};

const splitList = (value) => {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

// Resolve a slot's raw node IDs to live nodes.
function resolveTargetIds(rawTargets) {
  const nodes = [];
  for (const id of splitList(rawTargets)) {
    const node = findNodeById(id);
    if (node && !nodes.includes(node)) nodes.push(node);
  }
  return nodes;
}

const executeInstant = function executeInstant() {
  if (!this.widgets || this.configuring) return;
  if (!isGlobalCollapseEnabled()) return;

  const slotCount = clampSlotCount(getWidget(this, "slot_count")?.value);
  const allSwitch = !!getWidget(this, "AllSwitch")?.value;

  const active = new Set();
  const inactive = new Set();

  for (let slot = 1; slot <= slotCount; slot++) {
    const switchWidget = getWidget(this, `switch_${slot}`);
    if (!switchWidget || switchWidget.hidden) continue;
    const targets = getWidget(this, `targets_${slot}`)?.value;
    if (!splitList(targets).length) continue;
    const isActive = !!switchWidget.value || allSwitch;
    for (const node of resolveTargetIds(targets)) {
      // Active wins across overlapping slots.
      if (isActive) {
        active.add(node);
        inactive.delete(node);
      } else if (!active.has(node)) {
        inactive.add(node);
      }
    }
  }

  for (const node of active) setNodeCollapseConnections(node, true);
  for (const node of inactive) setNodeCollapseConnections(node, false);
  if (active.size || inactive.size) forceGraphRedraw(app);
};

const syncTogglesWithGraph = function syncTogglesWithGraph() {
  if (!this.widgets || this.configuring) return;
  if (!isGlobalCollapseEnabled()) return;

  const slotCount = clampSlotCount(getWidget(this, "slot_count")?.value);
  this._AUN_syncingToggles = true;
  let dirty = false;

  for (let slot = 1; slot <= slotCount; slot++) {
    const switchWidget = getWidget(this, `switch_${slot}`);
    if (!switchWidget || switchWidget.hidden) continue;
    const targets = getWidget(this, `targets_${slot}`)?.value;
    const resolved = resolveTargetIds(targets);
    if (!resolved.length) continue;
    const allCollapsed = resolved.every((node) => isConnectionCollapsed(node));
    if (switchWidget.value !== allCollapsed) {
      switchWidget.value = allCollapsed;
      dirty = true;
    }
  }

  if (dirty) this.setDirtyCanvas?.(true, true);
  this._AUN_syncingToggles = false;
};

const refreshWidgets = function refreshWidgets() {
  if (!this.widgets) return;
  const slotCount = clampSlotCount(getWidget(this, "slot_count")?.value);
  const isCompact = !!this.properties?._AUN_compactMode;
  for (const widget of this.widgets) {
    const m = widget?.name ? SLOT_RE.exec(widget.name) : null;
    if (m) {
      const slot = Number(m[2]);
      const withinRange = slot <= slotCount;
      if (m[1] === "switch") {
        applyWidgetHiddenState(widget, !withinRange);
        if (withinRange) {
          const labelWidget = getWidget(this, `label_${slot}`);
          const labelValue =
            typeof labelWidget?.value === "string"
              ? labelWidget.value.trim()
              : "";
          widget.label = labelValue || `Slot ${slot}`;
        }
        continue;
      }
      applyWidgetHiddenState(widget, !withinRange || isCompact);
      continue;
    }
    if (widget?.name === "slot_count") {
      applyWidgetHiddenState(widget, isCompact);
      continue;
    }
    if (widget?.name === "AllSwitch") {
      applyWidgetHiddenState(widget, slotCount <= 1);
      if (slotCount <= 1 && widget.value) {
        widget.value = false;
      }
    }
  }
  this.setDirtyCanvas?.(true, true);
};

const attachSwitchHandlers = (node) => {
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    const widget = getWidget(node, `switch_${slot}`);
    if (!widget) continue;
    chainWidgetCallback(widget, () => {
      if (node._AUN_batchToggle || node._AUN_syncingToggles) return;
      if (!widget.value) {
        const allSwitch = getWidget(node, "AllSwitch");
        if (allSwitch && allSwitch.value) {
          allSwitch.value = false;
          node.setDirtyCanvas?.(true, true);
        }
      }
      node.__AUN_executeInstant?.();
    });
  }
};

const attachInputHandlers = (node) => {
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    const targetWidget = getWidget(node, `targets_${slot}`);
    if (targetWidget) {
      chainWidgetCallback(targetWidget, () => {
        node.__AUN_executeInstant?.();
      });
    }
  }
};

const attachAllSwitchHandler = (node) => {
  const widget = getWidget(node, "AllSwitch");
  if (!widget) return;
  chainWidgetCallback(widget, () => {
    if (node._AUN_batchToggle || node._AUN_syncingToggles) return;
    const total = clampSlotCount(getWidget(node, "slot_count")?.value);
    node._AUN_batchToggle = true;
    for (let slot = 1; slot <= total; slot++) {
      const sw = getWidget(node, `switch_${slot}`);
      if (sw && sw.value !== widget.value) sw.value = widget.value;
    }
    node._AUN_batchToggle = false;
    node.__AUN_executeInstant?.();
  });
};

const decorateNode = (node) => {
  node.widgets_start_y = WIDGETS_START_Y;
  node.__AUN_executeInstant = executeInstant.bind(node);
  node.__AUN_refreshWidgets = refreshWidgets.bind(node);
  node.syncTogglesWithGraph = syncTogglesWithGraph.bind(node);

  attachSwitchHandlers(node);
  attachInputHandlers(node);
  attachAllSwitchHandler(node);

  const slotCountWidget = getWidget(node, "slot_count");
  if (slotCountWidget) {
    chainWidgetCallback(slotCountWidget, () => {
      node.__AUN_refreshWidgets?.();
      node.__AUN_executeInstant?.();
    });
  }

  node.__AUN_toggleCompactMode = (nextState, { force = false } = {}) => {
    if (node.__AUN_toggleInProgress) return;

    const activeElement = document.activeElement;
    const isWidgetInput =
      !force &&
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.classList?.contains("litegraph") ||
        activeElement.id?.includes("widget"));
    const interactingWidget = force
      ? null
      : app.canvas?.interacting_widget || app.canvas?.active_widget;
    if (isWidgetInput || interactingWidget) return;

    node.__AUN_toggleInProgress = true;
    try {
      node.properties = node.properties || {};
      const current = !!node.properties._AUN_compactMode;
      const target = typeof nextState === "boolean" ? nextState : !current;
      if (current === target) return;
      node.properties._AUN_compactMode = target;
      node.__AUN_refreshWidgets?.();
      node.setSize([node.size[0], node.computeSize()[1]]);
      node.setDirtyCanvas?.(true, true);
    } finally {
      setTimeout(() => {
        node.__AUN_toggleInProgress = false;
      }, 50);
    }
  };

  const originalDraw = node.onDrawBackground;
  node.onDrawBackground = function onDrawBackground(ctx) {
    if (originalDraw) originalDraw.apply(this, arguments);
    const now = Date.now();
    if (!this._AUN_lastSync || now - this._AUN_lastSync > REFRESH_INTERVAL) {
      this._AUN_lastSync = now;
      this.syncTogglesWithGraph?.();
    }
  };

  const originalConfigure = node.onConfigure;
  node.onConfigure = function onConfigure(...args) {
    originalConfigure?.apply(this, args);
    this.__AUN_refreshWidgets?.();
    this.syncTogglesWithGraph?.();
  };

  const originalDblClick = node.onDblClick;
  node.onDblClick = function onDblClick(event, pos) {
    originalDblClick?.apply(this, arguments);
    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) {
      // Ignore title-bar double-clicks so ComfyUI can keep using them for rename.
      return;
    }
    this.__AUN_toggleCompactMode?.();
  };

  const originalMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function getExtraMenuOptions(canvas, options) {
    if (originalMenu) originalMenu.apply(this, [canvas, options]);
    const compact = !!this.properties?._AUN_compactMode;
    options.push({
      content: compact ? "AUN: Show all controls" : "AUN: Compact mode",
      callback: () => this.__AUN_toggleCompactMode?.(!compact, { force: true }),
    });
  };

  const originalPropertyChanged = node.onPropertyChanged;
  node.onPropertyChanged = function onPropertyChanged(name) {
    originalPropertyChanged?.apply(this, arguments);
    if (name === "_AUN_compactMode") {
      this.__AUN_refreshWidgets?.();
      this.setSize([this.size[0], this.computeSize()[1]]);
      this.setDirtyCanvas?.(true, true);
    }
  };

  setTimeout(() => {
    node.__AUN_refreshWidgets?.();
    node.syncTogglesWithGraph?.();
  }, 250);
};

// ── Overlay banner (shown while the experimental setting is OFF) ────────────

function isWarningActive() {
  return !isGlobalCollapseEnabled();
}

const extendNodePrototype = (nodeType) => {
  const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function onNodeCreated() {
    originalOnNodeCreated?.apply(this, arguments);
    decorateNode(this);
  };

  const origComputeSize = nodeType.prototype.computeSize;
  nodeType.prototype.computeSize = function (out) {
    const s = origComputeSize
      ? origComputeSize.call(this, out)
      : this.size
        ? this.size.slice()
        : [0, 0];
    if (Array.isArray(s) && isWarningActive()) {
      s[1] = (s[1] || 0) + BANNER_H;
    }
    return s;
  };

  const origDrawFg = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    if (origDrawFg) origDrawFg.apply(this, arguments);
    if (!isWarningActive()) return;

    const w = this.size[0] || 0;
    const h = this.size[1] || 0;
    if (!w || !h) return;

    const y0 = h - BANNER_H;
    try {
      ctx.save();
      ctx.fillStyle = "rgba(170, 40, 40, 0.92)";
      ctx.fillRect(0, y0, w, BANNER_H);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const maxWidth = Math.max(0, w - 12);
      const text =
        ctx.measureText(BANNER_TEXT).width > maxWidth
          ? "⚠ Enable 'Global collapse connections' setting"
          : BANNER_TEXT;
      ctx.fillText(text, 6, y0 + BANNER_H / 2, maxWidth);
      ctx.restore();
    } catch (_) {}
  };

  // Keep the banner height and visibility in sync when the setting flips
  // while the node is already on the canvas.
  nodeType.prototype.__aun_ccc_refresh = function () {
    const warn = isWarningActive();
    if (this.__aun_ccc_lastWarn === warn) return false;
    this.__aun_ccc_lastWarn = warn;
    try {
      this.setSize([this.size[0], this.computeSize()[1]]);
    } catch (_) {}
    return true;
  };
};

app.registerExtension({
  name: "AUN.CollapseConnectionsController",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_TYPE) return;
    extendNodePrototype(nodeType);
  },
});

// Apply the state snapshot the Python node sends when the workflow runs.
app.api.addEventListener("AUN_set_collapse_connections", (event) => {
  const detail = event?.detail || {};
  if (!isGlobalCollapseEnabled()) return;
  const groups = Array.isArray(detail.groups) ? detail.groups : [];

  const active = new Set();
  const inactive = new Set();

  for (const group of groups) {
    const targets = Array.isArray(group?.targets) ? group.targets : [];
    if (!targets.length || group.type !== "ID") continue;
    for (const id of targets) {
      const node = findNodeById(id);
      if (!node) continue;
      if (group.is_active) {
        active.add(node);
        inactive.delete(node);
      } else if (!active.has(node)) {
        inactive.add(node);
      }
    }
  }

  for (const node of active) setNodeCollapseConnections(node, true);
  for (const node of inactive) setNodeCollapseConnections(node, false);
  if (active.size || inactive.size) forceGraphRedraw(app);
});

setInterval(() => {
  try {
    for (const graph of getAllGraphs(app.graph)) {
      if (!graph._nodes) continue;
      for (const node of graph._nodes) {
        if (node?.type !== NODE_TYPE) continue;
        if (node.__aun_ccc_refresh?.()) {
          node.graph?.setDirtyCanvas(true, true);
        }
      }
    }
  } catch (_) {}
}, 500);
