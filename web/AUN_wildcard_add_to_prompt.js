import { app } from "../../scripts/app.js";

const PLACEHOLDER_VALUES = new Set([
  "Select wildcard...",
  "No wildcards found",
]);
const PROP_KEY = "_AUN_compactMode";
const ALL_WIDGETS = [
  "wildcards",
  "wildcard_selector",
  "delimiter",
  "order",
  "mode",
  "populated_text",
];
const COMPACT_VISIBLE = new Set(["mode", "populated_text"]);

function appendWildcardToken(existingText, token) {
  const current = typeof existingText === "string" ? existingText : "";
  if (!current.trim()) {
    return token;
  }
  if (/[\s,]$/.test(current)) {
    return `${current}${token}`;
  }
  return `${current}, ${token}`;
}

// ── Compact mode helpers ──

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, value) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!value;
}

function getWidget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

function ensureHiddenAware(widget) {
  if (!widget || widget.__AUN_hiddenAware) return;
  const origComputeSize =
    typeof widget.computeSize === "function" ? widget.computeSize : null;
  widget.__AUN_hiddenAware = true;

  // Detect multiline textarea widgets (only customtext or explicit multiline flag)
  const isMultiline =
    widget.type === "customtext" || widget.options?.multiline === true;

  widget.computeSize = function (width) {
    if (this.hidden) {
      return [width, 0];
    }
    let [w, h] = origComputeSize
      ? origComputeSize.apply(this, arguments)
      : [width, this.comfyHeight ?? 20];
    // Ensure multiline textareas have a reasonable minimum height
    if (isMultiline) {
      h = Math.max(h, 100);
      this.comfyHeight = h;
    }
    return [w, h];
  };

  // Set minimum height on DOM element so it fills the computed space
  if (isMultiline && widget.inputEl) {
    widget.inputEl.style.minHeight = "80px";
  }
}

function estimateTextLines(text, availWidth, fontSize) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${fontSize || 12}px sans-serif`;
  const lines = text.split("\n");
  let total = 0;
  for (const line of lines) {
    const lineWidth = ctx.measureText(line).width;
    total += Math.max(1, Math.ceil(lineWidth / (availWidth || 264)));
  }
  return total;
}

function applyWidgetHidden(widget, hidden) {
  if (!widget) return;
  ensureHiddenAware(widget);
  widget.hidden = !!hidden;
  widget.__AUN_visible = !hidden;
  // Match working reference: set flags and noDraw for proper hiding
  if (widget.flags) {
    widget.flags.hidden = !!hidden;
    widget.flags.collapsed = !!hidden;
  }
  if (widget.options) {
    widget.options.noDraw = !!hidden;
  }
  // Also hide/show the DOM element for custom DOM widgets
  if (widget?.inputEl?.style) {
    widget.inputEl.style.display = hidden ? "none" : "";
  }
  // For DOM widgets added via addDOMWidget, the container might be a sibling
  if (widget?.__aunContainer?.style) {
    widget.__aunContainer.style.display = hidden ? "none" : "";
  }
}

function computeNodeHeight(node) {
  let total = 0;
  const w = node.size?.[0] ?? 300;
  for (const widget of node.widgets || []) {
    if (widget.hidden) continue;
    const cs = widget.computeSize?.(w);
    if (Array.isArray(cs)) {
      total += cs[1] ?? 0;
    } else if (Number.isFinite(cs)) {
      total += cs;
    }
  }
  return total;
}

function computeNodeWidth(node) {
  // Compute the minimum width needed for all visible widgets
  let maxW = 0;
  for (const widget of node.widgets || []) {
    if (widget.hidden) continue;
    const cs = widget.computeSize?.(0);
    if (Array.isArray(cs) && Number.isFinite(cs[0])) {
      maxW = Math.max(maxW, cs[0]);
    }
  }
  // Minimum usable width — wide enough for the full title text
  return Math.max(maxW, 200);
}

function updateAutoHeight(node) {
  if (!node) return;
  const h = computeNodeHeight(node);
  if (!Number.isFinite(h)) return;
  node.__AUN_internalResize = true;
  // Only mutate the height slot directly — calling setSize([w, h]) can trigger
  // LiteGraph to recalculate width from computeSize, which overrides the user's
  // saved/manual width on F5 reload.
  if (!Array.isArray(node.size)) node.size = [node.size?.[0] ?? 300, h];
  node.size[1] = h;
  node.__AUN_internalResize = false;
}

function updateAutoWidth(node) {
  if (!node) return;
  const cw = computeNodeWidth(node);
  const curW = node.size?.[0];
  // Preserve any manual width the user set — only shrink to computed minimum
  // if the current width is narrower, otherwise keep the wider value.
  const w = Number.isFinite(curW) ? Math.max(curW, cw) : cw;
  const h = node.size?.[1] ?? 200;
  node.__AUN_internalResize = true;
  if (typeof node.setSize === "function") {
    node.setSize([w, h]);
  } else {
    if (!Array.isArray(node.size)) node.size = [w, h];
    node.size[0] = w;
    node.size[1] = h;
  }
  node.__AUN_internalResize = false;
}

function applyCompact(node) {
  const compact = isCompact(node);
  const modeW = getWidget(node, "mode");
  const modeOff = modeW?.value === "off";
  for (const name of ALL_WIDGETS) {
    const widget = getWidget(node, name);
    if (!widget) continue;
    let hidden = compact && !COMPACT_VISIBLE.has(name);
    if (name === "populated_text" && compact) {
      // Keep widget visible to preserve height, but clear text when mode is off
      if (modeOff) {
        applyWidgetHidden(widget, false);
        if (widget.__populatedTextEl) {
          widget.__populatedTextEl.textContent = "";
        }
        continue;
      }
      hidden = false; // always show when mode is on/random
    }
    applyWidgetHidden(widget, hidden);
  }
  // Only adjust width if it's too narrow for visible widgets — never force
  // a width change on page reload or workflow load that would override the
  // user's saved/manual width.
  const minW = computeNodeWidth(node);
  if (node.size && Number.isFinite(node.size[0]) && node.size[0] < minW) {
    node.size[0] = minW;
  }
  updateAutoHeight(node);

  // Delayed update attempt to catch settling DOM/LiteGraph state
  setTimeout(() => {
    const minW2 = computeNodeWidth(node);
    if (node.size && Number.isFinite(node.size[0]) && node.size[0] < minW2) {
      node.size[0] = minW2;
    }
    updateAutoHeight(node);
    node.widgets_dirty = true;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
  }, 50);
}

function toggleCompact(node, { force = false } = {}) {
  if (node.__AUN_toggleInProgress) return;
  const active = document.activeElement;
  if (
    !force &&
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.classList?.contains("litegraph") ||
      active.id?.includes("widget"))
  )
    return;
  const canvas = app.canvas;
  if (!force && (canvas?.interacting_widget || canvas?.active_widget)) return;

  node.__AUN_toggleInProgress = true;
  setCompact(node, !isCompact(node));
  applyCompact(node);
  setTimeout(() => {
    node.__AUN_toggleInProgress = false;
  }, 50);
}

function setupCompact(node) {
  if (node.__AUN_compactInit) return;
  node.__AUN_compactInit = true;
  node.properties = node.properties || {};
  if (typeof node.properties[PROP_KEY] !== "boolean") {
    setCompact(node, true); // Default to compact — node starts small
  }

  const origDbl = node.onDblClick;
  node.onDblClick = function (...args) {
    origDbl?.apply(this, args);
    const pos = args[0];
    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0)
      return;
    toggleCompact(this);
  };

  // Compact mode still needs room for: title bar (~24) + slots (~20) +
  // mode widget (~20) + populated_text section (~70) + bottom padding (~30)
  const getMinH = (n) => (isCompact(n) ? 160 : 420);

  const enforceMinHeight = (n) => {
    const minH = getMinH(n);
    if (n.size && n.size[1] < minH) {
      n.size[1] = minH;
    }
  };

  const origResize = node.onResize;
  node.onResize = function () {
    // Enforce before original handler
    enforceMinHeight(this);
    if (origResize) origResize.apply(this, arguments);
    // Enforce again after original handler
    enforceMinHeight(this);
    this.setDirtyCanvas?.(true, true);
  };

  // Also guard setSize so programmatic resizes can't undersize
  const origSetSize = node.setSize;
  node.setSize = function (size) {
    const minH = getMinH(this);
    if (Array.isArray(size) && size[1] < minH) {
      size = [size[0], minH];
    }
    return origSetSize.call(this, size);
  };

  // Wrap node.computeSize to add bottom padding so the node background
  // extends past the last widget (same pattern as other AUN nodes).
  // IMPORTANT: return a NEW array — mutating the original in-place corrupts
  // LiteGraph's internal cached reference, which can freeze the title bar
  // width during manual resize drags.
  // Only adjust height — never touch width here. Width is managed separately
  // by applyCompact (minimum enforcement) and onExecuted (preserve user width).
  if (typeof node.computeSize === "function" && !node.__aunSizePaddingHooked) {
    const origComputeSize = node.computeSize;
    node.__aunSizePaddingHooked = true;
    node.computeSize = function (...args) {
      const result = origComputeSize.apply(this, args);
      if (Array.isArray(result) && result.length >= 2) {
        return [result[0], result[1] + 68]; // Add bottom padding to height
      }
      return result;
    };
  }

  // Tag this node so the canvas-level hook can find it
  node.__aunMinHeightNode = true;

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (...args) {
    origMenu?.apply(this, args);
    const options = args[1];
    if (!options) return;
    const compact = isCompact(this);
    options.push({
      content: compact ? "AUN: Show all controls" : "AUN: Compact mode",
      callback: () => {
        setCompact(this, !isCompact(this));
        applyCompact(this);
      },
    });
  };

  // React to mode changes: show populated_text only when mode is not "off"
  const modeW = getWidget(node, "mode");
  if (modeW && !modeW.__aunModeCallbackHooked) {
    modeW.__aunModeCallbackHooked = true;
    const origCallback = modeW.callback;
    modeW.callback = function (...args) {
      origCallback?.apply(this, args);
      const popW = getWidget(node, "populated_text");
      applyCompact(node);
      // Restore the last populated text when switching out of "off"
      if (popW && popW.value && modeW.value !== "off" && popW.__populatedTextEl) {
        popW.__populatedTextEl.textContent = popW.value;
      }
    };
  }

  applyCompact(node);
}

// ── Extension registration ──

app.registerExtension({
  name: "AUN.WildcardAddToPrompt",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!nodeData || nodeData.name !== "AUNWildcardAddToPrompt") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);

      // ── Selector callback wiring ──
      const textWidget = this.widgets?.find(
        (widget) => widget.name === "wildcards",
      );
      const selectorWidget = this.widgets?.find(
        (widget) => widget.name === "wildcard_selector",
      );
      if (
        !textWidget ||
        !selectorWidget ||
        selectorWidget.__aunWildcardSelectorHooked
      ) {
        return;
      }

      selectorWidget.__aunWildcardSelectorHooked = true;
      selectorWidget.options = selectorWidget.options || {};
      const originalCallback =
        typeof selectorWidget.callback === "function"
          ? selectorWidget.callback
          : null;

      const resetSelector = () => {
        const firstValue =
          selectorWidget.options?.values?.[0] ?? "Select wildcard...";
        selectorWidget.value = firstValue;
      };

      selectorWidget.callback = (value) => {
        try {
          originalCallback?.call(selectorWidget, value);
        } catch (error) {
          console.warn(
            "AUNWildcardAddToPrompt selector callback failed",
            error,
          );
        }

        if (!value || PLACEHOLDER_VALUES.has(String(value))) {
          return;
        }

        textWidget.value = appendWildcardToken(textWidget.value, String(value));

        try {
          textWidget.callback?.(textWidget.value);
        } catch (error) {
          console.warn("AUNWildcardAddToPrompt text callback failed", error);
        }

        resetSelector();
        this.setDirtyCanvas?.(true, true);
        this.graph?.setDirtyCanvas?.(true, true);
      };

      selectorWidget.serializeValue = () =>
        selectorWidget.options?.values?.[0] ?? "Select wildcard...";
      resetSelector();

      // ── Compact mode setup ──
      setupCompact(this);

      // ── Create permanent populated_text widget at the bottom ──
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "2px";
      container.style.padding = "4px 0 8px 0";

      const label = document.createElement("span");
      label.textContent = "Populated:";
      label.style.fontSize = "11px";
      label.style.fontWeight = "bold";
      label.style.color = "#888";
      label.style.textTransform = "uppercase";
      label.style.letterSpacing = "0.5px";

      const el = document.createElement("div");
      el.className = "aun-wildcard-populated-text";
      el.style.whiteSpace = "pre-wrap";
      el.style.wordBreak = "break-word";
      el.style.fontSize = "12px";
      el.style.lineHeight = "1.4";
      el.style.color = "#e0e0e0";
      el.style.padding = "6px 8px";
      el.style.minHeight = "30px";
      el.style.maxHeight = "60px";
      el.style.overflowY = "scroll";
      el.style.borderRadius = "4px";
      el.style.border = "1px solid #444";
      el.style.background = "rgba(0, 0, 0, 0.25)";
      el.textContent = ""; // Empty until workflow runs

      container.appendChild(label);
      container.appendChild(el);

      const widget = this.addDOMWidget(
        "populated_text",
        "populated_text",
        container,
        {
          serialize: false,
          computeSize: function (width) {
            if (this.hidden) return [width || 300, 0];
            // Use a reliable minimum height - scrollHeight is unreliable
            // when the container is not yet in the DOM or text is empty.
            // Label (~16px) + text area min (~36px) + padding (~14px) = ~66px
            const h = container?.scrollHeight ?? 66;
            return [width || 300, Math.max(h, 70)];
          },
        },
      );
      widget._definingNode = this; // Reference for computeSize to check compact state
      widget.__populatedTextEl = el;
      widget.__aunContainer = container;
      // Don't call ensureHiddenAware - our computeSize already handles hidden

      // Trigger resize now that the DOM widget exists (applyCompact ran before this)
      this.widgets_dirty = true;
      requestAnimationFrame(() => {
        this.widgets_dirty = true;
        updateAutoHeight(this);
        this.setDirtyCanvas?.(true, true);
        this.graph?.setDirtyCanvas?.(true, true);
      });
    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      onExecuted?.apply(this, arguments);

      if (!message || !message.populated_text) return;

      const widget = this.widgets?.find(
        (w) => w.name === "populated_text",
      );

      if (!widget) return;

      const text = Array.isArray(message.populated_text)
        ? message.populated_text[0]
        : message.populated_text;
      widget.value = text;
      const modeW = this.widgets?.find((w) => w.name === "mode");
      widget.__populatedTextEl.textContent =
        modeW?.value === "off" ? "" : text;

      // Trigger resize to accommodate the updated text, but preserve any
      // manual width the user set — only grow if the computed width is larger.
      this.widgets_dirty = true;
      requestAnimationFrame(() => {
        this.widgets_dirty = true;
        if (typeof this.computeSize === "function") {
          const [cw, ch] = this.computeSize();
          const curW = this.size?.[0] ?? cw;
          this.setSize([Math.max(curW, cw), ch]);
        }
        this.setDirtyCanvas?.(true, true);
        this.graph?.setDirtyCanvas?.(true, true);
      });
    };
  },

  nodeCreated(node) {
    if (node.comfyClass !== "AUNWildcardAddToPrompt") return;
    setupCompact(node);
  },

  loadedGraphNode(node) {
    if (
      node.comfyClass !== "AUNWildcardAddToPrompt" &&
      node.type !== "AUNWildcardAddToPrompt"
    )
      return;
    setupCompact(node);
    applyCompact(node);
  },

  init() {
    const canvas = app.canvas;

    // Hook into processMouseMove to enforce min height during resize drag.
    // This runs on every mouse move while resizing, before the next frame renders.
    const origProcessMouseMove = canvas.processMouseMove;
    canvas.processMouseMove = function (e) {
      const result = origProcessMouseMove.apply(this, arguments);

      // Check if we're resizing an AUN node
      const node = this.resizingNode;
      if (node && node.__aunMinHeightNode && node.size) {
        const minH = node.properties?.[PROP_KEY] ? 80 : 420;
        if (node.size[1] < minH) {
          node.size[1] = minH;
        }
      }

      return result;
    };

    // Fallback: enforce before every draw in case processMouseMove misses a frame
    const origDraw = canvas.draw;
    canvas.draw = function () {
      const nodes = app.graph?.nodes;
      if (nodes) {
        for (const n of nodes) {
          if (n.__aunMinHeightNode && n.size) {
            const minH = n.properties?.[PROP_KEY] ? 80 : 420;
            if (n.size[1] < minH) {
              n.size[1] = minH;
            }
          }
        }
      }
      return origDraw.apply(this, arguments);
    };
  },
});
