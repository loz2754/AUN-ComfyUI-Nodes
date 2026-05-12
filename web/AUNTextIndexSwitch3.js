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

// Compact label overlay management
const compactOverlays = new WeakMap();

// Track links that should be hidden (links going to hidden inputs on compact nodes)
const hiddenLinks = new Set();

function shouldHideLink(linkId) {
  return hiddenLinks.has(linkId);
}

// Hook into ComfyUI's canvas drawing to skip hidden links
if (!window.__AUN_linkFilterHook) {
  window.__AUN_linkFilterHook = true;
  const origDrawConnections = app.canvas?.drawConnections;
  if (origDrawConnections) {
    app.canvas.drawConnections = function (...args) {
      // Filter out links that should be hidden
      const originalLinks = app.graph.links;
      const tempHidden = new Map();

      // Temporarily remove hidden links
      for (const linkId of hiddenLinks) {
        const link = originalLinks.get?.(linkId);
        if (link) {
          tempHidden.set(linkId, link);
          originalLinks.delete(linkId);
        }
      }

      // Draw connections
      const result = origDrawConnections.apply(this, args);

      // Restore hidden links
      for (const [linkId, link] of tempHidden) {
        originalLinks.set(linkId, link);
      }

      return result;
    };
  }

  // Also hook into drawSlotHints to hide slot dots for compact nodes
  const origDrawSlotHints = app.canvas?.drawSlotHints;
  if (origDrawSlotHints) {
    app.canvas.drawSlotHints = function (...args) {
      origDrawSlotHints.apply(this, args);
    };
  }
}

// Update hidden links set based on compact mode state
function updateHiddenLinks() {
  hiddenLinks.clear();

  if (!app?.graph) return;

  const nodes = app.graph._nodes || app.graph.nodes || [];
  for (const node of nodes) {
    if (!isTargetNode(node)) continue;

    if (!node.inputs) continue;

    for (const input of node.inputs) {
      if (!input || !input.link) continue;

      // Hide links to text inputs in compact mode
      if (input.name && input.name.startsWith("text")) {
        if (isCompact(node)) {
          hiddenLinks.add(input.link);
        }
      }

      // Hide link to index input in compact mode
      if (input.name === "index" && isCompact(node)) {
        hiddenLinks.add(input.link);
      }
    }
  }
}

function getCompactOverlay(node) {
  if (compactOverlays.has(node)) return compactOverlays.get(node);

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    z-index: 11;
    pointer-events: none;
    display: none;
  `;

  const label = document.createElement("div");
  label.style.cssText = `
    padding: 2px 6px;
    background: rgba(0,0,0,0.55);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    color: rgba(240,240,240,0.98);
    font: 11px sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 115px;
  `;

  const hint = document.createElement("span");
  hint.style.cssText = `
    display: inline-block;
    margin-left: 4px;
    color: rgba(200,200,200,0.6);
    font: 9px sans-serif;
    white-space: nowrap;
  `;
  hint.textContent = "(dbl-click to view)";

  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
  `;
  container.appendChild(label);
  container.appendChild(hint);
  overlay.appendChild(container);
  document.body.appendChild(overlay);

  const ov = { overlay, label, hint, container };
  compactOverlays.set(node, ov);
  return ov;
}

// Helper to get effective index for a node (from source if linked, otherwise widget)
function getEffectiveIndex(node) {
  if (!node) return 1;

  // Check if index input is linked
  const indexInput = node.inputs?.find((i) => i.name === "index");
  if (indexInput?.link) {
    const link = app.graph.links?.get?.(indexInput.link);
    if (link?.origin_id) {
      const srcNode = app.graph.getNodeById?.(link.origin_id);
      if (srcNode) {
        // Check AUNRandomIndexSwitch
        const selectWidget = srcNode.widgets?.find((w) => w.name === "select");
        if (selectWidget !== undefined) return selectWidget.value;

        // Check int constant nodes
        const valueWidget = srcNode.widgets?.find(
          (w) =>
            w.type === "NUMBER" || w.name === "value" || w.name === "number",
        );
        if (valueWidget !== undefined) return Number(valueWidget.value);

        // Check other index switches
        const idxWidget = srcNode.widgets?.find(
          (w) => w.name === "index" || w.name === "idx" || w.name === "i",
        );
        if (idxWidget !== undefined) return Number(idxWidget.value);
      }
    }
  }

  // Fallback to widget value
  const indexWidget = getWidget(node, "index");
  return Number(indexWidget?.value ?? 1);
}

// Update overlay position only (no content refresh) for real-time drag tracking
function updateCompactOverlayPosition(node) {
  if (!node || !isCompact(node)) {
    return;
  }

  const ov = compactOverlays.get(node);
  if (!ov || ov.overlay.style.display === "none") {
    return;
  }

  const canvas = app.canvas;
  if (!canvas || !canvas.canvas) {
    return;
  }

  try {
    const canvasRect = canvas.canvas.getBoundingClientRect();
    const ds = canvas.ds;
    if (!ds) {
      return;
    }

    const scale = ds.scale;
    const panOffsetX = ds.offset[0];
    const panOffsetY = ds.offset[1];

    // Convert node position to screen coordinates
    const screenX = canvasRect.left + (node.pos[0] + panOffsetX) * scale;
    const screenY = canvasRect.top + (node.pos[1] + panOffsetY) * scale;

    // Label position: 6px from left, 28px from top (in node-local coordinates, scaled)
    const labelX = screenX + 6 * scale;
    const labelY = screenY + 28 * scale;

    ov.overlay.style.left = `${labelX}px`;
    ov.overlay.style.top = `${labelY}px`;
  } catch (e) {
    // ignore position errors during drag
  }
}

// Helper to get effective text for a slot (traces external links to source node)
function getEffectiveText(node, slotIndex) {
  if (!node) return "";

  const textName = `text${slotIndex}`;

  // Check if this text input is linked externally
  const textInput = node.inputs?.find((i) => i.name === textName);
  if (textInput?.link) {
    const link = app.graph.links?.get?.(textInput.link);
    if (link?.origin_id) {
      const srcNode = app.graph.getNodeById?.(link.origin_id);
      if (srcNode) {
        // Try to find a text/string widget on the source node
        const textWidget = srcNode.widgets?.find((w) => {
          const type = (w.type || "").toUpperCase();
          const name = (w.name || "").toLowerCase();
          return (
            type === "TEXT" ||
            type === "STRING" ||
            name === "value" ||
            name === "prompt" ||
            name === "text" ||
            name === "conditioning"
          );
        });

        if (textWidget && typeof textWidget.value === "string") {
          return textWidget.value;
        }

        // Fallback: use node title if no text widget found
        if (srcNode.title) return srcNode.title;
        if (srcNode.type) return srcNode.type;
      }
    }
  }

  // Fallback to local widget value
  const localWidget = getWidget(node, textName);
  if (localWidget && typeof localWidget.value === "string") {
    return localWidget.value;
  }
  return "";
}

function updateCompactOverlay(node, overrideIndex, force = false) {
  if (!node || !isCompact(node)) {
    const ov = compactOverlays.get(node);
    if (ov) ov.overlay.style.display = "none";
    return;
  }

  const ov = getCompactOverlay(node);

  // Use overrideIndex if provided, otherwise trace for effective index
  const effectiveIndex =
    overrideIndex !== undefined && overrideIndex !== null
      ? overrideIndex
      : getEffectiveIndex(node);

  // Optimization: Only update DOM if index or node position changed, or if forced
  const lastIdx = node.__AUN_lastOverlayIdx;
  const lastPos = node.__AUN_lastOverlayPos;
  const currentPos = node.pos ? `${node.pos[0]},${node.pos[1]}` : "";

  if (!force && lastIdx === effectiveIndex && lastPos === currentPos) {
    return;
  }
  node.__AUN_lastOverlayIdx = effectiveIndex;
  node.__AUN_lastOverlayPos = currentPos;

  // Get text using effective index - traces external links if present
  const effectiveText = getEffectiveText(node, effectiveIndex);


  // Check if this text slot is externally linked
  const isLinked = isTextSlotLinked(node, effectiveIndex);

  let title = "";
  let hasMoreLines = false;

  if (isLinked) {
    // For linked inputs, show the source node's title
    const textName = `text${effectiveIndex}`;
    const textInput = node.inputs?.find((i) => i.name === textName);
    if (textInput?.link) {
      const link = app.graph.links?.get?.(textInput.link);
      if (link?.origin_id) {
        const srcNode = app.graph.getNodeById?.(link.origin_id);
        if (srcNode) {
          title = srcNode.title || srcNode.type || "";
        }
      }
    }
    // Linked inputs show "more lines" hint if there's text content to preview
    if (typeof effectiveText === "string") {
      const text = effectiveText || "";
      const lines = text.split("\n");
      hasMoreLines = lines.length > 1 && lines.slice(1).some((l) => l.trim());
    }
  } else {
    // For non-linked inputs, show the first line of text
    if (typeof effectiveText === "string") {
      title = effectiveText.split("\n")[0].trim();
      const lines = effectiveText.split("\n");
      hasMoreLines = lines.length > 1 && lines.slice(1).some((l) => l.trim());
    }
  }

  if (!title) {
    ov.overlay.style.display = "none";
    return;
  }

  ov.label.textContent = title;
  ov.hint.style.display = hasMoreLines ? "inline-block" : "none";

  // Position overlay - use the same approach as LoRA stacker
  const canvas = app.canvas;
  if (!canvas || !canvas.canvas) {
    ov.overlay.style.display = "none";
    return;
  }

  try {
    const canvasRect = canvas.canvas.getBoundingClientRect();
    const ds = canvas.ds;
    if (!ds) {
      ov.overlay.style.display = "none";
      return;
    }

    const scale = ds.scale;
    const panOffsetX = ds.offset[0];
    const panOffsetY = ds.offset[1];

    // Convert node position to screen coordinates
    // Node position is in graph coordinates, need to apply zoom and pan
    const screenX = canvasRect.left + (node.pos[0] + panOffsetX) * scale;
    const screenY = canvasRect.top + (node.pos[1] + panOffsetY) * scale;

    // Label position: 6px from left, 28px from top (in node-local coordinates, scaled)
    const labelX = screenX + 6 * scale;
    const labelY = screenY + 28 * scale;

    ov.overlay.style.display = "block";
    ov.overlay.style.left = `${labelX}px`;
    ov.overlay.style.top = `${labelY}px`;
  } catch (e) {
    console.warn("[AUNTextIndexSwitch3] Failed to position overlay:", e);
    ov.overlay.style.display = "none";
  }
}

// Global update loop for all compact overlays
if (!window.__AUN_compactOverlayUpdateLoop) {
  window.__AUN_compactOverlayUpdateLoop = setInterval(() => {
    if (!app?.graph) return;

    // Update hidden links set
    updateHiddenLinks();

    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const node of nodes) {
      if (isTargetNode(node)) {
        const effectiveIdx = getEffectiveIndex(node);
        updateCompactOverlay(node, effectiveIdx);
      }
    }
  }, 100);
}

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

// Check if a text slot is linked externally
function isTextSlotLinked(node, slotIndex) {
  const textName = `text${slotIndex}`;
  const textInput = node.inputs?.find((i) => i.name === textName);
  return !!(textInput && textInput.link);
}

// Show popup for compact label (shows all text content)
function showCompactLabelPopup(node) {
  if (!node || !isCompact(node)) return;

  // Use effective index (traces external links)
  const effectiveIndex = getEffectiveIndex(node);

  // Use effective text (traces external links)
  const text = getEffectiveText(node, effectiveIndex);
  if (!text.trim()) return;

  // Check if this slot is externally linked
  const isExternallyLinked = isTextSlotLinked(node, effectiveIndex);

  // Get the display title for the header
  let displayTitle;
  if (isExternallyLinked) {
    // For linked inputs, show the source node's title
    const textName = `text${effectiveIndex}`;
    const textInput = node.inputs?.find((i) => i.name === textName);
    if (textInput?.link) {
      const link = app.graph.links?.get?.(textInput.link);
      if (link?.origin_id) {
        const srcNode = app.graph.getNodeById?.(link.origin_id);
        if (srcNode) {
          displayTitle = srcNode.title || srcNode.type || "";
        }
      }
    }
    if (!displayTitle) {
      displayTitle = text.split("\n")[0].trim();
    }
  } else {
    // For non-linked inputs, show the first line as the header title
    displayTitle = text.split("\n")[0].trim();
  }

  // For the popup body:
  // - If linked: show ALL text (the header shows node title, not text content)
  // - If not linked: show all lines EXCEPT the first (already shown in header)
  let preview;
  if (isExternallyLinked) {
    preview = text; // Show full text
  } else {
    const lines = text.split("\n");
    const remainingLines = lines.length > 1 ? lines.slice(1) : [];
    if (remainingLines.length === 0 || remainingLines.every((l) => !l.trim())) {
      return; // Nothing to show beyond first line
    }
    preview = remainingLines.join("\n");
  }

  // Create popup container
  const popup = document.createElement("div");
  popup.id = "AUN-compact-label-popup";
  popup.style.cssText = `
    position: fixed;
    z-index: 10001;
    background: #1a1a1a;
    border: 2px solid #224a22;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.8);
    padding: 12px;
    min-width: 300px;
    max-width: 500px;
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
    background: #224a22;
    border-radius: 4px 4px 0 0;
    cursor: move;
  `;

  const title = document.createElement("span");
  title.textContent = `Slot ${effectiveIndex}: ${displayTitle}`;
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
    popup.remove();
  };

  titleBar.appendChild(title);
  titleBar.appendChild(closeBtn);
  popup.appendChild(titleBar);

  // Text content (read-only)
  const textDiv = document.createElement("div");
  textDiv.textContent = preview;
  textDiv.style.cssText = `
    padding: 8px;
    background: #242424;
    color: #d8d8d8;
    border: 1px solid #444;
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 300px;
    overflow-y: auto;
  `;
  popup.appendChild(textDiv);

  // Button bar
  const buttonBar = document.createElement("div");
  buttonBar.style.cssText = `
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  `;

  const closeBtn2 = document.createElement("button");
  closeBtn2.textContent = "Close";
  closeBtn2.style.cssText = `
    padding: 6px 12px;
    background: #444;
    color: #d8d8d8;
    border: 1px solid #555;
    border-radius: 4px;
    cursor: pointer;
  `;
  closeBtn2.onclick = (e) => {
    e.stopPropagation();
    popup.remove();
  };

  buttonBar.appendChild(closeBtn2);

  // Only show Edit button if the slot is NOT externally linked
  if (!isExternallyLinked) {
    const textWidget = getWidget(node, `text${effectiveIndex}`);
    if (textWidget) {
      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.style.cssText = `
        padding: 6px 12px;
        background: #4a90d9;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      `;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        popup.remove();
        // Open edit popup centered on screen since widget is hidden in compact mode
        showTextEditPopupCentered(node, `text${effectiveIndex}`, textWidget);
      };
      buttonBar.appendChild(editBtn);
    }
  } else {
    // Show a label indicating the text is externally linked
    const linkedLabel = document.createElement("span");
    linkedLabel.textContent = "(externally linked)";
    linkedLabel.style.cssText = `
      padding: 6px 8px;
      color: #888;
      font-size: 11px;
      font-style: italic;
    `;
    buttonBar.insertBefore(linkedLabel, closeBtn2);
  }

  popup.appendChild(buttonBar);

  // Position popup near the node
  const graphRect = app.canvas?.canvas?.getBoundingClientRect?.();
  if (graphRect && node.pos) {
    // Convert node position to screen coordinates
    const scale = app.canvas.ds?.scale || 1;
    const nodeLeft = graphRect.left + node.pos[0] * scale;
    const nodeTop = graphRect.top + node.pos[1] * scale;
    const nodeWidth = (node.size?.[0] || 300) * scale;
    const nodeHeight = (node.size?.[1] || 100) * scale;

    // Position to the right of the node, or below if not enough space
    let left = nodeLeft + nodeWidth + 10;
    let top = nodeTop;

    // Keep popup within viewport
    const popupWidth = 400;
    const popupHeight = 300;
    const margin = 10;

    // If popup would go off right edge, position below the node
    if (left + popupWidth > window.innerWidth - margin) {
      left = nodeLeft;
      top = nodeTop + nodeHeight + 10;
    }

    // Clamp to viewport
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    if (left + popupWidth > window.innerWidth - margin) {
      left = window.innerWidth - popupWidth - margin;
    }
    if (top + popupHeight > window.innerHeight - margin) {
      top = window.innerHeight - popupHeight - margin;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  } else {
    // Fallback: center on screen
    popup.style.left = `${window.innerWidth / 2 - 200}px`;
    popup.style.top = `${window.innerHeight / 2 - 150}px`;
  }

  document.body.appendChild(popup);

  // Make draggable
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  titleBar.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragOffsetX = e.clientX - popup.offsetLeft;
    dragOffsetY = e.clientY - popup.offsetTop;
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
  function escHandler(e) {
    if (e.key === "Escape") {
      popup.remove();
      document.removeEventListener("keydown", escHandler);
    }
  }
  document.addEventListener("keydown", escHandler);

  // Close when clicking outside
  popup.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });
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

// Show edit popup centered on screen (for when widget is hidden in compact mode)
function showTextEditPopupCentered(node, widgetName, widget) {
  // Close any existing popup
  hideTextEditPopup();

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

  // Center on screen
  popup.style.left = `${window.innerWidth / 2 - 300}px`;
  popup.style.top = `${window.innerHeight / 2 - 200}px`;
  popup.style.width = `600px`;

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
    popup.style.transform = "none";
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
          updateNodeVisualState(node);
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

    // Check if this is a compact node and click is on the label
    if (isCompact(this) && pos && pos.length >= 2) {
      const [mouseX, mouseY] = pos;
      const padding = 6;
      const textPadding = 6;
      const labelY = 28;
      const labelHeight = 18;

      // Check if click is in the label area (below title bar)
      if (mouseY >= labelY && mouseY <= labelY + labelHeight) {
        const title = getActiveSlotTitle(this);
        if (title) {
          // Approximate box width (max text width + padding)
          const maxTextWidth = Math.min(
            this.size[0] - 2 * padding - 2 * textPadding,
            115,
          );
          const boxWidth = maxTextWidth + 2 * textPadding;

          if (mouseX >= padding && mouseX <= padding + boxWidth) {
            // Double-clicked on the label - show full text popup
            showCompactLabelPopup(this);
            return; // Don't toggle compact mode
          }
        }
      }
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
      updateNodeVisualState(node);
    }
  };

  // Hook onMouseDown/onMouseUp to track overlay position during drag
  const originalOnMouseDown = node.onMouseDown;
  node.onMouseDown = function (event) {
    const result = originalOnMouseDown?.apply(this, arguments);
    // Start tracking overlay position during drag
    if (isCompact(this) && !this.__AUN_dragOverlayRAF) {
      const trackOverlay = () => {
        if (!isCompact(this)) {
          this.__AUN_dragOverlayRAF = null;
          return;
        }
        updateCompactOverlayPosition(this);
        this.__AUN_dragOverlayRAF = requestAnimationFrame(trackOverlay);
      };
      this.__AUN_dragOverlayRAF = requestAnimationFrame(trackOverlay);
    }
    return result;
  };

  const originalOnMouseUp = node.onMouseUp;
  node.onMouseUp = function (event) {
    // Stop tracking overlay position when drag ends
    if (this.__AUN_dragOverlayRAF) {
      cancelAnimationFrame(this.__AUN_dragOverlayRAF);
      this.__AUN_dragOverlayRAF = null;
      // Do one final update to ensure position is correct
      updateCompactOverlayPosition(this);
    }
    return originalOnMouseUp?.apply(this, arguments);
  };

  // Override onDrawForeground to hide input slot dots in compact mode
  const originalOnDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    // Call original first
    originalOnDrawForeground?.apply(this, arguments);

    if (!isCompact(this)) return;

    // In compact mode, draw over ALL input slot dots to hide them
    const slotRadius = 8; // Larger radius to ensure full coverage

    for (let i = 0; i < this.inputs.length; i++) {
      const input = this.inputs[i];
      if (!input) continue;

      // Only cover text* and index inputs
      if (
        input.name &&
        (input.name.startsWith("text") || input.name === "index")
      ) {
        const pos = this.getInputPos(i);

        // Draw a filled circle matching node background to cover the slot dot
        ctx.save();
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], slotRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw outer ring to match slot style but without the colored center
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], slotRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Run sync on initial load
  updateNodeVisualState(node);

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

function updateNodeVisualState(node) {
  if (!node) return;

  const slotCountWidget = getWidget(node, "slot_count");
  if (!slotCountWidget) return;

  const slotCount = Math.max(
    1,
    Math.min(20, Math.floor(Number(slotCountWidget.value) || 2)),
  );

  const compact = isCompact(node);

  // Hide slot_count widget in compact mode
  applyWidgetHiddenState(slotCountWidget, compact);

  // Update text widgets
  for (let i = 1; i <= 20; i++) {
    const textWidget = getWidget(node, `text${i}`);
    if (textWidget) {
      applyWidgetHiddenState(
        textWidget,
        compact || i > slotCount,
      );
    }
  }

  // Update index widget
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

  // Update input slots
  if (node.inputs) {
    for (const input of node.inputs) {
      if (!input) continue;
      if (input.name && input.name.startsWith("text")) {
        const slotIdx = parseInt(input.name.replace("text", ""), 10);
        input.hidden = compact || slotIdx > slotCount;
      }
      if (input.name === "index") {
        input.hidden = compact;
      }
    }
  }

  node.widgets_dirty = true;

  if (
    typeof node.computeSize === "function" &&
    typeof node.setSize === "function"
  ) {
    try {
      const newSize = node.computeSize();
      if (newSize && Array.isArray(newSize) && newSize.length >= 2) {
        node.setSize([newSize[0], newSize[1] + 15]);
      }
    } catch (e) {
      // ignore
    }
  }

  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);

  scheduleAutoHeightUpdate(node, 5, 50);
}

// --- Utility Functions ---
function toggleCompactMode(node) {
  if (!node) return;
  setCompact(node, !isCompact(node));
  updateNodeVisualState(node);
  startCompactLiveMonitor(node);
  scheduleAutoHeightUpdate(node);

  // Force overlay update to prevent "disappearing" on toggle
  const idx = getEffectiveIndex(node);
  updateCompactOverlay(node, idx, true);
}

function getActiveSlotTitle(node) {
  if (!node) return "";
  const index = getEffectiveIndex(node);

  // Check if this slot is externally linked
  if (isTextSlotLinked(node, index)) {
    // For linked inputs, show the source node's title
    const textName = `text${index}`;
    const textInput = node.inputs?.find((i) => i.name === textName);
    if (textInput?.link) {
      const link = app.graph.links?.get?.(textInput.link);
      if (link?.origin_id) {
        const srcNode = app.graph.getNodeById?.(link.origin_id);
        if (srcNode) {
          return srcNode.title || srcNode.type || "";
        }
      }
    }
  }

  // For non-linked inputs, show the first line of text
  const text = getEffectiveText(node, index);
  if (text && typeof text === "string") {
    const firstLine = text.split("\n")[0].trim();
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
  let lastIndex = null;

  function check() {
    if (!node || node.type === undefined) {
      if (node?.__AUN_textIndexSwitch3MonitorId) {
        clearInterval(node.__AUN_textIndexSwitch3MonitorId);
        node.__AUN_textIndexSwitch3MonitorId = null;
      }
      return;
    }
    if (!isCompact(node)) return;

    // Get effective index (from source if linked, otherwise widget)
    const currentIndex = getEffectiveIndex(node);

    // If index changed, update overlay immediately
    if (currentIndex !== lastIndex) {
      lastIndex = currentIndex;
      updateCompactOverlay(node, currentIndex);
    }
  }

  node.__AUN_textIndexSwitch3MonitorId = setInterval(check, 50);
  check();

  // Clean up when node is removed
  const originalOnRemoved = node.onRemoved;
  node.onRemoved = function onRemoved() {
    if (node.__AUN_textIndexSwitch3MonitorId) {
      clearInterval(node.__AUN_textIndexSwitch3MonitorId);
      node.__AUN_textIndexSwitch3MonitorId = null;
    }
    // Remove overlay from DOM and WeakMap
    const ov = compactOverlays.get(node);
    if (ov) {
      ov.overlay.remove();
      compactOverlays.delete(node);
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
        // Compact label is rendered as HTML overlay, not on canvas
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
            updateNodeVisualState(this);
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
