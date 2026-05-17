import { app } from "../../scripts/app.js";

// AUN Add To Prompt Multi - Dynamic visibility & compact mode
// Hides addon slots beyond num_addons by default, supports compact mode via double-click or right-click menu.

const NODE_CLASS = "AUNAddToPromptMulti";
const MAX_ADDONS = 10;
const PROP_COMPACT = "_AUN_compactMode";

// --- Helpers ---

function getWidget(node, name) {
  if (!node || !node.widgets) return null;
  return node.widgets.find((w) => w.name === name) ?? null;
}

function clampAddons(v) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return 1;
  return Math.max(1, Math.min(MAX_ADDONS, n));
}

function isCompact(node) {
  return node?.properties?.[PROP_COMPACT] === true;
}

function setCompact(node, value) {
  if (!node.properties) node.properties = {};
  node.properties[PROP_COMPACT] = !!value;
}

// --- Hidden-aware widget (from AUN_multi_neg_prompt_visibility.js pattern) ---

function ensureHiddenAwareWidget(widget) {
  if (!widget || widget.__aun_atpm_hiddenAware) return;
  widget.__aun_atpm_hiddenAware = true;

  const origComputeSize = widget.computeSize;
  // ComfyUI multiline textareas have type "customtext" and options.multiline === true
  const isMultiline =
    widget.type === "customtext" ||
    widget.type === "text" ||
    widget.options?.multiline === true;

  widget.computeSize = function (width) {
    if (this.hidden) {
      return [width, 0];
    }
    let [w, h] = origComputeSize
      ? origComputeSize.apply(this, arguments)
      : [width, this.comfyHeight ?? 20];
    // Multiline textareas need a usable minimum height (but not so tall it overlaps the next widget)
    if (isMultiline) {
      h = Math.max(h, 100);
      this.comfyHeight = h;
    }
    return [w, h];
  };

  // Also enforce min-height on the textarea DOM element directly
  if (isMultiline && widget.inputEl) {
    widget.inputEl.style.minHeight = "80px";
  }
}

function applyWidgetHiddenState(widget, hidden) {
  if (!widget) return;
  ensureHiddenAwareWidget(widget);
  widget.hidden = !!hidden;
  if (widget.flags) {
    widget.flags.hidden = !!hidden;
    widget.flags.collapsed = !!hidden;
  }
  if (widget.options) {
    widget.options.noDraw = !!hidden;
  }
  if (widget.inputEl?.style) {
    widget.inputEl.style.display = hidden ? "none" : "";
  }
}

// --- Node visibility update ---

function updateNodeVisibility(node) {
  try {
    const numAddonsWidget = getWidget(node, "num_addons");
    const numAddons = clampAddons(numAddonsWidget?.value ?? 1);
    const compact = isCompact(node);

    // Master prompt and num_addons visibility
    const masterPromptWidget = getWidget(node, "master_prompt");
    applyWidgetHiddenState(masterPromptWidget, compact);
    applyWidgetHiddenState(numAddonsWidget, compact);

    // Addon widgets
    for (let i = 1; i <= MAX_ADDONS; i++) {
      const modeW = getWidget(node, `text_to_add${i}_mode`);
      const textW = getWidget(node, `text_to_add${i}`);
      const orderW = getWidget(node, `order${i}`);

      if (compact) {
        // In compact mode, hide all addon widgets
        applyWidgetHiddenState(modeW, true);
        applyWidgetHiddenState(textW, true);
        applyWidgetHiddenState(orderW, true);
      } else {
        // In full mode, show only active slots
        const isActive = i <= numAddons;
        applyWidgetHiddenState(modeW, !isActive);
        applyWidgetHiddenState(textW, !isActive);
        applyWidgetHiddenState(orderW, !isActive);
      }
    }

    // Trigger resize
    node.widgets_dirty = true;
    const [w, h] = node.computeSize();
    if (compact) {
      // Compact mode: title bar (~36px) + padding + numAddons rows (~24px each)
      // Only constrain height — preserve user's manual width
      const minH = 40 + numAddons * 24;
      node.setSize([node.size[0], Math.max(h, minH)]);
    } else {
      // Full mode: preserve user's manual width, ensure computed height is at least reasonable
      node.setSize([node.size[0], Math.max(h, 120)]);
    }
    node.setDirtyCanvas(true, true);

    // Update overlay visibility
    updateOverlayVisibility(node);
  } catch (e) {
    console.error("[AUNAddToPromptMulti] Error in updateNodeVisibility:", e);
  }
}

// --- Compact mode overlay UI ---

function ensureStyles() {
  if (document.getElementById("aun-atpm-overlay-styles")) return;
  const style = document.createElement("style");
  style.id = "aun-atpm-overlay-styles";
  style.textContent = `
    .AUN-atpm-overlay-row {
      position: fixed;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      pointer-events: none;
      z-index: 1;
      font-size: 12px;
      font-family: var(--comfy-font-family, sans-serif);
      color: #ddd;
      white-space: nowrap;
    }
    .AUN-atpm-overlay-row > * {
      pointer-events: auto;
    }
    .AUN-atpm-overlay-row label {
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
      user-select: none;
    }
    .AUN-atpm-mode-select {
      font-size: 11px;
      font-family: var(--comfy-font-family, sans-serif);
      color: #ddd;
      background: #444;
      border: 1px solid #666;
      border-radius: 3px;
      padding: 1px 2px;
      cursor: pointer;
      min-width: 38px;
    }
    .AUN-atpm-mode-select:hover {
      border-color: #0096cf;
    }
    .AUN-atpm-mode-select option[value="on"] {
      background: #2a6e3f;
    }
    .AUN-atpm-mode-select option[value="off"] {
      background: #555;
    }
    .AUN-atpm-mode-select option[value="random"] {
      background: #6e5a2a;
    }
    .AUN-atpm-order-select {
      font-size: 11px;
      font-family: var(--comfy-font-family, sans-serif);
      color: #ddd;
      background: #444;
      border: 1px solid #666;
      border-radius: 3px;
      padding: 1px 4px;
      cursor: pointer;
      margin-left: auto;
    }
    .AUN-atpm-order-select:hover {
      border-color: #0096cf;
    }
  `;
  document.head.appendChild(style);
}

function getAddonLabel(node, index) {
  const textW = getWidget(node, `text_to_add${index}`);
  if (textW && textW.value && textW.value.trim()) {
    const firstLine = textW.value.trim().split("\n")[0];
    return firstLine.length > 40 ? firstLine.slice(0, 40) + "…" : firstLine;
  }
  return `Addon ${index}`;
}

function applyModeSelectStyle(selectEl) {
  if (!selectEl) return;
  const val = selectEl.value;
  if (val === "on") {
    selectEl.style.background = "#2a6e3f";
  } else if (val === "random") {
    selectEl.style.background = "#6e5a2a";
  } else {
    selectEl.style.background = "#555";
  }
}

function createOverlayRows(node) {
  ensureStyles();

  // Remove existing rows first
  if (node.__aun_atpm_rows) {
    for (const row of node.__aun_atpm_rows) {
      if (row?.parentNode) row.parentNode.removeChild(row);
    }
  }

  const rows = [];
  for (let i = 1; i <= MAX_ADDONS; i++) {
    const row = document.createElement("div");
    row.className = "AUN-atpm-overlay-row";
    row.style.display = "none";

    // Mode selector (on/off/random)
    const modeSelect = document.createElement("select");
    modeSelect.className = "AUN-atpm-mode-select";
    modeSelect.innerHTML =
      '<option value="on">on</option>' +
      '<option value="off">off</option>' +
      '<option value="random">rnd</option>';
    modeSelect.title = "Mode: on=always add, off=never add, random=50/50 chance";
    modeSelect.addEventListener("change", () => {
      const modeW = getWidget(node, `text_to_add${i}_mode`);
      if (modeW) {
        modeW.value = modeSelect.value;
        if (modeW.callback) modeW.callback(modeSelect.value);
        node.setDirtyCanvas(true, true);
      }
      applyModeSelectStyle(modeSelect);
    });

    const label = document.createElement("label");

    // Order selector (before/after prompt)
    const orderSelect = document.createElement("select");
    orderSelect.className = "AUN-atpm-order-select";
    orderSelect.innerHTML =
      '<option value="prompt_first">After</option>' +
      '<option value="addon_first">Before</option>';
    orderSelect.title = "Place addon before or after the main prompt";
    orderSelect.addEventListener("change", () => {
      const orderW = getWidget(node, `order${i}`);
      if (orderW) {
        orderW.value = orderSelect.value;
        if (orderW.callback) orderW.callback(orderSelect.value);
        node.setDirtyCanvas(true, true);
      }
    });

    row.appendChild(modeSelect);
    row.appendChild(label);
    row.appendChild(orderSelect);
    document.body.appendChild(row);
    rows.push(row);
  }

  node.__aun_atpm_rows = rows;
}

function updateOverlayVisibility(node) {
  if (!node.__aun_atpm_rows) return;

  const compact = isCompact(node);
  const numAddonsWidget = getWidget(node, "num_addons");
  const numAddons = clampAddons(numAddonsWidget?.value ?? 1);

  for (let i = 1; i <= MAX_ADDONS; i++) {
    const row = node.__aun_atpm_rows[i - 1];
    if (!row) continue;

    if (compact && i <= numAddons) {
      row.style.display = "flex";
      const modeW = getWidget(node, `text_to_add${i}_mode`);
      const modeSelect = row.querySelector("select.AUN-atpm-mode-select");
      if (modeSelect && modeW) {
        modeSelect.value = modeW.value ?? "off";
        applyModeSelectStyle(modeSelect);
      }
      row.querySelector("label").textContent = getAddonLabel(node, i);
      const orderW = getWidget(node, `order${i}`);
      const orderSelect = row.querySelector("select.AUN-atpm-order-select");
      if (orderSelect && orderW) {
        orderSelect.value = orderW.value ?? "prompt_first";
      }
    } else {
      row.style.display = "none";
    }
  }
}

// Debounced overlay position update (per-node, not global RAF loop)
const overlayRAFMap = new WeakMap();

function scheduleOverlayUpdate(node) {
  if (overlayRAFMap.has(node)) return;
  const rafId = requestAnimationFrame(() => {
    overlayRAFMap.delete(node);
    positionOverlays(node);
  });
  overlayRAFMap.set(node, rafId);
}

function cancelOverlayUpdate(node) {
  const rafId = overlayRAFMap.get(node);
  if (rafId) {
    cancelAnimationFrame(rafId);
    overlayRAFMap.delete(node);
  }
}

function positionOverlays(node) {
  if (!node || !node.__aun_atpm_rows || !isCompact(node)) return;

  // Hide overlay when node is collapsed
  if (node.collapsed) {
    node.__aun_atpm_wasCollapsed = true;
    for (let i = 0; i < node.__aun_atpm_rows.length; i++) {
      const row = node.__aun_atpm_rows[i];
      if (row) row.style.display = "none";
    }
    return;
  }

  // Node was collapsed and just expanded — restore overlay visibility
  if (node.__aun_atpm_wasCollapsed) {
    node.__aun_atpm_wasCollapsed = false;
    updateOverlayVisibility(node);
  }

  try {
    const canvas = app.canvas;
    if (!canvas || !canvas.canvas) return;

    const canvasRect = canvas.canvas.getBoundingClientRect();
    const ds = canvas.ds;
    if (!ds) return;

    const scale = ds.scale;
    const panOffsetX = ds.offset[0];
    const panOffsetY = ds.offset[1];

    // Convert node position to screen coordinates
    const screenX = canvasRect.left + (node.pos[0] + panOffsetX) * scale;
    const screenY = canvasRect.top + (node.pos[1] + panOffsetY) * scale;
    const nodeWidth = node.size[0] * scale;

    const numAddonsWidget = getWidget(node, "num_addons");
    const numAddons = clampAddons(numAddonsWidget?.value ?? 1);

    const titleBarHeight = 28 * scale;
    const lineHeight = 20 * scale;
    const leftPad = 8 * scale;

    for (let i = 1; i <= MAX_ADDONS; i++) {
      const row = node.__aun_atpm_rows[i - 1];
      if (!row || row.style.display === "none") continue;

      row.style.left = `${screenX + leftPad}px`;
      row.style.top = `${screenY + titleBarHeight + (i - 1) * lineHeight}px`;
      row.style.width = `${nodeWidth - leftPad * 2}px`;
    }
  } catch (e) {
    // Ignore position errors during drag
  }
}

// --- Compact mode toggle ---

function toggleCompact(node) {
  const newVal = !isCompact(node);
  setCompact(node, newVal);
  updateNodeVisibility(node);
}

// --- Node patching ---

function patchNode(node) {
  if (node.__aun_atpm_patched) return;
  node.__aun_atpm_patched = true;

  // Ensure all widgets are hidden-aware
  for (const w of node.widgets || []) {
    ensureHiddenAwareWidget(w);
  }

  // Create overlay rows
  createOverlayRows(node);

  // Hook num_addons callback
  const numAddonsWidget = getWidget(node, "num_addons");
  if (numAddonsWidget) {
    const origCb = numAddonsWidget.callback;
    numAddonsWidget.callback = function (value) {
      const result = origCb?.apply(this, arguments);
      setTimeout(() => updateNodeVisibility(node), 10);
      return result;
    };
  }

  // Hook onDrawForeground for overlay positioning
  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    const result = origDrawFg?.apply(this, arguments);
    if (isCompact(this)) {
      scheduleOverlayUpdate(this);
    }
    return result;
  };

  // Double-click to toggle compact
  const origDblClick = node.onDblClick;
  node.onDblClick = function (...args) {
    origDblClick?.apply(this, arguments);
    toggleCompact(this);
  };

  // Right-click menu option
  const origGetMenuOptions = node.getMenuOptions;
  node.getMenuOptions = function () {
    const options = origGetMenuOptions ? origGetMenuOptions.apply(this, arguments) : [];
    options.push({
      content: isCompact(this) ? "AUN: Show all controls" : "AUN: Compact mode",
      callback: () => toggleCompact(this),
    });
    return options;
  };

  // Override onConfigure to restore state on workflow load
  const origConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    if (origConfigure) origConfigure.apply(this, arguments);
    // Restore compact mode from properties
    setTimeout(() => {
      updateNodeVisibility(node);
    }, 50);
  };

  // Enforce minimum height on manual resize
  const origResize = node.onResize;
  node.onResize = function () {
    const numAddonsWidget = getWidget(node, "num_addons");
    const numAddons = clampAddons(numAddonsWidget?.value ?? 1);
    const compact = isCompact(node);

    if (compact) {
      // Compact mode: title bar + numAddons checkbox rows
      const minH = 40 + numAddons * 24;
      if (this.size[1] < minH) {
        this.size[1] = minH;
      }
    } else {
      // Full mode: master_prompt (100px) + num_addons (20px) + at least 1 addon slot (~140px)
      const minH = 260;
      if (this.size[1] < minH) {
        this.size[1] = minH;
      }
    }

    if (origResize) origResize.apply(this, arguments);
  };

  // Cleanup on node removal
  const origRemoved = node.onRemoved;
  node.onRemoved = function () {
    cancelOverlayUpdate(node);
    if (node.__aun_atpm_rows) {
      for (const row of node.__aun_atpm_rows) {
        if (row?.parentNode) row.parentNode.removeChild(row);
      }
      delete node.__aun_atpm_rows;
    }
    origRemoved?.apply(this, arguments);
  };

  // Apply initial visibility
  setTimeout(() => updateNodeVisibility(node), 100);
}

// --- Extension registration ---

app.registerExtension({
  name: "AUN.AddToPromptMulti",

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    patchNode(node);
  },

  async loadedGraphNode(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    patchNode(node);
  },
});
