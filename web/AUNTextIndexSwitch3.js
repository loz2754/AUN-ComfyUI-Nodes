import { app } from "../../scripts/app.js";

const NODE_TYPE = "AUNTextIndexSwitch3";
const PROP_KEY = "_AUN_compactMode";

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function normalizeIdentifier(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, compact) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!compact;
}

function isTargetNode(node) {
  if (!node) {
    return false;
  }

  const target = normalizeIdentifier(NODE_TYPE);
  const comfyClass = normalizeIdentifier(node.comfyClass);
  const type = normalizeIdentifier(node.type);
  const name = normalizeIdentifier(node.name);
  const title = normalizeIdentifier(node.title);

  const result =
    comfyClass === target ||
    type === target ||
    name === target ||
    comfyClass.includes(target) ||
    type.includes(target) ||
    name.includes(target) ||
    title.includes(target);

  return result;
}

function ensureHiddenAwareWidget(widget) {
  if (!widget || widget.__AUN_textIndexSwitch3_hiddenAware) {
    return;
  }

  widget.__AUN_textIndexSwitch3_hiddenAware = true;
  const originalComputeSize =
    typeof widget.computeSize === "function" ? widget.computeSize : null;

  widget.computeSize = function computeSizeProxy(...args) {
    const firstArg = args.length ? args[0] : undefined;
    const resolveWidth = () => {
      if (Array.isArray(firstArg) && Number.isFinite(firstArg[0])) {
        return firstArg[0];
      }
      if (Number.isFinite(firstArg)) {
        return firstArg;
      }
      return LiteGraph?.NODE_WIDTH ?? 200;
    };

    if (this.hidden) {
      return [resolveWidth(), 0];
    }

    if (originalComputeSize) {
      return originalComputeSize.apply(this, args);
    }

    return [resolveWidth(), LiteGraph?.NODE_WIDGET_HEIGHT ?? 24];
  };
}

function applyWidgetHiddenState(widget, hidden) {
  if (!widget) return;
  ensureHiddenAwareWidget(widget);

  widget.hidden = hidden;
  widget.flags = widget.flags || {};
  widget.flags.hidden = hidden;
  widget.flags.collapsed = hidden;
  widget.options = typeof widget.options === "object" ? widget.options : {};
  widget.options.noDraw = hidden;

  if (widget.inputEl) {
    widget.inputEl.hidden = hidden;
    widget.inputEl.style.display = hidden ? "none" : "block";
    if (!hidden) {
      widget.inputEl.style.minHeight = `${widget.comfyHeight ?? 20}px`;
    }
  }
}

function patchTargetNode(node) {
  if (!node || !isTargetNode(node) || node.__AUN_textIndexSwitch3Patched) {
    return false;
  }
  node.__AUN_textIndexSwitch3Patched = true;

  node.properties = node.properties || {};
  if (typeof node.properties[PROP_KEY] !== "boolean") {
    setCompact(node, false);
  }

  const indexWidget = getWidget(node, "index");
  if (indexWidget) {
    const origCb = indexWidget.callback;
    indexWidget.callback = function callback(value) {
      origCb?.call(indexWidget, value);
      node.setDirtyCanvas?.(true, true);
    };
  }

  const slotCountWidget = getWidget(node, "slot_count");
  if (slotCountWidget) {
    const origCb = slotCountWidget.callback;
    slotCountWidget.callback = function callback(value) {
      origCb?.call(slotCountWidget, value);
      syncSlotVisibility(node);
      node.setDirtyCanvas?.(true, true);
    };
  }

  const originalDblClick = node.onDblClick;
  node.onDblClick = function onDblClick(event, pos) {
    originalDblClick?.apply(this, arguments);
    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) {
      return;
    }
    toggleCompactMode(this);
  };

  syncSlotVisibility(node);
  applyCompact(node);
  startCompactLiveMonitor(node);
  scheduleAutoHeightUpdate(node, 5, 50);

  return true;
}

function syncSlotVisibility(node) {
  if (!node) return;

  const slotCountWidget = getWidget(node, "slot_count");
  if (!slotCountWidget) return;

  const slotCount = Math.max(
    1,
    Math.min(20, Math.floor(Number(slotCountWidget.value) || 2)),
  );

  // Hide/show text widgets based on slot_count (unless in compact mode)
  for (let i = 1; i <= 20; i++) {
    const textWidget = getWidget(node, `text${i}`);
    if (textWidget) {
      applyWidgetHiddenState(
        textWidget,
        isCompact(node) ? true : i > slotCount,
      );
    }
  }

  // Also update the index widget's min/max values to match slot_count.
  const indexWidget = getWidget(node, "index");
  if (indexWidget) {
    const options =
      typeof indexWidget.options === "object" ? { ...indexWidget.options } : {};
    options.max = slotCount;
    options.min = 1;
    indexWidget.options = options;

    if (indexWidget.inputEl) {
      if (typeof indexWidget.inputEl.setAttribute === "function") {
        indexWidget.inputEl.setAttribute("max", slotCount);
        indexWidget.inputEl.setAttribute("min", 1);
      }
      if (typeof indexWidget.inputEl.max !== "undefined") {
        indexWidget.inputEl.max = slotCount;
      }
      if (typeof indexWidget.inputEl.min !== "undefined") {
        indexWidget.inputEl.min = 1;
      }
    }

    const currentIndex = Number(indexWidget.value ?? 1);
    if (currentIndex > slotCount) {
      indexWidget.value = slotCount;
      if (
        indexWidget.inputEl &&
        typeof indexWidget.inputEl.value !== "undefined"
      ) {
        indexWidget.inputEl.value = slotCount;
      }
      if (typeof indexWidget.callback === "function") {
        indexWidget.callback.call(indexWidget, slotCount);
      }
    }
  }

  if (typeof node.setDirtyCanvas === "function") {
    node.setDirtyCanvas(true, true);
  }
  if (typeof app?.graph?.setDirtyCanvas === "function") {
    app.graph.setDirtyCanvas(true, true);
  }
  if (typeof app?.canvas?.draw === "function") {
    app.canvas.draw(true, true);
  }
}

function applyCompact(node) {
  if (!isTargetNode(node)) return;

  const compact = isCompact(node);
  const slotCountWidget = getWidget(node, "slot_count");
  if (!slotCountWidget) return;

  const slotCount = Math.max(
    1,
    Math.min(20, Math.floor(Number(slotCountWidget.value) || 2)),
  );

  // In compact mode, hide all text widgets
  // In normal mode, show based on slot_count
  for (let i = 1; i <= 20; i++) {
    const textWidget = getWidget(node, `text${i}`);
    if (textWidget) {
      applyWidgetHiddenState(textWidget, compact || i > slotCount);
    }
  }
  node.widgets_dirty = true;
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas(true, true);
}

// --- Utility Functions ---
function toggleCompactMode(node) {
  if (!node) return;
  setCompact(node, !isCompact(node));
  applyCompact(node);
  startCompactLiveMonitor(node);
  scheduleAutoHeightUpdate(node);
}

function getActiveSlotTitle(node) {
  if (!node) return "";
  const indexWidget = getWidget(node, "index");
  const index = Number(indexWidget?.value ?? 1);
  const textWidget = getWidget(node, `text${index}`);
  if (textWidget && typeof textWidget.value === "string") {
    const firstLine = textWidget.value.split("\n")[0].trim();
    return firstLine;
  }
  return "";
}

function scheduleAutoHeightUpdate(node, tries = 5, delay = 50) {
  if (!node) return;
  let count = 0;
  function update() {
    if (++count > tries) return;
    if (typeof node.setSize === "function" && Array.isArray(node.size)) {
      const minH = computeVisibleNodeHeight(node) + 35;
      if (node.size[1] < minH) {
        node.size[1] = minH;
        node.setDirtyCanvas?.(true, true);
      }
    }
    setTimeout(update, delay);
  }
  setTimeout(update, delay);
}

function computeVisibleNodeHeight(node) {
  if (!node || !Array.isArray(node.widgets)) return 60;
  let h = 40; // base height for title bar
  for (const w of node.widgets) {
    if (!w.hidden) h += w.comfyHeight ?? 28;
  }
  return h;
}

// --- Compact Mode Live Monitor ---
function startCompactLiveMonitor(node) {
  if (!node) return;
  // Clear any existing monitor
  if (node.__AUN_textIndexSwitch3MonitorId) {
    clearInterval(node.__AUN_textIndexSwitch3MonitorId);
    node.__AUN_textIndexSwitch3MonitorId = null;
  }
  let lastSignature = null;
  function readSignature() {
    const indexWidget = getWidget(node, "index");
    const slotCountWidget = getWidget(node, "slot_count");
    const indexValue = String(indexWidget?.value ?? "");
    const slotCount = String(slotCountWidget?.value ?? "");
    // Try to get the first line of the active text slot
    const textWidget = getWidget(node, `text${indexValue}`);
    const textValue = String(textWidget?.value ?? "").trim();
    const firstLine = textValue.split("\n")[0].trim();
    return `${indexValue}|${slotCount}|${firstLine}`;
  }
  function check() {
    if (!node || node.type === undefined) {
      if (node?.__AUN_textIndexSwitch3MonitorId) {
        clearInterval(node.__AUN_textIndexSwitch3MonitorId);
        node.__AUN_textIndexSwitch3MonitorId = null;
      }
      return;
    }
    if (!isCompact(node)) return;
    const signature = readSignature();
    if (signature !== lastSignature) {
      lastSignature = signature;
      node.setDirtyCanvas?.(true, true);
      app.canvas?.setDirty?.(true);
    }
  }
  node.__AUN_textIndexSwitch3MonitorId = setInterval(check, 100);
  check();
  // Clean up when node is removed
  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function onRemoved() {
    if (node.__AUN_textIndexSwitch3MonitorId) {
      clearInterval(node.__AUN_textIndexSwitch3MonitorId);
      node.__AUN_textIndexSwitch3MonitorId = null;
    }
    return originalOnRemoved?.apply(this, arguments);
  };
}

// --- EXTENSION REGISTRATION ---
try {
  app.registerExtension({
    name: "AUN.TextIndexSwitch3",

    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (!nodeData) {
        console.warn(
          "[AUNTextIndexSwitch3.js] beforeRegisterNodeDef: missing nodeData",
        );
        return;
      }
      const normalizedNodeName = normalizeIdentifier(nodeData.name);
      const normalizedTarget = normalizeIdentifier(NODE_TYPE);
      if (!normalizedNodeName.includes(normalizedTarget)) {
        return;
      }
      if (nodeType.prototype.__AUN_textIndexSwitch3ProtoInit) return;

      const originalOnDrawFg = nodeType.prototype.onDrawForeground;
      nodeType.prototype.onDrawForeground = function onDrawForeground(ctx) {
        originalOnDrawFg?.apply(this, arguments);

        // Draw compact overlay
        if (!isCompact(this)) return;

        const title = getActiveSlotTitle(this);
        if (!title) return;

        const w = this.size?.[0] ?? 200;
        const padding = 6;
        const x = padding;
        const y = 28; // Below title bar and aligned left
        const textPadding = 6;

        ctx.save();
        ctx.font = "11px sans-serif";
        const maxTextWidth = Math.min(w - 2 * padding - 2 * textPadding, 115);
        let displayTitle = title;
        let textWidth = ctx.measureText(displayTitle).width;
        if (textWidth > maxTextWidth) {
          const ellipsis = "…";
          let len = displayTitle.length;
          while (
            len > 0 &&
            ctx.measureText(displayTitle.slice(0, len) + ellipsis).width >
              maxTextWidth
          ) {
            len -= 1;
          }
          displayTitle = `${displayTitle.slice(0, len)}${ellipsis}`;
          textWidth = ctx.measureText(displayTitle).width;
        }
        const boxWidth = textWidth + 2 * textPadding;
        const boxHeight = 18;

        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, boxWidth, boxHeight, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "rgba(240,240,240,0.98)";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(displayTitle, x + textPadding, y + boxHeight / 2);
        ctx.restore();
      };

      const originalGetMenuOptions = nodeType.prototype.getMenuOptions;
      nodeType.prototype.getMenuOptions = function getMenuOptions() {
        const options = originalGetMenuOptions
          ? originalGetMenuOptions.apply(this, arguments)
          : [];
        options.push({
          content: this.properties?.[PROP_KEY]
            ? "AUN: Show all widgets"
            : "AUN: Compact mode",
          callback: () => {
            setCompact(this, !this.properties?.[PROP_KEY]);
            applyCompact(this);
            startCompactLiveMonitor(this);
            scheduleAutoHeightUpdate(this);
          },
        });
        return options;
      };

      const originalExtraMenu = nodeType.prototype.getExtraMenuOptions;
      nodeType.prototype.getExtraMenuOptions = function getExtraMenuOptions(
        graphcanvas,
        options,
      ) {
        originalExtraMenu?.apply(this, arguments);
        if (!Array.isArray(options)) return;
        options.push({
          content: this.properties?.[PROP_KEY]
            ? "AUN: Show all widgets"
            : "AUN: Compact mode",
          callback: () => {
            setCompact(this, !this.properties?.[PROP_KEY]);
            applyCompact(this);
            startCompactLiveMonitor(this);
            scheduleAutoHeightUpdate(this);
          },
        });
      };

      nodeType.prototype.__AUN_textIndexSwitch3ProtoInit = true;
    },

    nodeCreated(node) {
      patchTargetNode(node);
    },

    loadedGraphNode(node) {
      patchTargetNode(node);
    },
  });
} catch (err) {
  console.error("[AUNTextIndexSwitch3.js] registerExtension failed", err);
}

let scanStarted = false;
function scanExistingNodes() {
  const graph = app.graph;
  if (!graph) {
    requestAnimationFrame(scanExistingNodes);
    return;
  }

  const nodes = Array.isArray(graph._nodes)
    ? graph._nodes
    : Array.isArray(graph.nodes)
      ? graph.nodes
      : [];

  if (nodes.length === 0) {
    requestAnimationFrame(scanExistingNodes);
    return;
  }

  if (scanStarted) {
    return;
  }
  scanStarted = true;

  for (const node of nodes) {
    patchTargetNode(node);
  }
}

const scheduleFn =
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (fn) => setTimeout(fn, 100);
scheduleFn(scanExistingNodes);
