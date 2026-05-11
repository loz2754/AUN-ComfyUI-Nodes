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
    if (
      typeof widget.inputEl.hidden === "boolean" ||
      typeof widget.inputEl.hidden === "number"
    ) {
      widget.inputEl.hidden = hidden;
    }
    if (widget.inputEl.style) {
      widget.inputEl.style.display = hidden ? "none" : "block";
    }
    if (!hidden && widget.inputEl.style) {
      widget.inputEl.style.minHeight = `${widget.comfyHeight ?? 20}px`;
      // Reset to normal height if not expanded
      if (!widget.__AUN_expanded) {
        widget.inputEl.style.height = `${widget.comfyHeight ?? 20}px`;
      }
    }
  }
}

// Global popup state
let currentPopup = null;
let currentTooltip = null;
let tooltipTimer = null;

// Show tooltip with text preview (omit first line, show all remaining)
function showTextTooltip(widget, text) {
  hideTextTooltip();

  if (!widget || !widget.inputEl) return;

  const textPreview = text || "";
  if (!textPreview.trim()) return;

  // Split into lines and omit the first line
  const lines = textPreview.split("\n");
  let previewLines = lines.length > 1 ? lines.slice(1) : [];

  // If no lines after first, show nothing
  if (previewLines.length === 0 || previewLines.every((l) => !l.trim())) return;

  // Show ALL remaining lines (no truncation)
  const preview = previewLines.join("\n");

  const tooltip = document.createElement("div");
  tooltip.id = "AUN-text-tooltip";
  tooltip.style.cssText = `
    position: fixed;
    z-index: 9999;
    background: #224a22;
    color: #d8d8d8;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.4;
    max-width: 400px;
    max-height: 300px;
    overflow-y: auto;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.1);
    white-space: pre-wrap;
    word-break: break-word;
  `;
  tooltip.textContent = preview;

  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  // Position near cursor but keep on screen
  const rect = widget.inputEl.getBoundingClientRect();
  let left = rect.right + 10;
  let top = rect.top;

  // Keep tooltip on screen
  const tooltipRect = tooltip.getBoundingClientRect();
  if (left + tooltipRect.width > window.innerWidth - 10) {
    left = rect.left - tooltipRect.width - 10;
  }
  if (left < 10) left = 10;
  if (top + tooltipRect.height > window.innerHeight - 10) {
    top = window.innerHeight - tooltipRect.height - 10;
  }
  if (top < 10) top = 10;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Hide tooltip
function hideTextTooltip() {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

// Create and show a floating textarea popup for editing
function showTextEditPopup(node, widgetName, widget) {
  // Close any existing popup
  hideTextEditPopup();

  if (!widget || !widget.inputEl) return;

  // Create popup container
  const popup = document.createElement("div");
  popup.id = "AUN-text-edit-popup";
  popup.style.cssText = `
    position: fixed;
    z-index: 10000;
    background: #1a1a1a;
    border: 2px solid #4a90d9;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.8);
    padding: 12px;
    min-width: 400px;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  // Title bar
  const titleBar = document.createElement("div");
  titleBar.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    background: #2a2a2a;
    border-radius: 4px 4px 0 0;
    cursor: move;
  `;

  const title = document.createElement("span");
  title.textContent = `Edit ${widgetName}`;
  title.style.cssText = `
    color: #d8d8d8;
    font: bold 12px sans-serif;
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.style.cssText = `
    background: #ff4444;
    color: white;
    border: none;
    border-radius: 4px;
    width: 24px;
    height: 24px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  `;
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    hideTextEditPopup();
  };

  titleBar.appendChild(title);
  titleBar.appendChild(closeBtn);
  popup.appendChild(titleBar);

  // Textarea
  const textarea = document.createElement("textarea");
  textarea.value = widget.value || "";
  textarea.style.cssText = `
    width: 100%;
    min-height: 200px;
    max-height: 400px;
    padding: 8px;
    background: #242424;
    color: #d8d8d8;
    border: 1px solid #444;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    resize: vertical;
    box-sizing: border-box;
  `;
  popup.appendChild(textarea);

  // Button bar
  const buttonBar = document.createElement("div");
  buttonBar.style.cssText = `
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = `
    padding: 6px 12px;
    background: #444;
    color: #d8d8d8;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
  `;
  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    hideTextEditPopup();
  };

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.cssText = `
    padding: 6px 12px;
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  saveBtn.onclick = (e) => {
    e.stopPropagation();
    // Save the value
    widget.value = textarea.value;
    if (widget.callback) {
      widget.callback.call(widget, widget.value);
    }
    node.setDirtyCanvas?.(true, true);
    hideTextEditPopup();
  };

  buttonBar.appendChild(cancelBtn);
  buttonBar.appendChild(saveBtn);
  popup.appendChild(buttonBar);

  // Position popup near the widget but keep within viewport
  const rect = widget.inputEl?.getBoundingClientRect?.();
  const popupWidth = Math.max(rect?.width || 400, 400);
  const popupHeight = 350; // Estimated height

  let left = rect ? rect.left : window.innerWidth / 2 - popupWidth / 2;
  let top = rect ? rect.bottom + 10 : window.innerHeight / 2 - popupHeight / 2;

  // Keep popup within viewport
  const margin = 10;
  if (left + popupWidth > window.innerWidth - margin) {
    left = window.innerWidth - popupWidth - margin;
  }
  if (left < margin) left = margin;
  if (top + popupHeight > window.innerHeight - margin) {
    top = window.innerHeight - popupHeight - margin;
  }
  if (top < margin) top = margin;

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.width = `${popupWidth}px`;

  document.body.appendChild(popup);
  currentPopup = { popup, widget, widgetName };

  // Focus textarea
  setTimeout(() => {
    textarea.focus();
    textarea.select();
  }, 100);

  // Make draggable
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  titleBar.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragOffsetX = e.clientX - popup.offsetLeft;
    dragOffsetY = e.clientY - popup.offsetTop;
    popup.style.transform = "none"; // Remove centering transform
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    popup.style.left = `${e.clientX - dragOffsetX}px`;
    popup.style.top = `${e.clientY - dragOffsetY}px`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // Close on Escape key
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") {
      hideTextEditPopup();
      document.removeEventListener("keydown", escHandler);
    }
  });

  // Close when clicking outside
  popup.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
}

// Hide and remove the text edit popup
function hideTextEditPopup() {
  if (currentPopup) {
    currentPopup.popup?.remove?.();
    currentPopup = null;
  }
}

// Set up double-click handlers for text widgets
function setupTextEditHandlers(node) {
  if (node.__AUN_textEditHandlersSetup) return;
  node.__AUN_textEditHandlersSetup = true;

  for (let i = 1; i <= 20; i++) {
    const widget = getWidget(node, `text${i}`);
    if (!widget || !widget.inputEl) continue;

    // Double-click to open popup editor
    widget.inputEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTextTooltip(); // Hide tooltip on double-click
      showTextEditPopup(node, `text${i}`, widget);
    });

    // Hover tooltip
    widget.inputEl.addEventListener("mouseenter", (e) => {
      // Delay showing tooltip to avoid flicker
      tooltipTimer = setTimeout(() => {
        showTextTooltip(widget, widget.value);
      }, 500); // Show after 500ms hover
    });

    widget.inputEl.addEventListener("mouseleave", () => {
      hideTextTooltip();
    });
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
    // Save initial slot_count before anything else happens
    if (!node.__AUN_initialSlotCount) {
      node.__AUN_initialSlotCount = Number(slotCountWidget.value) || 2;
    }

    const origCb = slotCountWidget.callback;
    slotCountWidget.callback = function callback(value) {
      origCb?.call(slotCountWidget, value);

      // Save slot_count to properties for persistence
      const newValue = Number(slotCountWidget.value);
      if (newValue >= 1 && newValue <= 20) {
        node.properties._AUN_slotCount = newValue;
        node.__AUN_initialSlotCount = newValue;
      }

      node.setDirtyCanvas?.(true, true);
      setTimeout(() => {
        if (node && node.widgets) {
          setCompact(node, false);
          syncSlotVisibility(node);
          applyCompact(node);
        }
      }, 300);
    };

    if (slotCountWidget.inputEl) {
      const origOnBlur = slotCountWidget.inputEl.onblur;
      slotCountWidget.inputEl.onblur = function (e) {
        if (node.properties) {
          node.properties[PROP_KEY] = false;
        }
        return origOnBlur?.apply(this, arguments);
      };
    }
  }

  const originalDblClick = node.onDblClick;
  node.onDblClick = function onDblClick(event, pos) {
    originalDblClick?.apply(this, arguments);
    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) {
      return;
    }
    toggleCompactMode(this);
  };

  // Hook onConfigure to restore slot_count AFTER ComfyUI restores widget values
  const originalOnConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    // Call original first so widget values are restored
    if (originalOnConfigure) {
      originalOnConfigure.apply(this, arguments);
    }

    // Now restore slot_count from our saved value
    if (slotCountWidget) {
      let savedValue = null;

      // Try properties first (persists across reloads)
      if (node.properties && node.properties._AUN_slotCount) {
        savedValue = node.properties._AUN_slotCount;
      }

      // Fall back to initial saved value
      if (!savedValue && node.__AUN_initialSlotCount) {
        savedValue = node.__AUN_initialSlotCount;
      }

      // If we have a saved value and it's different from current, restore it
      if (savedValue && Number(slotCountWidget.value) !== savedValue) {
        slotCountWidget.value = savedValue;
        if (slotCountWidget.inputEl) {
          slotCountWidget.inputEl.value = savedValue;
        }
        // Also update index max
        if (indexWidget) {
          indexWidget.options.max = savedValue;
          if (indexWidget.inputEl) {
            indexWidget.inputEl.setAttribute("max", savedValue);
            indexWidget.inputEl.max = savedValue;
          }
          // Clamp index value
          if (Number(indexWidget.value) > savedValue) {
            indexWidget.value = savedValue;
            if (indexWidget.inputEl) {
              indexWidget.inputEl.value = savedValue;
            }
          }
        }
      }

      // ALWAYS re-apply visibility after restoring slot_count
      syncSlotVisibility(node);
      applyCompact(node);
    }
  };

  // Run sync on initial load
  syncSlotVisibility(node);
  applyCompact(node);

  // Set up double-click handlers for text widget editing
  setupTextEditHandlers(node);

  startCompactLiveMonitor(node);
  scheduleAutoHeightUpdate(node, 5, 50);

  return true;
}

// Ensure all text widgets up to slotCount exist
function ensureTextWidgetsExist(node, slotCount) {
  if (!node || !node.widgets) return;

  for (let i = 1; i <= slotCount; i++) {
    const widgetName = `text${i}`;
    if (!getWidget(node, widgetName)) {
      // Create missing widget
      const newWidget = {
        name: widgetName,
        type: "TEXT",
        value: `Slot ${i}`,
        hidden: true,
        options: {},
        computeSize: function (w) {
          return [w || 300, 40];
        },
      };
      node.widgets.push(newWidget);
    }
  }
}

function syncSlotVisibility(node) {
  if (!node) return;

  const slotCountWidget = getWidget(node, "slot_count");
  if (!slotCountWidget) return;

  // Use the current slot_count value - NEVER correct it
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
    if (currentIndex > slotCount || currentIndex < 1) {
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

  // Mark widgets as dirty so ComfyUI recalculates layout
  node.widgets_dirty = true;

  // Resize using ComfyUI's built-in computeSize with extra bottom padding
  if (
    typeof node.computeSize === "function" &&
    typeof node.setSize === "function"
  ) {
    try {
      const newSize = node.computeSize();
      if (newSize && Array.isArray(newSize) && newSize.length >= 2) {
        // Add extra padding at the bottom (15px)
        node.setSize([newSize[0], newSize[1] + 15]);
      }
    } catch (e) {
      // ignore
    }
  }

  if (typeof node.setDirtyCanvas === "function") {
    node.setDirtyCanvas(true, true);
  }
  if (typeof app?.graph?.setDirtyCanvas === "function") {
    app.graph.setDirtyCanvas(true, true);
  }

  // Schedule a few more resize attempts to catch any late updates
  scheduleAutoHeightUpdate(node, 5, 50);
}

function applyCompact(node) {
  if (!isTargetNode(node)) return;

  // Preserve current compact state
  const wasCompact = isCompact(node);

  const slotCountWidget = getWidget(node, "slot_count");
  if (!slotCountWidget) return;

  // Use the current slot_count value without correcting it
  const slotCount = Math.max(
    1,
    Math.min(20, Math.floor(Number(slotCountWidget.value) || 2)),
  );

  // In compact mode, hide all text widgets
  // In normal mode, show based on slot_count
  for (let i = 1; i <= 20; i++) {
    const textWidget = getWidget(node, `text${i}`);
    if (textWidget) {
      applyWidgetHiddenState(textWidget, wasCompact || i > slotCount);
    }
  }

  // Mark widgets as dirty so ComfyUI recalculates layout
  node.widgets_dirty = true;

  // Resize using ComfyUI's built-in computeSize with extra bottom padding
  if (
    typeof node.computeSize === "function" &&
    typeof node.setSize === "function"
  ) {
    try {
      const newSize = node.computeSize();
      if (newSize && Array.isArray(newSize) && newSize.length >= 2) {
        // Add extra padding at the bottom (15px)
        node.setSize([newSize[0], newSize[1] + 15]);
      }
    } catch (e) {
      // ignore
    }
  }

  // Restore compact state if it changed
  if (isCompact(node) !== wasCompact) {
    setCompact(node, wasCompact);
  }

  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas(true, true);

  // Schedule a few more resize attempts to catch any late updates
  scheduleAutoHeightUpdate(node, 5, 50);
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

function scheduleAutoHeightUpdate(node, tries = 8, delay = 30) {
  if (!node) return;
  let count = 0;
  function update() {
    if (++count > tries) return;

    // Use ComfyUI's built-in computeSize which respects widget.hidden
    if (
      typeof node.computeSize === "function" &&
      typeof node.setSize === "function"
    ) {
      try {
        const newSize = node.computeSize();
        if (newSize && Array.isArray(newSize) && newSize.length >= 2) {
          // Add extra padding at the bottom (15px)
          const paddedHeight = newSize[1] + 15;

          // Only resize if height differs by more than 5px
          if (Math.abs(node.size[1] - paddedHeight) > 5) {
            node.setSize([newSize[0], paddedHeight]);
            node.setDirtyCanvas?.(true, true);
          }
        }
      } catch (e) {
        // ignore computeSize errors
      }
    }

    setTimeout(update, delay);
  }
  setTimeout(update, delay);
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

// --- Polyfills ---
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
    const r = typeof radii === "number" ? radii : (radii?.[0] ?? 0);
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
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

      nodeType.prototype.__AUN_textIndexSwitch3ProtoInit = true;
    },

    nodeCreated(node) {
      patchTargetNode(node);
    },

    loadedGraphNode(node) {
      // Restore slot_count and index from aun_pginfo if available
      const pginfo = app.globalData?.aun_pginfo || {};
      const nodeData = pginfo?.[String(node.id)];

      if (nodeData && nodeData.node === NODE_TYPE) {
        const slotCountWidget = getWidget(node, "slot_count");
        const indexWidget = getWidget(node, "index");

        if (slotCountWidget && nodeData.slot_count) {
          slotCountWidget.value = nodeData.slot_count;
          if (slotCountWidget.inputEl) {
            slotCountWidget.inputEl.value = nodeData.slot_count;
          }
        }

        if (indexWidget && nodeData.index) {
          indexWidget.value = nodeData.index;
          if (indexWidget.inputEl) {
            indexWidget.inputEl.value = nodeData.index;
          }
        }
      }

      patchTargetNode(node);
    },
  });
} catch (err) {
  console.error("[AUNTextIndexSwitch3.js] registerExtension failed", err);
}

// Listen for aun_pginfo updates from Python
if (typeof app?.extensionLib?.registerCallback === "function") {
  // Try to register for custom events if available
} else if (typeof window?.addEventListener === "function") {
  // Fallback: poll for pginfo updates
  setInterval(() => {
    if (app.globalData?.aun_pginfo) {
      const pginfo = app.globalData.aun_pginfo;
      for (const nodeId in pginfo) {
        if (pginfo[nodeId]?.node === NODE_TYPE) {
          const node = app.graph?.getNodeById?.(parseInt(nodeId));
          if (node) {
            const slotCountWidget = getWidget(node, "slot_count");
            const indexWidget = getWidget(node, "index");

            if (
              slotCountWidget &&
              pginfo[nodeId].slot_count &&
              Number(slotCountWidget.value) !== pginfo[nodeId].slot_count
            ) {
              slotCountWidget.value = pginfo[nodeId].slot_count;
              if (slotCountWidget.inputEl) {
                slotCountWidget.inputEl.value = pginfo[nodeId].slot_count;
              }
            }

            if (
              indexWidget &&
              pginfo[nodeId].index &&
              Number(indexWidget.value) !== pginfo[nodeId].index
            ) {
              indexWidget.value = pginfo[nodeId].index;
              if (indexWidget.inputEl) {
                indexWidget.inputEl.value = pginfo[nodeId].index;
              }
            }
          }
        }
      }
    }
  }, 500);
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
