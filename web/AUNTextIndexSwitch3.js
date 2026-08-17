import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPES = ["AUNTextIndexSwitch3", "AUNTextIndexSwitch4", "AUNTextIndexSwitch5", "AUNTextIndexSwitch5Diffusers", "AUNInputsBasicSwitch"];
// Classes that have a built-in "mode" widget (Select/Increment/Random/Range)
const MODE_WIDGET_CLASSES = new Set(["AUNTextIndexSwitch4", "AUNTextIndexSwitch5", "AUNTextIndexSwitch5Diffusers", "AUNInputsBasicSwitch"]);
const PROP_KEY = "_AUN_compactMode";
// Extra layout height added before the loader block of AUNInputsBasicSwitch so
// the model selector (ckpt_name) below it is not overlapped by the textarea.
// The gap also hosts the "Inputs" section divider + note.
const BOUNDARY_PAD = 24;
const TEXT_SELECTION_PAD = 24;
// Clearance between the output-rail anchor (where the divider line sits) and
// the first widget, so the divider row + label never overlap widgets.
const TEXT_SELECTION_ROW_GAP = 16;
// AUNTextIndexSwitch5's extra param outputs (slots 3-8), collapsed into a
// single dot in compact mode.
const PARAM_OUTPUTS = new Set([
  "model",
  "diffusion_name",
  "clip_name",
  "vae_name",
  "clip_type",
  "sampler",
  "scheduler",
  "cfg",
  "steps",
  "seed",
]);
// Only the switch5 classes have the param-output layout that converges in
// compact mode. AUNInputsBasicSwitch shares PARAM_OUTPUTS slot names (sampler,
// scheduler, cfg, steps, seed) but at different positions, so the convergence
// and label-blanking must not apply to it.
const PARAM_OUTPUT_CLASSES = new Set(["AUNTextIndexSwitch5", "AUNTextIndexSwitch5Diffusers"]);

// "Collapse connections" state (same property key used by every other AUN
// collapse implementation and the global collapse extension).
const COLLAPSE_KEY = "collapse_connections";
// AUNInputsBasicSwitch's switch outputs live at the END of its output rail and
// must stay visible when connections are collapsed: the 13 param/loader outputs
// before them converge to a single dot while text/label/index are remapped to
// the rows freed up at the top of the rail.
const SWITCH_OUTPUT_NAMES = new Set(["text", "label", "index"]);

function isCollapseConnections(node) {
  return !!node?.properties?.[COLLAPSE_KEY];
}

// Rail geometry of AUNInputsBasicSwitch under collapsed connections. Returns
// { firstSwitch, switchCount, collapsedRows, rowExcess } where firstSwitch is
// the output index of "text" (13), collapsedRows is how many rail rows the
// collapsed layout occupies (params -> row 0, switch outputs -> rows 1..n) and
// rowExcess is the number of rail rows saved versus the full 16-slot rail.
function getCollapseRailMetrics(node) {
  const outputs = node?.outputs || [];
  const firstSwitch = outputs.findIndex(
    (o) => o && SWITCH_OUTPUT_NAMES.has(o.name),
  );
  if (firstSwitch <= 0) return null;
  const switchCount = outputs.length - firstSwitch;
  const collapsedRows = 1 + switchCount;
  return {
    firstSwitch,
    switchCount,
    collapsedRows,
    rowExcess: Math.max(0, outputs.length - collapsedRows),
  };
}

function hasModeWidget(node) {
  return !!node && MODE_WIDGET_CLASSES.has(node.comfyClass);
}

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

// In compact mode the param output sockets converge to a single dot, so blank
// their labels; restore them (and drop stray blanks) when expanded. The
// text/label/index outputs and all input labels stay intact.
function applyCompactSlotLabels(node) {
  if (!node) return;
  if (!PARAM_OUTPUT_CLASSES.has(node.comfyClass)) return;
  const compact = isCompact(node);
  const slots = node.outputs || [];
  for (const slot of slots) {
    if (!slot || !PARAM_OUTPUTS.has(slot.name)) continue;
    if (compact) {
      if (!("__aun_compact_origLabel" in slot)) {
        slot.__aun_compact_origLabel = slot.label;
      }
      slot.label = " ";
    } else {
      if ("__aun_compact_origLabel" in slot) {
        slot.label = slot.__aun_compact_origLabel;
        delete slot.__aun_compact_origLabel;
      }
      if (slot.label === " ") {
        delete slot.label;
      }
    }
  }
}

// When collapse connections is on for AUNInputsBasicSwitch the 13 param/loader
// outputs converge to a single dot, so blank their labels (and every input
// label, mirroring the other AUN collapse nodes). The text/label/index switch
// outputs must stay visible, so they are never blanked here.
function applyCollapseSlotLabels(node) {
  if (!node || node.comfyClass !== "AUNInputsBasicSwitch") return;
  const collapsed = isCollapseConnections(node);
  const slots = [...(node.inputs || []), ...(node.outputs || [])];
  for (const slot of slots) {
    if (!slot) continue;
    if (SWITCH_OUTPUT_NAMES.has(slot.name)) continue;
    if (collapsed) {
      if (!("__aun_collapse_origLabel" in slot)) {
        slot.__aun_collapse_origLabel = slot.label;
      }
      slot.label = " ";
    } else {
      if ("__aun_collapse_origLabel" in slot) {
        delete slot.label;
        delete slot.__aun_collapse_origLabel;
      }
      if (slot.label === " ") {
        delete slot.label;
      }
    }
  }
}

function isTargetNode(node) {
  if (!node) {
    return false;
  }

  const targets = NODE_TYPES.map((name) => normalizeIdentifier(name));
  const comfyClass = normalizeIdentifier(node.comfyClass);
  const type = normalizeIdentifier(node.type);
  const name = normalizeIdentifier(node.name);
  const title = normalizeIdentifier(node.title);

  return targets.some((target) =>
    comfyClass === target ||
    type === target ||
    name === target ||
    title === target ||
    comfyClass.includes(target) ||
    type.includes(target) ||
    name.includes(target) ||
    title.includes(target)
  );
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
      const size = originalComputeSize.apply(this, args);
      if (Array.isArray(size) && size.length >= 2) {
        const pad =
          (this.__AUN_boundaryPad ? BOUNDARY_PAD : 0) +
          (this.__AUN_textSelPad ? TEXT_SELECTION_PAD : 0);
        return [size[0], size[1] + pad];
      }
    }

    const height = LiteGraph?.NODE_WIDGET_HEIGHT ?? 24;
    const pad =
      (this.__AUN_boundaryPad ? BOUNDARY_PAD : 0) +
      (this.__AUN_textSelPad ? TEXT_SELECTION_PAD : 0);
    return [resolveWidth(), height + pad];
  };
}

function applyWidgetHiddenState(widget, hidden) {
  if (!widget) return;
  ensureHiddenAwareWidget(widget);

  widget.hidden = hidden;
  widget.flags = widget.flags || {};
  widget.flags.hidden = hidden;
  
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

// Purpose text for each text slot, captured before the shared nodeDef tooltip
// is blanked (node.constructor.nodeData is shared by all instances of a type).
const __AUN_textPurposeCache = {};

// Compact label overlay management
const compactOverlays = new WeakMap();

// Track links that should be hidden (links going to hidden inputs on compact nodes)
const hiddenLinks = new Set();

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

  // Hook into canvas transformations (pan/zoom) to update overlay positions
  const origSetCanvas = app.canvas?.setCanvas;
  if (origSetCanvas) {
    app.canvas.setCanvas = function (...args) {
      const result = origSetCanvas.apply(this, args);
      // Update overlay positions after canvas transformation
      scheduleOverlayUpdate();
      return result;
    };
  }

  // Hook into canvas draw to update overlays
  const origDraw = app.canvas?.draw;
  if (origDraw) {
    app.canvas.draw = function (...args) {
      const result = origDraw.apply(this, args);
      // Update overlay positions during draw (catches zoom/pan changes)
      scheduleOverlayUpdate();
      return result;
    };
  }

  // Hook into canvas mouse events that might trigger transformations
  const origProcessMouseMove = app.canvas?.processMouseMove;
  if (origProcessMouseMove) {
    app.canvas.processMouseMove = function (...args) {
      const result = origProcessMouseMove.apply(this, args);
      // Update overlay positions after mouse move (catches panning)
      scheduleOverlayUpdate();
      return result;
    };
  }

  // Hook into canvas mouse wheel for zoom
  const origProcessMouseWheel = app.canvas?.processMouseWheel;
  if (origProcessMouseWheel) {
    app.canvas.processMouseWheel = function (...args) {
      const result = origProcessMouseWheel.apply(this, args);
      // Update overlay positions after zoom
      scheduleOverlayUpdate();
      return result;
    };
  }

  // Hook into canvas viewport changes
  const origSetZoom = app.canvas?.setZoom;
  if (origSetZoom) {
    app.canvas.setZoom = function (...args) {
      const result = origSetZoom.apply(this, args);
      scheduleOverlayUpdate();
      return result;
    };
  }

  // Hook into canvas pan method if it exists
  const origSetOffset = app.canvas?.setOffset;
  if (origSetOffset) {
    app.canvas.setOffset = function (...args) {
      const result = origSetOffset.apply(this, args);
      scheduleOverlayUpdate();
      return result;
    };
  }
}

// Track links into hidden inputs on compact nodes. Input wires are hidden for a
// clean compact look; the text/label/index outputs and the converged param
// output keep their wires.
function updateHiddenLinks() {
  hiddenLinks.clear();
  if (!app?.graph) return;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  for (const node of nodes) {
    if (!isTargetNode(node) || !isCompact(node)) continue;
    for (const input of node.inputs || []) {
      if (input && input.link != null) {
        hiddenLinks.add(input.link);
      }
    }
  }
}

let pendingOverlayUpdate = null;
let compactOverlayRAF = null;

function hasCompactNodes() {
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  return nodes.some((node) => isTargetNode(node) && isCompact(node));
}

function startOverlayRAF() {
  if (compactOverlayRAF) return;
  function rafLoop() {
    compactOverlayRAF = requestAnimationFrame(rafLoop);
    if (!app?.graph) return;
    updateHiddenLinks();
    updateAllCompactOverlayPositions();
    if (!hasCompactNodes() && !hasDividerNodes()) {
      cancelAnimationFrame(compactOverlayRAF);
      compactOverlayRAF = null;
    }
  }
  rafLoop();
}

function stopOverlayRAF() {
  if (compactOverlayRAF) {
    cancelAnimationFrame(compactOverlayRAF);
    compactOverlayRAF = null;
  }
}

function scheduleOverlayUpdate() {
  if (!compactOverlayRAF) {
    startOverlayRAF();
  }
  if (pendingOverlayUpdate) return;
  if (typeof requestAnimationFrame === "function") {
    pendingOverlayUpdate = requestAnimationFrame(() => {
      pendingOverlayUpdate = null;
      updateAllCompactOverlayPositions();
    });
  } else {
    pendingOverlayUpdate = setTimeout(() => {
      pendingOverlayUpdate = null;
      updateAllCompactOverlayPositions();
    }, 16);
  }
}

// Update all compact overlay positions (called during canvas transformations)
function updateAllCompactOverlayPositions() {
  if (!app?.graph) return;

  const nodes = app.graph._nodes || app.graph.nodes || [];
  for (const node of nodes) {
    if (isTargetNode(node) && isCompact(node)) {
      updateCompactOverlayPosition(node);
    }
    if (node.comfyClass === "AUNInputsBasicSwitch") {
      updateDividerOverlayPosition(node);
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

  const labelRow = document.createElement("div");
  labelRow.style.cssText = `
    display: flex;
    align-items: center;
  `;
  labelRow.appendChild(label);
  labelRow.appendChild(hint);

  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
  `;
  container.appendChild(labelRow);
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
        // Use cached runtime output if available (set by executed/AUN_random_text_index_selected events)
        if (srcNode.__aun_last_exec_index != null) {
          return Number(srcNode.__aun_last_exec_index);
        }

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

  // Check mode widget — in dynamic modes (Increment/Random/Range), use the last executed index
  const modeWidget = getWidget(node, "mode");
  const modeValue = String(modeWidget?.value || "");
  if (modeValue && modeValue !== "Select") {
    const lastExec = node?.__aun_last_exec_index;
    if (lastExec != null) {
      const parsed = parseInt(lastExec, 10);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
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

function isNodeCovered(node) {
  // Check if any node with higher z-order overlaps any part of this node's bounding box.
  // Returns true if the node is occluded and overlay should be hidden.
  // Matches the approach in AUN_random_lora_multi.js isNodeOccluded.
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  const nodeZ = node.index ?? -2;

  // Full node bounds in graph coordinates
  const bx = node.pos[0];
  const by = node.pos[1];
  const bw = node.size?.[0] ?? 300;
  const bh = node.size?.[1] ?? 100;

  for (const other of nodes) {
    if (!other || other.id === node.id) continue;

    // Only consider nodes drawn on top (higher index = higher z-order in ComfyUI)
    if ((other.index ?? -1) <= nodeZ) continue;

    // Skip collapsed nodes — they're visually minimized
    if (other.flags?.collapsed) continue;

    const ox = other.pos[0];
    const oy = other.pos[1];
    const ow = other.size?.[0] ?? 300;
    const oh = other.size?.[1] ?? 100;

    // AABB overlap check — if any node above overlaps any part of this node, it's covered
    if (!(ox + ow <= bx || ox >= bx + bw || oy + oh <= by || oy >= by + bh)) {
      return true;
    }
  }

  return false;
}

function updateCompactOverlay(node, overrideIndex, force = false) {
  if (!node || !isCompact(node)) {
    const ov = compactOverlays.get(node);
    if (ov) ov.overlay.style.display = "none";
    return;
  }

    // --- NEW CHECK: Hide overlay if the node itself is collapsed ---
  if (node.flags?.collapsed) {
    const ov = compactOverlays.get(node);
    if (ov) ov.overlay.style.display = "none";
    node.__AUN_lastOverlayCovered = true; 
    return;
  }

  // Hide overlay if another node is visually on top of this one
  if (isNodeCovered(node)) {
    const ov = compactOverlays.get(node);
    if (ov) ov.overlay.style.display = "none";
    node.__AUN_lastOverlayCovered = true;
    return;
  }

  const ov = getCompactOverlay(node);

  // Use overrideIndex if provided, otherwise trace for effective index
  const effectiveIndex =
    overrideIndex !== undefined && overrideIndex !== null
      ? overrideIndex
      : getEffectiveIndex(node);

  // Optimization: Only update DOM if index, node position, or covered state changed, or if forced
  const lastIdx = node.__AUN_lastOverlayIdx;
  const lastPos = node.__AUN_lastOverlayPos;
  const lastCovered = node.__AUN_lastOverlayCovered;
  const currentPos = node.pos ? `${node.pos[0]},${node.pos[1]}` : "";
  const currentCovered = false; // we already returned above if covered

  if (!force && lastIdx === effectiveIndex && lastPos === currentPos && lastCovered === currentCovered) {
    return;
  }
  node.__AUN_lastOverlayIdx = effectiveIndex;
  node.__AUN_lastOverlayPos = currentPos;
  node.__AUN_lastOverlayCovered = currentCovered;

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
  let lastCanvasTransform = null;

  window.__AUN_compactOverlayUpdateLoop = setInterval(() => {
    if (!app?.graph) return;
    updateHiddenLinks();

    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const node of nodes) {
      if (isTargetNode(node)) {
        const effectiveIdx = getEffectiveIndex(node);
        updateCompactOverlay(node, effectiveIdx);
      }
    }

    // Check if canvas transform has changed and update overlay positions
    if (app?.canvas?.ds) {
      const currentTransform = `${app.canvas.ds.scale},${app.canvas.ds.offset[0]},${app.canvas.ds.offset[1]}`;
      if (currentTransform !== lastCanvasTransform) {
        lastCanvasTransform = currentTransform;
        scheduleOverlayUpdate();
      }
    }

    // Also update overlay positions less frequently as fallback
    scheduleOverlayUpdate();
  }, 200); // fallback polling only
}

// Set up mutation observer to detect canvas transform changes
if (!window.__AUN_canvasObserver && app?.canvas?.canvas) {
  const canvasElement = app.canvas.canvas;
  const observer = new MutationObserver((mutations) => {
    let transformChanged = false;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && 
          (mutation.attributeName === 'style' || mutation.attributeName === 'transform')) {
        transformChanged = true;
        break;
      }
    }
    if (transformChanged) {
      scheduleOverlayUpdate();
    }
  });

  observer.observe(canvasElement, {
    attributes: true,
    attributeFilter: ['style', 'transform'],
  });

  canvasElement.addEventListener(
    'pointermove',
    scheduleOverlayUpdate,
    { passive: true },
  );
  canvasElement.addEventListener(
    'wheel',
    scheduleOverlayUpdate,
    { passive: true },
  );
  canvasElement.addEventListener(
    'pointerdown',
    scheduleOverlayUpdate,
    { passive: true },
  );
  canvasElement.addEventListener(
    'pointerup',
    scheduleOverlayUpdate,
    { passive: true },
  );

  window.__AUN_canvasObserver = observer;
}

// Show merged popup: muted slot-purpose header + text preview (omit first line)
function showTextTooltip(widget, text) {
  hideTextTooltip();

  if (!widget || !widget.inputEl) return;

  const purpose = widget.__aun_purposeTooltip || "";
  const textPreview = text || "";

  // Split into lines and omit the first line
  const lines = textPreview.split("\n");
  const previewLines = lines.length > 1 ? lines.slice(1) : [];
  const hasContent = previewLines.some((l) => l.trim());
  const preview = previewLines.join("\n");

  // Show nothing only when there is neither a purpose nor content to display
  if (!purpose && !hasContent) return;

  const tooltip = document.createElement("div");
  tooltip.id = "AUN-text-tooltip";
  tooltip.style.cssText = `
    position: fixed;
    z-index: 9999;
    background: #224a22;
    color: #d8d8d8;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: sans-serif;
    font-size: 12px;
    line-height: 1.4;
    max-width: 400px;
    max-height: 300px;
    overflow-y: auto;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.1);
  `;

  if (purpose) {
    const purposeEl = document.createElement("div");
    purposeEl.style.cssText =
      "color:#a8d5a8;font-size:11px;line-height:1.4;" +
      (hasContent
        ? "padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.12);"
        : "");
    purposeEl.textContent = purpose;
    tooltip.appendChild(purposeEl);
  }
  if (hasContent) {
    const contentEl = document.createElement("div");
    contentEl.style.cssText =
      "font-family:monospace;font-size:13px;line-height:1.4;" +
      "white-space:pre-wrap;word-break:break-word;";
    contentEl.textContent = preview;
    tooltip.appendChild(contentEl);
  }

  document.body.appendChild(tooltip);
  currentTooltip = tooltip;

  // Position near the widget but keep on screen
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

  // Parameters section: the new output slots (model/sampler/scheduler/cfg/steps/seed)
  const extracted = parseSwitchKeyValues(text);
  const paramKeys = Object.keys(extracted);
  if (paramKeys.length > 0) {
    const paramsSection = document.createElement("div");
    paramsSection.style.cssText = `
      padding: 6px 8px;
      background: #202020;
      border: 1px solid #444;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;
    const paramsHeader = document.createElement("div");
    paramsHeader.textContent = "Parameters";
    paramsHeader.style.cssText = `
      color: #b0b0b0;
      font: bold 10px sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    paramsSection.appendChild(paramsHeader);
    for (const key of paramKeys) {
      const row = document.createElement("div");
      row.style.cssText = `
        display: flex;
        align-items: baseline;
        gap: 8px;
      `;
      const kLabel = document.createElement("span");
      kLabel.textContent = `${AUN_SWITCH_KEY_LABELS[key] || key}:`;
      kLabel.style.cssText = `
        color: #9a9a9a;
        font: 11px sans-serif;
        white-space: nowrap;
        min-width: 70px;
      `;
      const vLabel = document.createElement("span");
      vLabel.textContent = extracted[key];
      vLabel.style.cssText = `
        color: #e0e0e0;
        font: 12px monospace;
        word-break: break-all;
      `;
      row.appendChild(kLabel);
      row.appendChild(vLabel);
      paramsSection.appendChild(row);
    }
    popup.appendChild(paramsSection);
  }

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
        // Position edit popup near the node (consistent with full mode)
        const graphRect = app.canvas?.canvas?.getBoundingClientRect?.();
        let hintLeft = window.innerWidth / 2 - 200;
        let hintTop = window.innerHeight / 2 - 150;
        if (graphRect && node.pos) {
          const scale = app.canvas.ds?.scale || 1;
          const canvasOffset = app.canvas.ds?.offset || [0, 0];
          const nodeLeft = graphRect.left + (node.pos[0] + canvasOffset[0]) * scale;
          const nodeTop = graphRect.top + (node.pos[1] + canvasOffset[1]) * scale;
          const nodeWidth = (node.size?.[0] || 300) * scale;
          hintLeft = nodeLeft + nodeWidth + 10;
          hintTop = nodeTop;
        }
        showTextEditPopup(node, `text${effectiveIndex}`, textWidget, { left: hintLeft, top: hintTop, width: 400, height: 350 });
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
    // Convert node position to screen coordinates (account for pan + zoom)
    const scale = app.canvas.ds?.scale || 1;
    const canvasOffset = app.canvas.ds?.offset || [0, 0];
    const nodeLeft = graphRect.left + (node.pos[0] + canvasOffset[0]) * scale;
    const nodeTop = graphRect.top + (node.pos[1] + canvasOffset[1]) * scale;
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

// --- Slot key=value parsing (mirrors AUNTextIndexSwitch5 backend) ---
const AUN_SWITCH_KNOWN_KEYS = ["model", "diffusion_name", "clip_name", "vae_name", "clip_type", "sampler", "scheduler", "cfg", "steps", "seed"];
const AUN_SWITCH_KEY_LABELS = {
  model: "Model",
  diffusion_name: "Diffusion Model",
  clip_name: "CLIP",
  vae_name: "VAE",
  clip_type: "CLIP Type",
  sampler: "Sampler",
  scheduler: "Scheduler",
  cfg: "CFG",
  steps: "Steps",
  seed: "Seed",
};
// Same pattern as AUNTextIndexSwitch5._KEY_VALUE_RE:
// key="..." | key='...' | key=token. Captures: 1=key, 2=double, 3=single, 4=unquoted.
const AUN_SWITCH_KEY_VALUE_RE =
  /(?<!\S)([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s"]+))/g;

function parseSwitchKeyValues(text) {
  const extracted = {};
  if (!text) return extracted;
  const re = new RegExp(AUN_SWITCH_KEY_VALUE_RE.source, "g");
  let m;
  while ((m = re.exec(text))) {
    const key = (m[1] || "").toLowerCase();
    if (!AUN_SWITCH_KNOWN_KEYS.includes(key)) continue;
    let value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
    if (value != null) value = value.replace(/,\s*$/, "");
    if (value !== "") extracted[key] = value;
  }
  return extracted;
}

// --- Checkpoint dropdown picker ---
let __aun_ckpt_list = null;
let __aun_ckpt_list_promise = null;

function fetchCheckpointList() {
  if (__aun_ckpt_list) return Promise.resolve(__aun_ckpt_list);
  if (__aun_ckpt_list_promise) return __aun_ckpt_list_promise;
  __aun_ckpt_list_promise = (async () => {
    try {
      const resp = await api.fetchApi("/object_info/AUNInputsBasic");
      const data = await resp.json();
      const spec = data?.AUNInputsBasic?.input?.required?.ckpt_name;
      if (Array.isArray(spec) && Array.isArray(spec[0])) {
        __aun_ckpt_list = spec[0];
        return __aun_ckpt_list;
      }
    } catch (e) {
      console.warn("[AUNTextIndexSwitch3] Failed to load checkpoint list", e);
    }
    __aun_ckpt_list = [];
    return __aun_ckpt_list;
  })();
  return __aun_ckpt_list_promise;
}

// --- Diffusers file list dropdown pickers ---
const __aun_diffusers_cache = {};

function fetchDiffusersFileList(folderKey) {
  if (__aun_diffusers_cache[folderKey]) return Promise.resolve(__aun_diffusers_cache[folderKey]);
  const promise = (async () => {
    try {
      const resp = await api.fetchApi("/object_info/AUNInputsDiffusersBasic");
      const data = await resp.json();
      const spec = data?.AUNInputsDiffusersBasic?.input?.required?.[folderKey];
      if (Array.isArray(spec) && Array.isArray(spec[0])) {
        __aun_diffusers_cache[folderKey] = spec[0];
        return spec[0];
      }
    } catch (e) {
      console.warn(`[AUNTextIndexSwitch3] Failed to load ${folderKey} list`, e);
    }
    __aun_diffusers_cache[folderKey] = [];
    return [];
  })();
  __aun_diffusers_cache[folderKey] = promise;
  return promise;
}

function fetchDiffusionModelList() { return fetchDiffusersFileList("diffusion_name"); }
function fetchClipList() { return fetchDiffusersFileList("clip_name"); }
function fetchVaeList() { return fetchDiffusersFileList("vae_name"); }

async function fetchClipTypeList() {
  try {
    const resp = await api.fetchApi("/object_info/AUNInputsDiffusersBasic");
    const data = await resp.json();
    const spec = data?.AUNInputsDiffusersBasic?.input?.required?.clip_type;
    if (Array.isArray(spec) && Array.isArray(spec[0])) {
      return spec[0];
    }
  } catch (e) {
    console.warn("[AUNTextIndexSwitch3] Failed to load clip_type list", e);
  }
  return ["Stable Diffusion"];
}

// Create and show a floating textarea popup for editing
function showTextEditPopup(node, widgetName, widget, positionHint) {
  // Close any existing popup
  hideTextEditPopup();

  if (!widget || !widget.inputEl) return;

  // Create popup container
  const popup = document.createElement("div");
  popup.id = "AUN-text-edit-popup";
  popup.style.cssText = `
    position: fixed;
    z-index: 9998;
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
    overflow: visible;
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

  // Use the widget's native inputEl for dynamic prompt support
  // This ensures the same behavior as normal ComfyUI text widgets
  const textarea = widget.inputEl;
  const originalParent = textarea.parentNode;
  const originalStyles = {
    cssText: textarea.style.cssText,
    hidden: textarea.hidden,
    display: textarea.style.display,
    minHeight: textarea.style.minHeight,
    height: textarea.style.height,
  };

  // Capture rect BEFORE detaching textarea from DOM
  const originalRect = textarea.getBoundingClientRect?.();

  // Wrap textarea in a container with overflow:visible so autocomplete dropdowns can break out
  const textareaContainer = document.createElement("div");
  textareaContainer.style.cssText = `overflow: visible;`;

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
    display: block;
    overflow: visible;
  `;
  textarea.hidden = false;
  textareaContainer.appendChild(textarea);
  popup.appendChild(textareaContainer);

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
    // Restore original inputEl state
    textarea.style.cssText = originalStyles.cssText;
    textarea.hidden = originalStyles.hidden;
    textarea.style.display = originalStyles.display;
    textarea.style.minHeight = originalStyles.minHeight;
    textarea.style.height = originalStyles.height;
    if (originalParent) originalParent.appendChild(textarea);
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
    // Sync value from inputEl back to widget
    widget.value = textarea.value;
    if (widget.callback) {
      widget.callback.call(widget, widget.value);
    }
    node.setDirtyCanvas?.(true, true);
    updateCompactOverlay(node, undefined, true);
    // Restore original inputEl state
    textarea.style.cssText = originalStyles.cssText;
    textarea.hidden = originalStyles.hidden;
    textarea.style.display = originalStyles.display;
    textarea.style.minHeight = originalStyles.minHeight;
    textarea.style.height = originalStyles.height;
    if (originalParent) originalParent.appendChild(textarea);
    hideTextEditPopup();
  };

  buttonBar.appendChild(cancelBtn);
  buttonBar.appendChild(saveBtn);
  popup.appendChild(buttonBar);

  // Position popup near the widget but keep within viewport
  // Use positionHint if provided (from compact mode), otherwise use captured rect
  const popupWidth = Math.max(positionHint?.width || originalRect?.width || 400, 400);
  const popupHeight = positionHint?.height || 350; // Estimated height

  let left, top;
  if (positionHint) {
    left = positionHint.left;
    top = positionHint.top;
  } else if (originalRect) {
    left = originalRect.left;
    top = originalRect.bottom + 10;
  } else {
    left = window.innerWidth / 2 - popupWidth / 2;
    top = window.innerHeight / 2 - popupHeight / 2;
  }

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

  // Determine if this is a diffusers variant node
  const isDiffusers = node.comfyClass === "AUNTextIndexSwitch5Diffusers";

  if (isDiffusers) {
    // Diffusers variant: show diffusion_name, clip_name, vae_name, clip_type dropdowns
    const diffusersFields = [
      { key: "diffusion_name", label: "Diffusion:", fetcher: fetchDiffusionModelList, placeholder: "— insert diffusion_name= —" },
      { key: "clip_name", label: "CLIP:", fetcher: fetchClipList, placeholder: "— insert clip_name= —" },
      { key: "vae_name", label: "VAE:", fetcher: fetchVaeList, placeholder: "— insert vae_name= —" },
      { key: "clip_type", label: "CLIP Type:", fetcher: fetchClipTypeList, placeholder: "— insert clip_type= —" },
    ];

    for (const field of diffusersFields) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex; align-items:center; gap:8px; padding:2px 4px;";
      const lbl = document.createElement("span");
      lbl.textContent = field.label;
      lbl.style.cssText =
        "color:#b0b0b0; font: 11px sans-serif; white-space:nowrap;";
      const select = document.createElement("select");
      select.style.cssText =
        "flex:1; min-width:0; background:#242424; color:#d8d8d8; border:1px solid #444; border-radius:4px; padding:3px; font-size:12px;";
      const ph = document.createElement("option");
      ph.value = "";
      ph.textContent = field.placeholder;
      select.appendChild(ph);
      row.appendChild(lbl);
      row.appendChild(select);
      popup.insertBefore(row, buttonBar);

      field.fetcher().then((list) => {
        for (const name of list || []) {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        }
      });

      select.addEventListener("change", () => {
        const val = select.value;
        select.value = "";
        if (!val) return;
        const current = textarea.value || "";
        const start = textarea.selectionStart ?? current.length;
        const end = textarea.selectionEnd ?? current.length;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const sep = before && !before.endsWith("\n") ? "\n" : "";
        const token = `${field.key}=${val}`;
        textarea.value = before + sep + token + "\n" + after;
        const caret = before.length + sep.length + token.length + 1;
        try {
          textarea.selectionStart = textarea.selectionEnd = caret;
        } catch (e) {
          /* ignore */
        }
        widget.value = textarea.value;
        updateCompactOverlay(node, undefined, true);
        textarea.focus();
      });
    }
  } else {
    // Standard checkpoint variant: show Model dropdown
    const modelBar = document.createElement("div");
    modelBar.style.cssText =
      "display:flex; align-items:center; gap:8px; padding:2px 4px;";
    const modelLabel = document.createElement("span");
    modelLabel.textContent = "Model:";
    modelLabel.style.cssText =
      "color:#b0b0b0; font: 11px sans-serif; white-space:nowrap;";
    const modelSelect = document.createElement("select");
    modelSelect.style.cssText =
      "flex:1; min-width:0; background:#242424; color:#d8d8d8; border:1px solid #444; border-radius:4px; padding:3px; font-size:12px;";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— insert model=NAME —";
    modelSelect.appendChild(placeholder);
    modelBar.appendChild(modelLabel);
    modelBar.appendChild(modelSelect);
    popup.insertBefore(modelBar, buttonBar);

    fetchCheckpointList().then((list) => {
      for (const name of list || []) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        modelSelect.appendChild(opt);
      }
    });

    modelSelect.addEventListener("change", () => {
      const val = modelSelect.value;
      modelSelect.value = "";
      if (!val) return;
      const current = textarea.value || "";
      const start = textarea.selectionStart ?? current.length;
      const end = textarea.selectionEnd ?? current.length;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const sep = before && !before.endsWith("\n") ? "\n" : "";
      const token = `model=${val}`;
      textarea.value = before + sep + token + "\n" + after;
      const caret = before.length + sep.length + token.length + 1;
      try {
        textarea.selectionStart = textarea.selectionEnd = caret;
      } catch (e) {
        /* ignore */
      }
      widget.value = textarea.value;
      updateCompactOverlay(node, undefined, true);
      textarea.focus();
    });
  }

  // Store original state for cleanup
  popup.__AUN_originalParent = originalParent;
  popup.__AUN_originalStyles = originalStyles;
  popup.__AUN_textarea = textarea;

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
    // Restore original inputEl state if it was moved to the popup
    const popup = currentPopup.popup;
    if (popup && popup.__AUN_textarea && popup.__AUN_originalParent) {
      const textarea = popup.__AUN_textarea;
      const originalStyles = popup.__AUN_originalStyles;
      const originalParent = popup.__AUN_originalParent;

      textarea.style.cssText = originalStyles.cssText;
      textarea.hidden = originalStyles.hidden;
      textarea.style.display = originalStyles.display;
      textarea.style.minHeight = originalStyles.minHeight;
      textarea.style.height = originalStyles.height;
      if (originalParent) originalParent.appendChild(textarea);
    }
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
    z-index: 9998;
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
    overflow: visible;
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

  // Use the widget's native inputEl for dynamic prompt support
  // This ensures the same behavior as normal ComfyUI text widgets
  const textarea = widget.inputEl;
  const originalParent = textarea.parentNode;
  const originalStyles = {
    cssText: textarea.style.cssText,
    hidden: textarea.hidden,
    display: textarea.style.display,
    minHeight: textarea.style.minHeight,
    height: textarea.style.height,
  };

  // Wrap textarea in a container with overflow:visible so autocomplete dropdowns can break out
  const textareaContainer = document.createElement("div");
  textareaContainer.style.cssText = `overflow: visible;`;

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
    display: block;
    overflow: visible;
  `;
  textarea.hidden = false;
  textareaContainer.appendChild(textarea);
  popup.appendChild(textareaContainer);

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
    // Restore original inputEl state
    textarea.style.cssText = originalStyles.cssText;
    textarea.hidden = originalStyles.hidden;
    textarea.style.display = originalStyles.display;
    textarea.style.minHeight = originalStyles.minHeight;
    textarea.style.height = originalStyles.height;
    if (originalParent) originalParent.appendChild(textarea);
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
    // Sync value from inputEl back to widget
    widget.value = textarea.value;
    if (widget.callback) {
      widget.callback.call(widget, widget.value);
    }
    node.setDirtyCanvas?.(true, true);
    updateCompactOverlay(node, undefined, true);
    // Restore original inputEl state
    textarea.style.cssText = originalStyles.cssText;
    textarea.hidden = originalStyles.hidden;
    textarea.style.display = originalStyles.display;
    textarea.style.minHeight = originalStyles.minHeight;
    textarea.style.height = originalStyles.height;
    if (originalParent) originalParent.appendChild(textarea);
    hideTextEditPopup();
  };

  buttonBar.appendChild(cancelBtn);
  buttonBar.appendChild(saveBtn);
  popup.appendChild(buttonBar);

  // Center on screen - position higher to leave room for autocomplete dropdown below
  popup.style.left = `${window.innerWidth / 2 - 300}px`;
  popup.style.top = `${window.innerHeight / 2 - 250}px`;
  popup.style.width = `600px`;

  // Store original state for cleanup
  popup.__AUN_originalParent = originalParent;
  popup.__AUN_originalStyles = originalStyles;
  popup.__AUN_textarea = textarea;

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

    // Capture the slot-purpose tooltip and suppress the native popup so only
    // the merged AUN popup (purpose + content) shows on hover.
    //
    // Text slots are DOM widgets (addMultilineWidget): the purpose text never
    // lands on widget.tooltip/options.tooltip - it lives only on the node
    // definition, which ComfyUI's DomWidget wrapper renders as a native `title`
    // attribute on the dom-widget container (that is the "purpose tip" that
    // clashes with our popup). node.constructor.nodeData is shared by every
    // instance of the type, so once we blank it for one node the text is gone
    // for the rest - cache it first and reuse the cache for later nodes.
    const purposeKey = `${node.type || node.constructor?.name}:text${i}`;
    let purpose =
      widget.options?.tooltip ||
      widget.tooltip ||
      __AUN_textPurposeCache[purposeKey] ||
      "";
    if (!purpose) {
      const nodeDefInput = node.constructor?.nodeData?.inputs?.[`text${i}`];
      purpose = nodeDefInput?.tooltip || "";
      if (purpose) {
        __AUN_textPurposeCache[purposeKey] = purpose;
        if (typeof nodeDefInput === "object") {
          nodeDefInput.tooltip = "";
        }
      }
    }
    if (purpose) {
      widget.__aun_purposeTooltip = purpose;
      if (widget.options) widget.options.tooltip = "";
      widget.tooltip = " ";
      const container = widget.element?.parentElement || widget.inputEl?.parentElement;
      container?.removeAttribute?.("title");
    }

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

  // Install the computeSize proxy on every widget so pad flags work anywhere.
  // applyWidgetHiddenState installs it lazily, but always-visible widgets like
  // the mode widget and the loader block would never get it, leaving section
  // divider gaps silently un-applied.
  for (const w of node.widgets || []) {
    if (w && typeof w === "object") ensureHiddenAwareWidget(w);
  }

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

  // Add callback to mode widget for AUNTextIndexSwitch4
  const modeWidget = getWidget(node, "mode");
  if (modeWidget && hasModeWidget(node)) {
    const origCb = modeWidget.callback;
    modeWidget.callback = function callback(value) {
      origCb?.call(modeWidget, value);
      // Update widget visibility when mode changes
      setTimeout(() => {
        if (node && node.widgets) {
          updateNodeVisualState(node);
        }
      }, 10);
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
      
      // Update visual state
      setTimeout(() => {
        if (node && node.widgets) {
          setCompact(node, false);
          updateNodeVisualState(node);
        }
      }, 10);
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

    // Double-click toggles compact mode for every AUN node type (including
    // AUNInputsBasicSwitch); collapse connections for AUNInputsBasicSwitch is
    // toggled from the right-click menu and the collapse controller only.
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
        // ctx.save();
        // ctx.fillStyle = "#1a1a1a";
        // ctx.beginPath();
        // ctx.arc(pos[0], pos[1], slotRadius, 0, Math.PI * 2);
        // ctx.fill();

        // // Draw outer ring to match slot style but without the colored center
        // ctx.strokeStyle = "#1a1a1a";
        // ctx.lineWidth = 2;
        // ctx.beginPath();
        // ctx.arc(pos[0], pos[1], slotRadius, 0, Math.PI * 2);
        // ctx.stroke();
        // ctx.restore();
      }
    }
  };

  // Run sync on initial load
  updateNodeVisualState(node);

  // Set up double-click handlers for text widget editing
  setupTextEditHandlers(node);

  startCompactLiveMonitor(node);
  scheduleAutoHeightUpdate(node, 5, 50);

  // Remote control from AUNCollapseConnectionsController / the global collapse
  // extension (AUNInputsBasicSwitch is in its SKIP_CLASSES, so controller
  // actions are routed here). Mirrors the local toggle.
  if (node.comfyClass === "AUNInputsBasicSwitch") {
    node.__aun_remoteCollapse = (next) => {
      const target = !!next;
      if (node.properties?.[COLLAPSE_KEY] === target) return;
      node.properties = node.properties || {};
      node.properties[COLLAPSE_KEY] = target;
      applyCollapseConnectionsState(node);
    };

    // Restore a collapsed layout loaded from a saved workflow.
    if (isCollapseConnections(node)) {
      applyCollapseConnectionsState(node);
    }
  }

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

  // In compact mode hide only the numeric bounds (minimum/maximum). The mode,
  // index and range widgets stay visible in both modes so selection can always
  // be steered by hand. minimum/maximum sit above the mode widget and would
  // push the widget column down 2 slots, so they stay hidden in compact.
  // Re-showing in full mode is required: widgets hidden in compact would
  // otherwise stay hidden when un-compacting.
  if (hasModeWidget(node)) {
    const show = !compact;
    applyWidgetHiddenState(getWidget(node, "minimum"), !show);
    applyWidgetHiddenState(getWidget(node, "maximum"), !show);
    applyWidgetHiddenState(getWidget(node, "index"), false);
    applyWidgetHiddenState(getWidget(node, "range"), false);
  }

  // Update text widgets
  for (let i = 1; i <= 20; i++) {
    const textWidget = getWidget(node, `text${i}`);
    if (textWidget) {
      applyWidgetHiddenState(textWidget, compact || i > slotCount);
      textWidget.__AUN_boundaryPad = false;
    }
  }

  // Boundary pad before the loader block (AUNInputsBasicSwitch only): full mode
  // pads the last visible text slot, compact mode pads the last visible widget
  // directly above ckpt_name (the range widget once min/max are hidden in
  // compact, with mode/index/range staying visible). The gap hosts the "Inputs"
  // section divider drawn in onDrawForeground.
  if (node.comfyClass === "AUNInputsBasicSwitch") {
    for (const w of node.widgets || []) {
      if (w && typeof w === "object") w.__AUN_boundaryPad = false;
    }

    let padTarget = null;
    if (!compact) {
      padTarget = getWidget(node, `text${slotCount}`);
    } else {
      // Compact: pad the last visible widget directly above ckpt_name so the
      // "Inputs" divider always sits in a gap. With min/max hidden in compact
      // this is the range widget (mode/index stay visible above it).
      const ckpt = getWidget(node, "ckpt_name");
      if (ckpt) {
        const widgets = node.widgets || [];
        for (let i = widgets.indexOf(ckpt) - 1; i >= 0; i--) {
          const w = widgets[i];
          if (w && !w.hidden) {
            padTarget = w;
            break;
          }
        }
      }
    }
    if (padTarget) padTarget.__AUN_boundaryPad = true;

    // Start the widget area below the output rail so the "Text Selection"
    // divider (drawn at the rail anchor) always has a clean gap at the top of
    // the node instead of slicing through the first widget. LiteGraph lays out
    // widgets from widgetStartY (normally just below the deepest slot, which
    // for 16 outputs already sits right on top of the anchor).
    const slotH = globalThis?.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
    const outCount = (node.outputs || []).length;
    if (outCount && slotH) {
      // Collapsed connections shrink the output rail to a few rows (params
      // converge to one dot, text/label/index remap to the freed-up rows), so
      // the widget area moves up with it; the divider/overlay use the same row
      // count so the anchor always sits just below the rail.
      const metrics = getCollapseRailMetrics(node);
      const rows = isCollapseConnections(node) && metrics
        ? metrics.collapsedRows
        : outCount;
      const anchorY =
        (node.constructor?.slot_start_y || 0) + (rows + 0.7) * slotH;
      node.widgets_start_y = anchorY + TEXT_SELECTION_ROW_GAP;
    }

    // Text Selection divider gap: pads the widget at/just below the
    // output-rail anchor so the divider line + label have a clean gap to sit in
    // (below the widget, which keeps it clear of the last output slot's label).
    for (const w of node.widgets || []) {
      if (w && typeof w === "object") w.__AUN_textSelPad = false;
    }
    const straddler = getTextSelectionStraddler(node);
    if (straddler) straddler.__AUN_textSelPad = true;
  }

  // Update index widget (for non-compact mode or other node types)
  const indexWidget = getWidget(node, "index");
  if (indexWidget) {
    if (typeof indexWidget.options === "object") {
      indexWidget.options.max = slotCount;
      indexWidget.options.min = 1;
    } else {
      indexWidget.options = { max: slotCount, min: 1 };
    }

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

  // Also cap minimum and maximum widgets for AUNTextIndexSwitch4
  const minWidget = getWidget(node, "minimum");
  const maxWidget = getWidget(node, "maximum");
  [minWidget, maxWidget].forEach((w) => {
    if (!w) return;
    if (typeof w.options === "object") {
      w.options.max = slotCount;
      w.options.min = 1;
    } else {
      w.options = { max: slotCount, min: 1 };
    }
    if (w.inputEl) {
      if (typeof w.inputEl.setAttribute === "function") {
        w.inputEl.setAttribute("max", slotCount);
        w.inputEl.setAttribute("min", 1);
      }
      if (typeof w.inputEl.max !== "undefined") w.inputEl.max = slotCount;
      if (typeof w.inputEl.min !== "undefined") w.inputEl.min = 1;
    }
    const val = Number(w.value ?? 1);
    if (val > slotCount || val < 1) {
      w.value = slotCount;
      if (w.inputEl && typeof w.inputEl.value !== "undefined") w.inputEl.value = slotCount;
      if (typeof w.callback === "function") w.callback.call(w, slotCount);
    }
  });

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

  updateHiddenLinks();

  if (
    typeof node.computeSize === "function" &&
    typeof node.setSize === "function"
  ) {
    try {
      const newSize = node.computeSize();
      if (newSize && Array.isArray(newSize) && newSize.length >= 2) {
        // Always preserve the user's current width
        const widthToUse = node.size[0];
        node.setSize([widthToUse, newSize[1] + 15]);
      }
    } catch (e) {
      // ignore
    }
  }

  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);

  scheduleAutoHeightUpdate(node, 5, 50);
  applyCompactSlotLabels(node);
  applyCollapseSlotLabels(node);
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

// Re-applies the collapsed-connections layout for AUNInputsBasicSwitch after
// the property flips: slot labels, the rail/window geometry (widgets_start_y
// and the divider/overlay anchors are all collapse-aware) and the node height.
function applyCollapseConnectionsState(node) {
  if (!node || node.comfyClass !== "AUNInputsBasicSwitch") return;
  applyCollapseSlotLabels(node);
  updateNodeVisualState(node);
  updateDividerOverlayPosition(node);
  scheduleOverlayUpdate();
}

function toggleCollapseConnections(node) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[COLLAPSE_KEY] = !isCollapseConnections(node);
  applyCollapseConnectionsState(node);
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
          // Always preserve the user's current width
          const widthToUse = node.size[0];
          if (Math.abs(node.size[1] - paddedHeight) > 5) {
            node.setSize([widthToUse, paddedHeight]);
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
    cleanupDividerOverlay(node);
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

// Draws the "Text Selection" section divider just below the last output slot
// (the "index" output on AUNInputsBasicSwitch). Anchored to the output rail
// instead of a widget because the mode widget jumps position in compact mode
// depending on the selected mode; the output rail never moves.
const TEXT_SELECTION_DIVIDER_NOTE = "Text Selection";

// Text Selection divider overlays are DOM elements (not canvas) because the
// node widgets render as opaque DOM on top of the canvas; a canvas line at
// this height would be hidden behind them. The overlay is anchored to the
// output rail so it never moves when the mode widget jumps in compact mode.
const dividerOverlays = new WeakMap();

function hasDividerNodes() {
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  return nodes.some(
    (node) =>
      node.comfyClass === "AUNInputsBasicSwitch" && !node.flags?.collapsed,
  );
}

function getDividerOverlay(node) {
  if (dividerOverlays.has(node)) return dividerOverlays.get(node);

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed;
    z-index: 11;
    pointer-events: none;
    display: none;
  `;

  const lineStyle =
    "flex: 1; height: 1px; background: rgba(255, 255, 255, 0.16);";

  const leftLine = document.createElement("div");
  leftLine.style.cssText = lineStyle;

  const label = document.createElement("span");
  label.textContent = TEXT_SELECTION_DIVIDER_NOTE;
  label.style.cssText = `
    flex: none;
    padding: 0 8px;
    color: rgba(255, 255, 255, 0.35);
    font: 10px sans-serif;
    white-space: nowrap;
  `;

  const rightLine = document.createElement("div");
  rightLine.style.cssText = lineStyle;

  overlay.appendChild(leftLine);
  overlay.appendChild(label);
  overlay.appendChild(rightLine);

  document.body.appendChild(overlay);

  const ov = { overlay, leftLine, label, rightLine };
  dividerOverlays.set(node, ov);
  return ov;
}

// Finds the widget whose vertical span contains the output-rail anchor (one
// slot-step below the last output slot's center). The "Text Selection" divider
// normally sits in the clean gap at the top of the widget area (widgets are
// pushed below the anchor via node.widgets_start_y), in which case no widget
// contains the anchor and this returns null. When a widget genuinely straddles
// the anchor, this returns it and the divider is padded below it (see
// updateNodeVisualState). Falls back to the last visible widget when the anchor
// sits below every widget.
function getTextSelectionStraddler(node) {
  if (!node || node.comfyClass !== "AUNInputsBasicSwitch") return null;
  const outputCount = (node.outputs || []).length;
  const slotH = globalThis?.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  if (!outputCount || !slotH) return null;

  const metrics = getCollapseRailMetrics(node);
  const rows = isCollapseConnections(node) && metrics
    ? metrics.collapsedRows
    : outputCount;
  const anchorY =
    (node.constructor?.slot_start_y || 0) + (rows + 0.7) * slotH;
  const visible = (node.widgets || []).filter((w) => w && !w.hidden);
  const width = node.size?.[0];

  for (const w of visible) {
    const top = Number(w.last_y ?? w.y ?? 0);
    if (top <= 0) continue;
    // Widgets that start below the anchor are part of the section beneath the
    // divider: the divider belongs in the gap above them, not in their span.
    if (top > anchorY) return null;
    let h = 0;
    try {
      const size =
        typeof w.computeSize === "function" ? w.computeSize(width) : null;
      if (Array.isArray(size) && size.length >= 2) h = Number(size[1]) || 0;
    } catch (e) {
      // ignore
    }
    if (anchorY <= top + h) return w;
  }
  return visible.length ? visible[visible.length - 1] : null;
}

function updateDividerOverlayPosition(node) {
  if (
    !node ||
    node.comfyClass !== "AUNInputsBasicSwitch" ||
    node.flags?.collapsed
  ) {
    const ov = dividerOverlays.get(node);
    if (ov) ov.overlay.style.display = "none";
    return;
  }

  const outputCount = (node.outputs || []).length;
  const slotH = globalThis?.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  if (!outputCount || !slotH) return;

  const canvas = app.canvas;
  if (!canvas || !canvas.canvas || !canvas.ds) return;

  try {
    const ov = getDividerOverlay(node);
    const canvasRect = canvas.canvas.getBoundingClientRect();
    const scale = canvas.ds.scale;
    const panOffsetX = canvas.ds.offset[0];
    const panOffsetY = canvas.ds.offset[1];

    // Snap to the gap created below the straddling widget (padded in
    // updateNodeVisualState): divider sits at straddler.bottom + pad/2, which is
    // always below the last output slot's label. Fall back to the output-rail
    // anchor when the widget layout hasn't settled yet.
    const metrics = getCollapseRailMetrics(node);
    const rows = isCollapseConnections(node) && metrics
      ? metrics.collapsedRows
      : outputCount;
    const anchor =
      (node.constructor?.slot_start_y || 0) + (rows + 0.7) * slotH;
    let y = 0;
    const straddler = getTextSelectionStraddler(node);
    if (straddler && straddler.__AUN_textSelPad) {
      const top = Number(straddler.last_y ?? straddler.y ?? 0);
      if (top > 0) {
        let h = 0;
        try {
          const size =
            typeof straddler.computeSize === "function"
              ? straddler.computeSize(node.size?.[0])
              : null;
          if (Array.isArray(size) && size.length >= 2) h = Number(size[1]) || 0;
        } catch (e) {
          // ignore
        }
        y = top + h - TEXT_SELECTION_PAD / 2;
      }
    }
    if (!(y > 0)) {
      y = anchor;
    }

    // Never crowd the "Inputs" divider (drawn at ckptY - 9): if the snapped
    // position would land within ~40px of it, drop back to the rail anchor.
    const ckpt = getWidget(node, "ckpt_name");
    if (ckpt) {
      const ckptY = Number(ckpt.last_y ?? ckpt.y ?? 0);
      if (ckptY > 0 && Math.abs(y - (ckptY - 9)) < 40) {
        y = anchor;
      }
    }

    const rowH = 14;
    ov.overlay.style.display = "flex";
    ov.overlay.style.alignItems = "center";
    ov.overlay.style.left = `${
      canvasRect.left + (node.pos[0] + panOffsetX) * scale + 8 * scale
    }px`;
    ov.overlay.style.top = `${
      canvasRect.top + (node.pos[1] + panOffsetY) * scale + y * scale - rowH / 2
    }px`;
    ov.overlay.style.width = `${Math.max(0, node.size[0] - 16) * scale}px`;
    ov.overlay.style.height = `${rowH}px`;
  } catch (e) {
    // Ignore positioning errors during drag/zoom.
  }
}

function cleanupDividerOverlay(node) {
  const ov = dividerOverlays.get(node);
  if (ov) {
    ov.overlay.remove();
    dividerOverlays.delete(node);
  }
}

// Draws the "Inputs" section divider in the BOUNDARY_PAD gap above the loader
// block of AUNInputsBasicSwitch (drawn in both full and compact modes).
const SECTION_DIVIDER_NOTE = "Inputs";

function drawInputsSectionDivider(node, ctx) {
  const ckptWidget = getWidget(node, "ckpt_name");
  if (!ckptWidget) return;
  const ckptY = Number(ckptWidget.last_y ?? ckptWidget.y ?? 0);
  if (!(ckptY > 0)) return;

  // Sit the divider a little closer to the loader block so the note has clear
  // headroom and doesn't crowd the text widgets above the gap.
  const y = ckptY - 9;
  const x = node.size[0] / 2;

  ctx.save();
  ctx.font = "10px sans-serif";
  const noteW = ctx.measureText(SECTION_DIVIDER_NOTE).width;
  const gap = 8;

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, y);
  ctx.lineTo(x - noteW / 2 - gap, y);
  ctx.moveTo(x + noteW / 2 + gap, y);
  ctx.lineTo(node.size[0] - 8, y);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(SECTION_DIVIDER_NOTE, x, y);
  ctx.restore();
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
      const normalizedTargets = NODE_TYPES.map((name) => normalizeIdentifier(name));
      if (!normalizedTargets.some((target) => normalizedNodeName.includes(target))) {
        return;
      }
      if (nodeType.prototype.__AUN_textIndexSwitch3ProtoInit) return;

      const originalOnDrawFg = nodeType.prototype.onDrawForeground;
      nodeType.prototype.onDrawForeground = function onDrawForeground(ctx) {
        originalOnDrawFg?.apply(this, arguments);
        // Compact label is rendered as HTML overlay, not on canvas
        if (
          this.comfyClass === "AUNInputsBasicSwitch" &&
          !this.flags?.collapsed
        ) {
          drawInputsSectionDivider(this, ctx);
        }
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
        if (this.comfyClass === "AUNInputsBasicSwitch") {
          options.push({
            content: isCollapseConnections(this)
              ? "AUN: Show Connections"
              : "AUN: Collapse Connections",
            callback: () => {
              toggleCollapseConnections(this);
            },
          });
        }
        return options;
      };

      // In compact mode the param outputs (model/sampler/scheduler/cfg/steps/
      // seed on AUNTextIndexSwitch5) converge to a single dot at slot 3's
      // position, while the text/label/index outputs stay at slots 0/1/2.
      // node.outputs stay intact, so links, serialization, and execution are
      // unaffected.
      const origGetOutputPos = nodeType.prototype.getOutputPos;
      if (typeof origGetOutputPos === "function") {
        nodeType.prototype.getOutputPos = function getOutputPos(index) {
          if (isCompact(this) && PARAM_OUTPUT_CLASSES.has(this.comfyClass)) {
            const slot = this.outputs?.[index];
            if (slot && PARAM_OUTPUTS.has(slot.name)) {
              return origGetOutputPos.call(this, 3);
            }
          }
          // Collapsed AUNInputsBasicSwitch: the 13 param/loader outputs all
          // draw at slot 0, while text/label/index (the outputs at/after
          // firstSwitch) remap to the rows freed up at the top of the rail so
          // they stay visible. node.outputs are untouched, so links and
          // serialization are unaffected.
          if (
            this.comfyClass === "AUNInputsBasicSwitch" &&
            isCollapseConnections(this)
          ) {
            const metrics = getCollapseRailMetrics(this);
            if (metrics) {
              if (index < metrics.firstSwitch) {
                return origGetOutputPos.call(this, 0);
              }
              return origGetOutputPos.call(this, index - metrics.firstSwitch + 1);
            }
          }
          return origGetOutputPos.apply(this, arguments);
        };
      }

      // Collapsed AUNInputsBasicSwitch converges its (widget-linked) input slots
      // to a single point, matching the other AUN collapse nodes.
      const origGetInputPos = nodeType.prototype.getInputPos;
      if (typeof origGetInputPos === "function") {
        nodeType.prototype.getInputPos = function getInputPos(index) {
          if (
            this.comfyClass === "AUNInputsBasicSwitch" &&
            isCollapseConnections(this)
          ) {
            return origGetInputPos.call(this, 0);
          }
          return origGetInputPos.apply(this, arguments);
        };
      }

      // In compact mode the extra param outputs add height; collapse the space
      // they would occupy so the node fits its visible content. Expanded nodes
      // and nodes without param outputs are unchanged.
      const origComputeSize = nodeType.prototype.computeSize;
      if (typeof origComputeSize === "function") {
        nodeType.prototype.computeSize = function computeSize(out) {
          // Collapsed AUNInputsBasicSwitch: the rail shrank to a few rows and
          // widgets_start_y moved up with it, so the 16-row slot floor can beat
          // the widget term and leave a tall empty node (especially when compact
          // mode hides most widgets). Compute against the full rail height
          // (widget term always wins there), then drop the collapsed rail rows.
          if (
            this.comfyClass === "AUNInputsBasicSwitch" &&
            isCollapseConnections(this) &&
            LiteGraph?.NODE_SLOT_HEIGHT
          ) {
            const metrics = getCollapseRailMetrics(this);
            if (metrics) {
              const slotH = LiteGraph.NODE_SLOT_HEIGHT;
              const savedWsy = this.widgets_start_y;
              if (typeof savedWsy === "number") {
                this.widgets_start_y =
                  savedWsy + metrics.rowExcess * slotH;
                const s2 = origComputeSize.call(this, out);
                this.widgets_start_y = savedWsy;
                s2[1] -= metrics.rowExcess * slotH;
                return s2;
              }
            }
          }
          const s = origComputeSize.call(this, out);
          if (isCompact(this) && PARAM_OUTPUT_CLASSES.has(this.comfyClass) && LiteGraph?.NODE_SLOT_HEIGHT) {
            const paramCount = (this.outputs || []).filter(
              (slot) => slot && PARAM_OUTPUTS.has(slot.name),
            ).length;
            if (paramCount > 1) {
              s[1] = Math.max(
                (this.constructor?.slot_start_y || 0) +
                  LiteGraph.NODE_SLOT_HEIGHT,
                s[1] - (paramCount - 1) * LiteGraph.NODE_SLOT_HEIGHT,
              );
            }
          }
          return s;
        };
      }

      nodeType.prototype.__AUN_textIndexSwitch3ProtoInit = true;
    },

    nodeCreated(node) {
      patchTargetNode(node);
      if (node.comfyClass === "AUNInputsBasicSwitch") {
        updateDividerOverlayPosition(node);
        scheduleOverlayUpdate();
      }
    },

    loadedGraphNode(node) {
      // Restore slot_count and index from aun_pginfo if available
      const pginfo = app.globalData?.aun_pginfo || {};
      const nodeData = pginfo?.[String(node.id)];

      if (nodeData && NODE_TYPES.includes(nodeData.node)) {
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
        if (NODE_TYPES.includes(pginfo[nodeId]?.node)) {
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

// Hook into canvas node addition to patch new nodes
if (app && app.canvas) {
  const origAddNode = app.canvas.ds?.addNode || app.canvas.addNode;
  if (origAddNode) {
    app.canvas.ds.addNode = function(node, skipUpdate) {
      const result = origAddNode.apply(this, arguments);
      if (node) {
        setTimeout(() => patchTargetNode(node), 50);
        setTimeout(() => {
          if (node && isTargetNode(node)) {
            updateNodeVisualState(node);
          }
        }, 100);
      }
      return result;
    };
  }
}

// Listen for executed events to cache output index on AUNRandomIndexSwitch nodes
// and force-update overlays on AUNTextIndexSwitch3/4 nodes
if (typeof window?.addEventListener === "function") {
  api.addEventListener("executed", ({ detail }) => {
    if (!detail || !app?.graph) return;
    const nodeId = detail.node;
    if (nodeId == null) return;

    const node = app.graph.getNodeById?.(nodeId) || app.graph.getNodeById?.(parseInt(nodeId, 10));
    if (!node) return;

    const nodeType = (node.comfyClass || node.type || "").toLowerCase();
    if (nodeType.includes("aunrandomindexswitch")) {
      // Cache the output index from the executed message
      const output = detail.output;
      let val = null;
      if (output != null && typeof output === "object" && !Array.isArray(output)) {
        if (output.index !== undefined) val = parseInt(output.index, 10);
      } else if (Array.isArray(output) && output.length > 0) {
        val = parseInt(output[0], 10);
      } else if (output != null) {
        val = parseInt(output, 10);
      }
      if (Number.isInteger(val)) {
        node.__aun_last_exec_index = val;
      }
    }

    // Force overlay update on AUNTextIndexSwitch3/4 when they execute
    if (isTargetNode(node)) {
      const output = detail.output;
      if (output) {
        const idx = output.index != null ? parseInt(output.index, 10) : (Array.isArray(output) ? parseInt(output[2], 10) : null);
        if (idx != null && Number.isInteger(idx) && idx > 0) {
          node.__aun_last_exec_index = idx;
          updateCompactOverlay(node, idx, true);
        }
      }
    }
  });

  // Listen for AUN_random_text_index_selected events - these fire with the correct index
  // from AUNRandomTextIndexSwitch/AUNRandomTextIndexSwitchV2 nodes
  api.addEventListener("AUN_random_text_index_selected", ({ detail }) => {
    if (!detail || !app?.graph) return;
    const nodeId = detail.node_id;
    if (!nodeId) return;

    const switchNode = app.graph.getNodeById?.(nodeId) || app.graph.getNodeById?.(parseInt(nodeId, 10));
    if (!switchNode) return;

    const idx = parseInt(detail.index) || 1;

    // Find all AUNTextIndexSwitch3/4 nodes that have their index input linked to this switch node
    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const node of nodes) {
      if (!isTargetNode(node)) continue;

      const indexInput = node.inputs?.find((i) => i.name === "index");
      if (!indexInput?.link) continue;

      const link = app.graph.links?.get?.(indexInput.link);
      if (!link) continue;

      // Check if this node's index input is connected to the switch node that fired the event
      if (String(link.origin_id) === String(nodeId)) {
        switchNode.__aun_last_exec_index = idx;
        node.__aun_last_exec_index = idx;
        // Force overlay update
        updateCompactOverlay(node, idx, true);
      } else {
        // Check if the index input is connected to AUNRandomIndexSwitch which is then connected to this switch
        // In that case, also cache the index on the target node
        const srcNode = app.graph.getNodeById?.(link.origin_id);
        if (srcNode) {
          const srcType = (srcNode.comfyClass || srcNode.type || "").toLowerCase();
          if (srcType.includes("aunrandomindexswitch")) {
            // The AUNRandomIndexSwitch feeds into this switch node, cache the index on the source
            srcNode.__aun_last_exec_index = idx;
            // Force overlay update on the target node
            updateCompactOverlay(node, idx, true);
          }
        }
      }
    }
  });
}

// Also hook graph events
if (app && app.graph) {
  app.graph.addEventListener("node-added", (e) => {
    const node = e.detail.node || e.node;
    if (node) {
      setTimeout(() => patchTargetNode(node), 50);
      setTimeout(() => {
        if (node && isTargetNode(node)) {
          updateNodeVisualState(node);
        }
      }, 100);
    }
  });
}
