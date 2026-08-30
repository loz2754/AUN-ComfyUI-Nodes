/**
 * Vue frontend implementation of the LoRA stack with triggers + CLIP.
 *
 * Replaces web/AUN_lora_stack_with_triggers_model_clip.js while Nodes 2.0
 * is active. Same architecture as web/vue/AUN_lora_stack_vue.js (see there
 * and AGENTS.md "LoRA stack port patterns") plus the model_clip extras:
 *  - editable strength inputs with +/- buttons and pointer drag
 *  - optional clip-strength column (menu toggle, hidden by default follows
 *    the model strength via syncHiddenClipStrengths)
 *  - compact footer overlay showing joined trigger words (menu toggle)
 *  - persistent node scanner for nodes created after load
 */

import { app } from "../../../scripts/app.js";
import {
  registerVueExtension,
  vueGetWidget,
  vueRegisterNodeDblClick,
  vueTriggerWorkflowCapture,
} from "./aun-vue.js";
import { makeLoraLabelClickable } from "../aun_lora_dropdown_shared.js";
import { openLoraInfoDialog } from "../aun_lora_info_shared.js";
import {
  captureAunWidgetValues,
  restoreAunWidgetValues,
} from "../aun_persistence_shared.js";

const NODE_TYPE = "AUNLoraStackWithTriggersModelClip";
const PROP_KEY = "_AUN_compactMode";
const PROP_SHOW_CLIP_STRENGTH = "_AUN_showClipStrengthInCompact";
const PROP_SHOW_FOOTER = "_AUN_showFooter";
const COMPACT_VALUES_PROP = "_AUN_mc_compactValues";
const MAX_SLOTS = 10;
const COMPACT_ROW_HEIGHT = 24;
const COMPACT_ROW_GAP = 3;
const COMPACT_SIDE_PADDING = 10;
const STATIC_WIDGETS = [
  "num_slots",
  "apply_stack",
  "trigger_joiner",
  "dedupe_triggers",
];
const SLOT_WIDGET_ORDER = [
  "lora",
  "strength_model",
  "strength_clip",
  "enabled",
  "trigger",
];
const KEEP_IN_COMPACT = new Set(["apply_stack", "base_prompt"]);

// ── Small helpers ─────────────────────────────────────────────────────

function isTargetNode(node) {
  return !!node && node.comfyClass === NODE_TYPE;
}

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, value) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!value;
}

function showClipStrengthInCompact(node) {
  return !!node?.properties?.[PROP_SHOW_CLIP_STRENGTH];
}

function setShowClipStrengthInCompact(node, show) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_SHOW_CLIP_STRENGTH] = !!show;
}

function showFooter(node) {
  return !!node?.properties?.[PROP_SHOW_FOOTER];
}

function setShowFooter(node, show) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_SHOW_FOOTER] = !!show;
}

function isNodeCollapsed(node) {
  return !!node?.flags?.collapsed;
}

function normalizeScalar(v) {
  if (v && typeof v === "object" && "value" in v) return v.value;
  return v;
}

function normalizeLoraWidgetValue(v) {
  return normalizeScalar(v);
}

function loraBasename(value) {
  const s = String(value ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  return s ?? "";
}

function formatCompactLoraLabel(value) {
  const base = loraBasename(value) ?? String(value ?? "").trim();
  if (!base) return "";
  if (base === "None") return "None";
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getWidget(node, name) {
  const live = node.widgets?.find((w) => w?.name === name);
  if (live) return live;
  return node.__AUN_allWidgets?.find((w) => w?.name === name) ?? null;
}

// Registry maintenance: one entry per widget NAME. Replacing by name keeps
// the latest widget object (and its live value) after compact/expand cycles.
function registerAllWidget(node, w) {
  if (!w?.name) return;
  if (!Array.isArray(node.__AUN_allWidgets)) node.__AUN_allWidgets = [];
  const idx = node.__AUN_allWidgets.findIndex((x) => x?.name === w.name);
  if (idx !== -1) node.__AUN_allWidgets[idx] = w;
  else node.__AUN_allWidgets.push(w);
}

function hasLinkedInput(node, widgetName) {
  return !!node?.inputs?.some((i) => i.name === widgetName && i.link != null);
}

function getNumSlots(node) {
  const raw = normalizeScalar(getWidget(node, "num_slots")?.value);
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SLOTS, Math.max(1, n));
}

function setWidgetValue(widget, value) {
  if (!widget) return;
  widget.value = value;
  if (typeof widget.callback === "function") {
    try {
      widget.callback.call(widget, value);
    } catch (_) {}
  }
}

function clampNumber(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function roundToStep(v, step = 0.01) {
  const s = Number.isFinite(step) && step > 0 ? step : 0.01;
  return Math.round(v / s) * s;
}

function getStrengthConfig() {
  // Fixed def we control (AUNLoraStackWithTriggersModelClip.py):
  // FLOAT, min -20, max 20, step 0.01.
  return { min: -20, max: 20, step: 0.01 };
}

function setNodeSize(node, w, h) {
  try {
    node.setSize([w, Math.max(h, 60)]);
  } catch (_) {}
}

function widgetOrderList() {
  const order = [...STATIC_WIDGETS];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    for (const p of SLOT_WIDGET_ORDER) order.push(`${p}_${i}`);
  }
  order.push("base_prompt");
  return order;
}

function reorderWidgets(node) {
  if (!Array.isArray(node.widgets)) return;
  const order = widgetOrderList();
  try {
    node.widgets.sort((a, b) => {
      const ia = order.indexOf(a?.name);
      const ib = order.indexOf(b?.name);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  } catch (_) {}
}

// ── Redraw shotgun ────────────────────────────────────────────────────

function forceFullRedraw(node) {
  node.setDirtyCanvas?.(true, true);
  node.graph?.setDirtyCanvas?.(true, true);
  if (app?.canvas?.is_rendering) app.canvas.is_rendering = false;
  try {
    app?.canvas?.draw?.(true, true);
  } catch (_) {}
  try {
    node.graph?.change?.();
  } catch (_) {}
  try {
    node.onPropertyChanged?.("_force_refresh", Date.now());
  } catch (_) {}
  try {
    // vueNodesMode-only re-render trick: on canvas-drawn frontends
    // (1.49.6's Nodes 2.0) onNodeAdded duplicates the node's rendering.
    if (document?.querySelector?.("[data-node-id]")) {
      const g = node.graph ?? app?.graph;
      if (typeof g?.onNodeAdded === "function") g.onNodeAdded(node);
    }
  } catch (_) {}
  if (node.graph?.canvas) {
    node.graph.canvas.dirty_canvas = true;
    node.graph.canvas.dirty_bgcanvas = true;
  }
  for (const delay of [1, 10, 50]) {
    setTimeout(() => {
      try {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
      } catch (_) {}
    }, delay);
  }
}

// ── Trigger word helpers ──────────────────────────────────────────────

function appendTriggerWord(node, slotIndex, word) {
  const widget = getWidget(node, `trigger_${slotIndex}`);
  const text = String(word || "").trim();
  if (!widget || !text) {
    throw new Error("No trigger field available for this LoRA slot.");
  }
  const current = String(normalizeScalar(widget.value) ?? "").trim();
  const parts = current
    ? current.split(", ").map((part) => part.trim()).filter(Boolean)
    : [];
  if (parts.some((part) => part.toLowerCase() === text.toLowerCase())) {
    return `"${text}" is already in the trigger words.`;
  }
  const nextValue = parts.length ? `${current}, ${text}` : text;
  setWidgetValue(widget, nextValue);
  captureAunWidgetValues(node);
  forceFullRedraw(node);
  vueTriggerWorkflowCapture();
  return `Inserted "${text}" into trigger words.`;
}

function resolveStackTriggersForDisplay(node) {
  const applyStackW = getWidget(node, "apply_stack");
  if (!normalizeScalar(applyStackW?.value)) return null;
  const numSlots = getNumSlots(node);
  const triggers = [];
  for (let i = 1; i <= numSlots; i++) {
    const enabledWidget = getWidget(node, `enabled_${i}`);
    const triggerWidget = getWidget(node, `trigger_${i}`);
    if (!normalizeScalar(enabledWidget?.value) || !triggerWidget) continue;
    const triggerValue = String(normalizeScalar(triggerWidget.value) ?? "").trim();
    if (triggerValue) triggers.push(triggerValue);
  }
  return triggers.length > 0 ? triggers : null;
}

function syncHiddenClipStrengths(node) {
  if (!isTargetNode(node) || showClipStrengthInCompact(node)) return;
  for (let i = 1; i <= MAX_SLOTS; i += 1) {
    const modelWidget = getWidget(node, `strength_model_${i}`);
    const clipWidget = getWidget(node, `strength_clip_${i}`);
    if (!modelWidget || !clipWidget) continue;
    const nextValue = Number(normalizeScalar(modelWidget.value));
    if (!Number.isFinite(nextValue)) continue;
    if (Number(normalizeScalar(clipWidget.value)) === nextValue) continue;
    setWidgetValue(clipWidget, nextValue);
  }
}

// ── Compact rows overlay ──────────────────────────────────────────────

function getCanvasRect() {
  try {
    const cv = app?.canvas?.canvas;
    if (!cv) return null;
    return cv.getBoundingClientRect();
  } catch (_) {
    return null;
  }
}

// On DOM-rendered frontends (vueNodes) the node itself is a DOM element
// that moves in lockstep with the drag — anchoring rows to it eliminates
// the one-frame trail the legacy canvas transform produces.
function getNodeEl(node) {
  try {
    if (!document?.querySelectorAll?.(`[data-node-id="${node.id}"]`)) return null;
    const candidates = document.querySelectorAll(`[data-node-id="${node.id}"]`);
    // Prefer the visible on-screen element with the largest area. Stale
    // ghost/duplicate node elements (e.g. from graph.onNodeAdded re-renders)
    // can linger off-screen — those must not anchor the overlay rows.
    const vw = window?.innerWidth ?? Infinity;
    const vh = window?.innerHeight ?? Infinity;
    let bestOnScreen = null;
    let bestOnScreenArea = 0;
    let bestAny = null;
    let bestAnyArea = 0;
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const area = r.width * r.height;
      if (area > bestAnyArea) {
        bestAnyArea = area;
        bestAny = el;
      }
      const onScreen =
        r.bottom > -40 &&
        r.top < vh + 40 &&
        r.right > -40 &&
        r.left < vw + 40;
      if (onScreen && area > bestOnScreenArea) {
        bestOnScreenArea = area;
        bestOnScreen = el;
      }
    }
    return bestOnScreen || bestAny;
  } catch (_) {
    return null;
  }
}

function getNodeDomRect(node) {
  const el = getNodeEl(node);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 ? r : null;
}

function graphToScreen(node, gx, gy, rect) {
  try {
    const canvas = app?.canvas;
    const ds = canvas?.ds;
    if (!canvas?.canvas || !ds) return null;
    const r = rect ?? canvas.canvas.getBoundingClientRect();
    const sx = (gx + (ds.offset?.[0] ?? 0)) * (ds.scale || 1) + r.left;
    const sy = (gy + (ds.offset?.[1] ?? 0)) * (ds.scale || 1) + r.top;
    return [sx, sy];
  } catch (_) {
    return null;
  }
}

function isNodeOnScreen(node) {
  const nodeEl = getNodeEl(node);
  if (nodeEl) {
    const r = nodeEl.getBoundingClientRect();
    const padding = 20;
    const vw = window?.innerWidth ?? Infinity;
    const vh = window?.innerHeight ?? Infinity;
    return (
      r.right + padding > 0 &&
      r.left - padding < vw &&
      r.bottom + padding > 0 &&
      r.top - padding < vh
    );
  }
  try {
    const canvas = app?.canvas;
    const ds = canvas?.ds;
    if (!canvas?.canvas || !ds) return false;
    const rect = canvas.canvas.getBoundingClientRect();
    const x = ((node.pos?.[0] ?? 0) + (ds.offset?.[0] ?? 0)) * ds.scale + rect.left;
    const y = ((node.pos?.[1] ?? 0) + (ds.offset?.[1] ?? 0)) * ds.scale + rect.top;
    const w = (node.size?.[0] ?? 300) * ds.scale;
    const h = (node.size?.[1] ?? 100) * ds.scale;
    const padding = 20;
    return (
      x + w + padding > rect.left &&
      x - padding < rect.right &&
      y + h + padding > rect.top &&
      y - padding < rect.bottom
    );
  } catch (_) {
    return false;
  }
}

function isNodeOccluded(node) {
  try {
    const nodes = app?.canvas?.graph?._nodes ?? app?.canvas?.graph?.nodes;
    if (!Array.isArray(nodes)) return false;
    const x = node.pos?.[0] ?? 0;
    const y = node.pos?.[1] ?? 0;
    const right = x + (node.size?.[0] ?? 300);
    const bottom = y + (node.size?.[1] ?? 100);
    for (const other of nodes) {
      if (!other || other === node) continue;
      if (other.flags?.collapsed) continue;
      const ox = other.pos?.[0] ?? 0;
      const oy = other.pos?.[1] ?? 0;
      const oright = ox + (other.size?.[0] ?? 300);
      const obottom = oy + (other.size?.[1] ?? 100);
      if (!(oright <= x || ox >= right || obottom <= y || oy >= bottom)) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function getWidgetBottomY(widget) {
  const widgetY = Number(widget?.last_y ?? widget?.y);
  if (!Number.isFinite(widgetY)) return null;
  const widgetHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 24;
  return widgetY + widgetHeight;
}

function getEstimatedCompactRowY(node) {
  const titleHeight = globalThis.LiteGraph?.NODE_TITLE_HEIGHT ?? 30;
  const slotHeight = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  const widgetHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 24;
  const socketRows = Math.max(
    node.inputs?.length || 0,
    node.outputs?.length || 0,
    1,
  );
  const socketAreaHeight = socketRows * slotHeight;
  const firstWidgetY = titleHeight + socketAreaHeight + 6;
  return firstWidgetY + widgetHeight + 8;
}

function measureFirstRowBaseY(node) {
  const nodeEl = getNodeEl(node);
  if (nodeEl) {
    try {
      const nodeRect = nodeEl.getBoundingClientRect();
      const scale =
        nodeRect.width / Math.max(1, node.size?.[0] ?? 300);
      const applyEl = nodeEl.querySelector('[aria-label="apply_stack"]');
      if (applyEl) {
        const r = applyEl.getBoundingClientRect();
        const local = (r.bottom - nodeRect.top) / scale;
        if (Number.isFinite(local) && local > 0) return local + 8;
      }
    } catch (_) {}
  }
  const runtime = getWidgetBottomY(getWidget(node, "apply_stack"));
  if (Number.isFinite(runtime)) return runtime + 8;
  return getCompactLayoutMetrics(node).firstCompactRowY;
}

function getCompactLayoutMetrics(node) {
  const storedRowY = Number(node?.__AUN_compactFirstRowY);
  const firstCompactRowY = Number.isFinite(storedRowY)
    ? storedRowY
    : getEstimatedCompactRowY(node);
  return { firstCompactRowY };
}

function getCompactFooterHeight(node) {
  if (!isCompact(node) || !showFooter(node)) return 0;
  const measured = Number(node.__AUN_footerMeasuredH);
  return Number.isFinite(measured) && measured > 0 ? measured : 42;
}

function ensureCompactRowStyles() {
  if (ensureCompactRowStyles.done || typeof document === "undefined") return;
  ensureCompactRowStyles.done = true;
  const css = `
.aun-lora-compact-row{position:fixed;left:0;top:0;z-index:80;display:flex;align-items:center;gap:6px;height:${COMPACT_ROW_HEIGHT}px;padding:0 6px;box-sizing:border-box;background:rgba(22,26,33,.94);border:1px solid rgba(255,255,255,.14);border-radius:6px;font-size:11px;color:#d5d9e0;white-space:nowrap;will-change:transform;pointer-events:none;}
.aun-lora-compact-row .aun-lora-row-checkbox,.aun-lora-compact-row .aun-lora-row-grip,.aun-lora-compact-row .aun-lora-row-label,.aun-lora-compact-row .aun-lora-row-strength,.aun-lora-compact-row .aun-lora-row-strength button,.aun-lora-compact-row .aun-lora-row-strength input,.aun-lora-compact-row .aun-lora-row-info{pointer-events:auto;}
.aun-lora-compact-row .aun-lora-row-checkbox{margin:0;width:13px;height:13px;flex:0 0 auto;}
.aun-lora-compact-row .aun-lora-row-grip{color:#6b7480;cursor:grab;user-select:none;font-size:12px;flex:0 0 auto;}
.aun-lora-compact-row .aun-lora-row-grip:active{cursor:grabbing;}
.aun-lora-compact-row.dragging{opacity:.65;cursor:grabbing;}
.aun-lora-compact-row.drag-target{outline:2px solid #6fa8ff;outline-offset:-2px;}
.aun-lora-compact-row .aun-lora-row-label{display:flex;align-items:center;min-width:0;max-width:130px;overflow:hidden;cursor:pointer;user-select:none;}
.aun-lora-compact-row .aun-lora-row-label-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.aun-lora-compact-row .aun-lora-row-label-none{color:#8a93a0;font-style:italic;}
.aun-lora-compact-row .aun-lora-row-strength{display:flex;align-items:center;gap:3px;user-select:none;touch-action:none;}
.aun-lora-compact-row .aun-lora-row-strength button{background:none;border:none;color:#9fd0ff;cursor:pointer;font-size:12px;padding:0 2px;line-height:1;}
.aun-lora-compact-row .aun-lora-row-strength input{width:38px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#d5d9e0;font-size:11px;padding:0 2px;text-align:center;}
.aun-lora-compact-row[data-hide-clip="true"] .aun-lora-row-clip{display:none;}
.aun-lora-compact-row .aun-lora-row-info{background:none;border:none;color:#9aa4b2;cursor:pointer;font-size:12px;padding:0;flex:0 0 auto;}
.aun-lora-stack-footer{position:fixed;left:0;top:0;z-index:80;box-sizing:border-box;background:rgba(22,26,33,.94);border:1px solid rgba(255,255,255,.14);border-radius:6px;font-size:11px;color:#d5d9e0;padding:4px 8px;overflow:hidden;pointer-events:none;white-space:pre-wrap;word-break:break-word;will-change:transform;}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

function syncCompactRow(node, row, showClipStrength) {
  const slotIndex = Number(row.dataset.slotIndex);
  const refs = row.__aunRefs;
  const loraW = getWidget(node, `lora_${slotIndex}`);
  const strengthModelW = getWidget(node, `strength_model_${slotIndex}`);
  const strengthClipW = getWidget(node, `strength_clip_${slotIndex}`);
  const enabledW = getWidget(node, `enabled_${slotIndex}`);
  const loraValue = String(normalizeLoraWidgetValue(loraW?.value) ?? "None") || "None";
  const hasLora = !!loraValue && loraValue !== "None";
  row.dataset.hideClip = showClipStrength ? "false" : "true";
  if (refs.checkbox) refs.checkbox.checked = !!normalizeScalar(enabledW?.value);
  if (refs.loraLabelText) {
    refs.loraLabelText.textContent = formatCompactLoraLabel(loraValue);
    refs.loraLabelText.classList.toggle("aun-lora-row-label-none", !hasLora);
  }
  if (refs.infoButton) {
    refs.infoButton.title = hasLora
      ? `Show LoRA info for ${loraValue}`
      : "No LoRA selected";
    refs.infoButton.style.visibility = hasLora ? "visible" : "hidden";
  }
  if (document.activeElement !== refs.strengthModel) {
    refs.strengthModel.value = Number(
      normalizeScalar(strengthModelW?.value) ?? 1,
    ).toFixed(2);
  }
  if (document.activeElement !== refs.strengthClip) {
    refs.strengthClip.value = Number(
      normalizeScalar(strengthClipW?.value) ?? 1,
    ).toFixed(2);
  }
}

function swapWidgetSlots(node, a, b) {
  for (const part of SLOT_WIDGET_ORDER) {
    const wa = getWidget(node, `${part}_${a}`);
    const wb = getWidget(node, `${part}_${b}`);
    if (!wa || !wb) continue;
    const tmp = wa.value;
    wa.value = wb.value;
    wb.value = tmp;
  }
  captureAunWidgetValues(node);
  forceFullRedraw(node);
  vueTriggerWorkflowCapture();
}

let reorderDrag = null;

function bindNumberInput(node, row, slotIndex, inputEl, widgetName) {
  const formatValue = (val) => {
    const num = Number(val);
    return Number.isFinite(num) ? num.toFixed(2) : "";
  };
  const afterCommit = () => {
    syncCompactRow(node, row, showClipStrengthInCompact(node));
    captureAunWidgetValues(node);
    forceFullRedraw(node);
    vueTriggerWorkflowCapture();
  };
  const adjustValue = (direction) => {
    const widget = getWidget(node, widgetName);
    const { min, max, step } = getStrengthConfig();
    const currentValue = Number(
      normalizeScalar(widget?.value) ?? inputEl.value ?? 0,
    );
    const baseValue = Number.isFinite(currentValue) ? currentValue : 0;
    const nextValue = clampNumber(
      roundToStep(baseValue + step * direction, step),
      min,
      max,
    );
    setWidgetValue(widget, nextValue);
    inputEl.value = formatValue(nextValue);
    afterCommit();
  };
  const commitValue = (rawValue) => {
    const widget = getWidget(node, widgetName);
    const { min, max, step } = getStrengthConfig();
    const parsed = parseFloat(rawValue);
    const fallback = Number(normalizeScalar(widget?.value) ?? 0);
    const nextValue = Number.isFinite(parsed)
      ? clampNumber(roundToStep(parsed, step), min, max)
      : fallback;
    setWidgetValue(widget, nextValue);
    inputEl.value = formatValue(nextValue);
    afterCommit();
  };

  inputEl.addEventListener("input", () => {
    const val = inputEl.value;
    if (!/^\d*\.?\d*$/.test(val)) {
      let sanitized = val.replace(/[^\d.]/g, "");
      const firstDot = sanitized.indexOf(".");
      if (firstDot !== -1) {
        sanitized =
          sanitized.slice(0, firstDot + 1) +
          sanitized.slice(firstDot + 1).replace(/\./g, "");
      }
      inputEl.value = sanitized;
    }
  });
  inputEl.addEventListener("change", () => commitValue(inputEl.value));
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commitValue(inputEl.value);
      inputEl.blur();
    }
  });
  inputEl.addEventListener("blur", () => commitValue(inputEl.value));
  inputEl.addEventListener("focus", () => inputEl.select?.());

  inputEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const widget = getWidget(node, widgetName);
    const { min, max, step } = getStrengthConfig();
    const startX = event.clientX;
    const startValue = Number(
      normalizeScalar(widget?.value) ?? inputEl.value ?? 0,
    );
    if (!Number.isFinite(startValue)) return;
    const pointerId = event.pointerId;
    let dragging = false;

    const finish = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      inputEl.removeEventListener("lostpointercapture", onCancel);
      if (inputEl.hasPointerCapture?.(pointerId)) {
        inputEl.releasePointerCapture(pointerId);
      }
    };

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - startX;
      if (!dragging && Math.abs(deltaX) < 4) return;
      moveEvent.preventDefault?.();
      dragging = true;
      const deltaSteps = Math.trunc(deltaX / 8);
      const nextValue = clampNumber(
        roundToStep(startValue + deltaSteps * step, step),
        min,
        max,
      );
      inputEl.value = String(nextValue);
      commitValue(nextValue);
    };

    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      finish();
      if (dragging) inputEl.blur();
    };

    const onCancel = () => {
      finish();
    };

    inputEl.setPointerCapture?.(pointerId);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    inputEl.addEventListener("lostpointercapture", onCancel);
  });

  return { adjustValue };
}

function buildCompactRow(node, slotIndex) {
  const row = document.createElement("div");
  row.className = "aun-lora-compact-row";
  row.dataset.slotIndex = String(slotIndex);
  const refs = {};
  row.__aunRefs = refs;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "aun-lora-row-checkbox";
  const enabledW = getWidget(node, `enabled_${slotIndex}`);
  checkbox.checked = !!normalizeScalar(enabledW?.value);
  checkbox.addEventListener("change", () => {
    setWidgetValue(enabledW, checkbox.checked);
    captureAunWidgetValues(node);
    forceFullRedraw(node);
    vueTriggerWorkflowCapture();
  });
  refs.checkbox = checkbox;

  const grip = document.createElement("span");
  grip.className = "aun-lora-row-grip";
  grip.textContent = "\u2630";
  grip.title = "Drag to reorder slots";
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    reorderDrag = {
      node,
      slotIndex,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      row,
    };
    row.classList.add("dragging");
    e.preventDefault();
  });

  const labelWrap = document.createElement("div");
  labelWrap.className = "aun-lora-row-label";
  const labelText = document.createElement("span");
  labelText.className = "aun-lora-row-label-text";
  labelWrap.appendChild(labelText);
  makeLoraLabelClickable(node, `lora_${slotIndex}`, labelWrap, labelText, {
    formatLabel: formatCompactLoraLabel,
    onChanged: () => {
      syncCompactRow(node, row, showClipStrengthInCompact(node));
      captureAunWidgetValues(node);
      forceFullRedraw(node);
      vueTriggerWorkflowCapture();
    },
  });
  refs.loraLabelText = labelText;

  const strengthModelWrap = document.createElement("div");
  strengthModelWrap.className = "aun-lora-row-strength";
  const modelDec = document.createElement("button");
  modelDec.textContent = "\u2212";
  const modelInput = document.createElement("input");
  modelInput.type = "text";
  modelInput.inputMode = "decimal";
  modelInput.pattern = "^\\d*(\\.\\d{0,2})?$";
  modelInput.title = `Model strength ${slotIndex}`;
  const modelInc = document.createElement("button");
  modelInc.textContent = "+";
  strengthModelWrap.append(modelDec, modelInput, modelInc);
  const modelBinding = bindNumberInput(
    node,
    row,
    slotIndex,
    modelInput,
    `strength_model_${slotIndex}`,
  );
  const bindStep = (btn, handler) => {
    btn.addEventListener("pointerdown", (e) => e.preventDefault?.());
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault?.();
      handler();
    });
  };
  bindStep(modelDec, () => modelBinding.adjustValue(-1));
  bindStep(modelInc, () => modelBinding.adjustValue(1));
  refs.strengthModel = modelInput;

  const strengthClipWrap = document.createElement("div");
  strengthClipWrap.className = "aun-lora-row-strength aun-lora-row-clip";
  const clipDec = document.createElement("button");
  clipDec.textContent = "\u2212";
  const clipInput = document.createElement("input");
  clipInput.type = "text";
  clipInput.inputMode = "decimal";
  clipInput.pattern = "^\\d*(\\.\\d{0,2})?$";
  clipInput.title = `Clip strength ${slotIndex}`;
  const clipInc = document.createElement("button");
  clipInc.textContent = "+";
  strengthClipWrap.append(clipDec, clipInput, clipInc);
  const clipBinding = bindNumberInput(
    node,
    row,
    slotIndex,
    clipInput,
    `strength_clip_${slotIndex}`,
  );
  bindStep(clipDec, () => clipBinding.adjustValue(-1));
  bindStep(clipInc, () => clipBinding.adjustValue(1));
  refs.strengthClip = clipInput;

  const infoBtn = document.createElement("button");
  infoBtn.className = "aun-lora-row-info";
  infoBtn.textContent = "\u24D8";
  infoBtn.title = "LoRA info";
  infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const loraW = getWidget(node, `lora_${slotIndex}`);
    const v = normalizeLoraWidgetValue(loraW?.value);
    openLoraInfoDialog(v, {
      insertWord: (word) => appendTriggerWord(node, slotIndex, word),
    });
  });
  refs.infoButton = infoBtn;

  row.append(checkbox, grip, labelWrap, strengthModelWrap, strengthClipWrap, infoBtn);

  return row;
}

const allCompactRowNodes = new Set();

function ensureCompactRows(node) {
  if (Array.isArray(node._AUN_compactRows)) return node._AUN_compactRows;
  node._AUN_compactRows = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const row = buildCompactRow(node, i);
    node._AUN_compactRows.push(row);
    document.body.appendChild(row);
    syncCompactRow(node, row, showClipStrengthInCompact(node));
  }
  allCompactRowNodes.add(node);
  return node._AUN_compactRows;
}

function ensureCompactFooter(node) {
  if (node.__AUN_compactFooter) return node.__AUN_compactFooter;
  const el = document.createElement("div");
  el.className = "aun-lora-stack-footer";
  document.body.appendChild(el);
  node.__AUN_compactFooter = el;
  return el;
}

function disposeCompactRows(node) {
  for (const row of node._AUN_compactRows ?? []) {
    try {
      row.remove();
    } catch (_) {}
  }
  node._AUN_compactRows = null;
  try {
    node.__AUN_compactFooter?.remove?.();
  } catch (_) {}
  node.__AUN_compactFooter = null;
  allCompactRowNodes.delete(node);
}

function positionCompactRowsCore(node, occluded, fast) {
  const rows = node._AUN_compactRows;
  if (!Array.isArray(rows)) return;
  const numSlots = getNumSlots(node);
  const showClipStrength = showClipStrengthInCompact(node);
  const rect = getCanvasRect();
  const nodeRect = getNodeDomRect(node);
  if (globalThis.__AUN_LORA_DEBUG) {
    try {
      const snap = JSON.stringify({
        dr: nodeRect ? [Math.round(nodeRect.left), Math.round(nodeRect.top)] : null,
        pos: node.pos ? [Math.round(node.pos[0]), Math.round(node.pos[1])] : null,
        row0: rows[0]?.style?.transform ?? null,
      });
      if (snap !== node.__AUN_lastPosSnap) {
        node.__AUN_lastPosSnap = snap;
        console.info(
          "[AUN] lora pos: " +
            JSON.stringify({
              id: node.id,
              fast: !!fast,
              domRect: nodeRect
                ? { l: Math.round(nodeRect.left), t: Math.round(nodeRect.top) }
                : null,
              pos: node.pos
                ? [Math.round(node.pos[0]), Math.round(node.pos[1])]
                : null,
              ds: app?.canvas?.ds
                ? { s: app.canvas.ds.scale, o: app.canvas.ds.offset }
                : null,
              row0: rows[0]?.style?.transform ?? null,
            }),
        );
      }
    } catch (_) {}
  }
  const stored = Number(node.__AUN_compactFirstRowY);
  // On the fast path (pointermove during drag) reuse the stored row Y and
  // skip DOM measurement so the rows track the node in the same event turn.
  const baseY =
    fast && Number.isFinite(stored) ? stored : measureFirstRowBaseY(node);
  if (Number.isFinite(baseY)) {
    if (!Number.isFinite(stored) || Math.abs(stored - baseY) > 1) {
      node.__AUN_compactFirstRowY = baseY;
      updateAutoHeight(node);
      scheduleCompactHeightRefresh(node);
    }
    // Re-grow even when baseY did NOT drift. The frontend re-render after
    // removeWidget recomputes node.size[1] to the shorter natural height
    // (title + inputs + apply_stack) while baseY (node-top to
    // apply_stack-bottom) stays constant, so the >1 guard above never fires
    // and the body stays too short — letting rows spill below it.
    const requiredHeight = computeCompactHeight(node, baseY, numSlots);
    if ((node.size?.[1] ?? 0) < requiredHeight) {
      setNodeSize(node, node.size?.[0] ?? 300, requiredHeight);
      scheduleCompactHeightRefresh(node);
    }
  }
  const currentWidth = node.size?.[0] ?? 300;
  const innerWidth = currentWidth - COMPACT_SIDE_PADDING * 2;
  // DOM-rendered frontends: scale from the node element so rows follow the
  // element 1:1 during drags; canvas-drawn frontends: legacy canvas scale.
  const scale = nodeRect
    ? nodeRect.width / Math.max(1, currentWidth)
    : app?.canvas?.ds?.scale || 1;
  const baseGx = node.pos?.[0] ?? 0;
  const baseGy = node.pos?.[1] ?? 0;
  for (const row of rows) {
    const slotIndex = Number(row.dataset.slotIndex);
    if (!Number.isFinite(slotIndex) || slotIndex > numSlots || occluded) {
      row.style.display = "none";
      continue;
    }
    syncCompactRow(node, row, showClipStrength);
    const slotOffset =
      baseY + (slotIndex - 1) * (COMPACT_ROW_HEIGHT + COMPACT_ROW_GAP);
    if (nodeRect) {
      row.style.display = "";
      row.__AUN_x = nodeRect.left + COMPACT_SIDE_PADDING * scale;
      row.__AUN_y = nodeRect.top + slotOffset * scale;
      row.style.transform = `translate3d(${row.__AUN_x}px, ${row.__AUN_y}px, 0)`;
      row.style.width = Math.max(80, innerWidth * scale) + "px";
      continue;
    }
    const sp = graphToScreen(
      node,
      baseGx + COMPACT_SIDE_PADDING,
      baseGy + slotOffset,
      rect,
    );
    if (!sp) {
      row.style.display = "none";
      continue;
    }
    row.style.display = "";
    row.__AUN_x = sp[0];
    row.__AUN_y = sp[1];
    row.style.transform = `translate3d(${sp[0]}px, ${sp[1]}px, 0)`;
    row.style.width = Math.max(80, innerWidth * scale) + "px";
  }

  // Footer overlay
  const footerEl = ensureCompactFooter(node);
  if (showFooter(node) && !node.__AUN_nodeBeingDragged && !occluded) {
    const h = node.size?.[1] ?? 240;
    const triggers = resolveStackTriggersForDisplay(node);
    const newText = triggers ? triggers.join(", ") : null;
    const cache = footerEl.__AUN_footerCache;
    if (cache !== newText) {
      footerEl.__AUN_footerCache = newText;
      footerEl.textContent = "";
      const b = document.createElement("b");
      b.textContent = "Stack trigger words: ";
      footerEl.appendChild(b);
      if (newText) footerEl.appendChild(document.createTextNode(newText));
      else footerEl.appendChild(document.createTextNode("(none)"));
    }
    const widthPx = Math.max(20, (currentWidth - 16) * scale);
    Object.assign(footerEl.style, {
      display: "block",
      height: "auto",
      width: widthPx + "px",
    });
    // Measure the real content height (width now constrains wrapping) and
    // reserve it in the node height so the footer always fits inside the
    // body instead of overhanging the bottom edge.
    const measuredH = footerEl.offsetHeight;
    if (measuredH > 0 && measuredH !== node.__AUN_footerMeasuredH) {
      node.__AUN_footerMeasuredH = measuredH;
      updateAutoHeight(node);
      scheduleCompactHeightRefresh(node);
    }
    const footerHeight = getCompactFooterHeight(node);
    const footerTopLocal = Math.max(0, h - footerHeight - 6);
    const bottomLocal = h - 6;
    if (nodeRect) {
      footerEl.__AUN_x = nodeRect.left + 8 * scale;
      footerEl.__AUN_y = nodeRect.top + footerTopLocal * scale;
      footerEl.style.transform = `translate3d(${footerEl.__AUN_x}px, ${footerEl.__AUN_y}px, 0)`;
    } else {
      const tl = graphToScreen(
        node,
        baseGx + 8,
        baseGy + footerTopLocal,
        rect,
      );
      const br = graphToScreen(
        node,
        baseGx + currentWidth - 8,
        baseGy + bottomLocal,
        rect,
      );
      if (tl && br) {
        footerEl.__AUN_x = tl[0];
        footerEl.__AUN_y = tl[1];
        footerEl.style.transform = `translate3d(${tl[0]}px, ${tl[1]}px, 0)`;
      }
    }
  } else {
    footerEl.style.display = "none";
  }
}

function positionCompactRowsFromCanvas(node, fast) {
  if (!isTargetNode(node)) return;
  const rows = ensureCompactRows(node);
  const compact = isCompact(node);
  const collapsed = isNodeCollapsed(node);
  const occluded = isNodeOccluded(node);
  const onScreen = isNodeOnScreen(node);
  const dragging = !!node.__AUN_nodeBeingDragged;
  const resizing = app?.canvas?.resizing_node === node;
  if (globalThis.__AUN_LORA_DEBUG) {
    try {
      const snap = JSON.stringify({ compact, collapsed, occluded, onScreen, dragging, resizing });
      if (snap !== node.__AUN_lastHideSnap) {
        node.__AUN_lastHideSnap = snap;
        console.info(
          "[AUN] lora hide: " +
            JSON.stringify({
              id: node.id,
              fast: !!fast,
              hidden: !compact || collapsed || !onScreen || dragging || resizing,
              compact,
              collapsed,
              occluded,
              onScreen,
              dragging,
              resizing,
            }),
        );
      }
    } catch (_) {}
  }
  if (!compact || collapsed || !onScreen || dragging || resizing) {
    for (const row of rows) row.style.display = "none";
    if (node.__AUN_compactFooter) node.__AUN_compactFooter.style.display = "none";
    return;
  }
  positionCompactRowsCore(node, occluded, fast);
}

let compactRowsRAF = null;

function hasCompactLoraNodes() {
  if (!app?.canvas?.graph) return false;
  const nodes = app.canvas.graph._nodes || app.canvas.graph.nodes || [];
  return nodes.some((n) => isTargetNode(n) && isCompact(n));
}

function startCompactRowsRAF() {
  if (compactRowsRAF) return;
  const rafLoop = () => {
    compactRowsRAF = requestAnimationFrame(rafLoop);
    try {
      if (app?.canvas?.graph) {
        const nodes =
          app.canvas.graph._nodes || app.canvas.graph.nodes || [];
        for (const n of nodes) {
          if (isTargetNode(n) && isCompact(n)) {
            positionCompactRowsFromCanvas(n);
          }
        }
      }
      for (const n of allCompactRowNodes) {
        if (n.graph && n.graph !== app?.canvas?.graph && n._AUN_compactRows) {
          for (const row of n._AUN_compactRows) row.style.display = "none";
          if (n.__AUN_compactFooter) n.__AUN_compactFooter.style.display = "none";
        }
      }
      if (!hasCompactLoraNodes() && allCompactRowNodes.size === 0) {
        cancelAnimationFrame(compactRowsRAF);
        compactRowsRAF = null;
      }
    } catch (_) {}
  };
  rafLoop();
}

function scheduleCompactRowsUpdate() {
  if (!compactRowsRAF) startCompactRowsRAF();
}

// ── Compact apply / restore ───────────────────────────────────────────

function removeForCompact(node, name) {
  const w = getWidget(node, name);
  if (!w) return;
  const stash =
    node.properties[COMPACT_VALUES_PROP] ||
    (node.properties[COMPACT_VALUES_PROP] = {});
  if (stash[name] !== undefined && w.value !== stash[name]) {
    w.value = stash[name];
  }
  registerAllWidget(node, w);
  node._AUN_mc_removed.set(name, w);
  stash[name] = w.value;
  try {
    node.removeWidget(w);
  } catch (_) {}
}

function restoreAllRemoved(node) {
  const removed = node._AUN_mc_removed ?? new Map();
  const saved = node.properties[COMPACT_VALUES_PROP] ?? {};
  for (const [name, stale] of [...removed.entries()]) {
    if (vueGetWidget(node, name)) continue;
    if (hasLinkedInput(node, name)) continue;
    const value =
      stale?.value !== undefined
        ? stale.value
        : saved[name] !== undefined
          ? saved[name]
          : "";
    const type = stale?.type ?? "text";
    const options = stale?.options ? { ...stale.options } : {};
    try {
      node.addWidget(type, name, value, () => {}, options);
      const w = vueGetWidget(node, name);
      if (w) {
        w.value = value;
        if (stale?.label !== undefined) w.label = stale.label;
        if (stale?.comfyHeight !== undefined) w.comfyHeight = stale.comfyHeight;
      }
    } catch (_) {}
  }
  node._AUN_mc_removed = new Map();
  node.properties[COMPACT_VALUES_PROP] = {};
  reorderWidgets(node);
  wireWidgetCallbacks(node);
}

function computeCompactHeight(node, baseY, numSlots) {
  return (
    baseY +
    numSlots * COMPACT_ROW_HEIGHT +
    Math.max(0, numSlots - 1) * COMPACT_ROW_GAP +
    getCompactFooterHeight(node) +
    10
  );
}

function updateAutoHeight(node) {
  if (!isTargetNode(node)) return;
  const currentWidth = node.size?.[0] ?? 240;
  if (isCompact(node)) {
    setNodeSize(
      node,
      currentWidth,
      computeCompactHeight(
        node,
        getCompactLayoutMetrics(node).firstCompactRowY,
        getNumSlots(node),
      ),
    );
    return;
  }
  let h = null;
  try {
    h = node.computeSize?.([currentWidth, 0])?.[1];
  } catch (_) {}
  if (Number.isFinite(h) && h > 40) setNodeSize(node, currentWidth, h);
}

function applyCompact(node) {
  if (!isTargetNode(node)) return;
  reorderWidgets(node);
  const compact = isCompact(node);

  if (compact) {
    for (const w of [...(node.widgets || [])]) {
      if (!w?.name || KEEP_IN_COMPACT.has(w.name)) continue;
      if (hasLinkedInput(node, w.name)) continue;
      removeForCompact(node, w.name);
    }
    syncHiddenClipStrengths(node);
    ensureCompactRows(node);
    scheduleCompactRowsUpdate();
  } else {
    restoreAllRemoved(node);
    disposeCompactRows(node);
  }

  updateAutoHeight(node);
  forceFullRedraw(node);
  captureAunWidgetValues(node);
  setTimeout(() => vueTriggerWorkflowCapture(), 50);
}

function toggleCompactMode(node) {
  if (!isTargetNode(node)) return;
  setCompact(node, !isCompact(node));
  applyCompact(node);
  scheduleCompactHeightRefresh(node);
  setTimeout(() => vueTriggerWorkflowCapture(), 50);
}

function toggleCompactClipStrength(node) {
  if (!isTargetNode(node)) return;
  setShowClipStrengthInCompact(node, !showClipStrengthInCompact(node));
  syncHiddenClipStrengths(node);
  applyCompact(node);
  setTimeout(() => vueTriggerWorkflowCapture(), 50);
}

function scheduleCompactHeightRefresh(node, delay = 0) {
  if (!isTargetNode(node)) return;
  if (node.__AUN_compactHeightTimer) {
    clearTimeout(node.__AUN_compactHeightTimer);
    node.__AUN_compactHeightTimer = null;
  }
  node.__AUN_compactHeightTimer = setTimeout(() => {
    node.__AUN_compactHeightTimer = null;
    if (!node || !isCompact(node)) return;
    updateAutoHeight(node);
    forceFullRedraw(node);
  }, delay);
}

function scheduleCompactLoadStabilization(node) {
  // The frontend may hydrate saved widget values after our load hooks
  // (store-backed widgets on the Vue frontend) — the final pass re-applies
  // the file-sourced values after hydration and re-allows captures.
  const DELAYS = [100, 400, 900, 1800];
  for (const delay of DELAYS) {
    setTimeout(() => {
      try {
        if (!isTargetNode(node)) return;
        restoreAunWidgetValues(node);
        applyCompact(node);
        scheduleCompactRowsUpdate();
        if (delay === 1800) node.__AUN_loadStabilizing = false;
      } catch (_) {}
    }, delay);
  }
}

// ── Widget callbacks / monitor ────────────────────────────────────────

function wireWidgetCallbacks(node) {
  const numW = getWidget(node, "num_slots");
  if (numW && !numW._AUN_mcWired) {
    numW._AUN_mcWired = true;
    const orig = numW.callback;
    numW.callback = function (v) {
      if (typeof orig === "function") {
        try {
          orig.apply(this, arguments);
        } catch (_) {}
      }
      applyCompact(node);
      scheduleCompactRowsUpdate();
    };
  }
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const lw = getWidget(node, `lora_${i}`);
    if (lw && !lw._AUN_mcWired) {
      lw._AUN_mcWired = true;
      const orig = lw.callback;
      lw.callback = function (v) {
        if (typeof orig === "function") {
          try {
            orig.apply(this, arguments);
          } catch (_) {}
        }
        // Do NOT auto-fill the slot's trigger with the LoRA filename on
        // selection — the trigger field is the user's own trigger words.
        try {
          applyCompact(node);
          scheduleCompactRowsUpdate();
        } catch (_) {}
      };
    }
    for (const part of [
      "strength_model",
      "strength_clip",
      "enabled",
      "trigger",
      "apply_stack",
    ]) {
      const name = part === "apply_stack" ? part : `${part}_${i}`;
      const w = getWidget(node, name);
      if (!w || w._AUN_mcWired) continue;
      w._AUN_mcWired = true;
      const orig = w.callback;
      w.callback = function (v) {
        if (typeof orig === "function") {
          try {
            orig.apply(this, arguments);
          } catch (_) {}
        }
        applyCompact(node);
        scheduleCompactRowsUpdate();
      };
    }
  }
}

function startLiveMonitor(node) {
  if (node._AUN_mcMonitor) return;
  node._AUN_mcMonitor = setInterval(() => {
    try {
      if (!isTargetNode(node)) return;
      if (!isCompact(node)) return;
      if (vueGetWidget(node, "num_slots")) {
        applyCompact(node);
        return;
      }
      scheduleCompactRowsUpdate();
    } catch (_) {}
  }, 300);
}

// ── Node setup / scanner ──────────────────────────────────────────────

function ensureWidgetSerialization(node) {
  if (typeof node.serialize !== "function" || node._AUN_mcSerializeSetup) {
    return;
  }
  node._AUN_mcSerializeSetup = true;
  const orig = node.serialize;
  node.serialize = function (...args) {
    try {
      captureAunWidgetValues(this);
    } catch (_) {}
    let result;
    try {
      result = orig.apply(this, args);
    } catch (_) {
      result = null;
    }
    // Emit the full widget set in definition order so a compact-mode save
    // (removed widgets are absent from the presented view) still restores
    // every value positionally on load.
    if (result && typeof result === "object") {
      try {
        const wv = [];
        for (const name of widgetOrderList()) {
          const w = this.__AUN_allWidgets?.find((x) => x?.name === name);
          if (!w) continue;
          let val;
          try {
            val =
              typeof w.serializeValue === "function"
                ? w.serializeValue(this, wv.length)
                : w.value;
          } catch (_) {
            val = w.value;
          }
          // Removed store-backed widgets serialize to {} on the Vue
          // frontend — fall back to the raw widget value.
          const isEmptyObject =
            val !== null &&
            typeof val === "object" &&
            !Array.isArray(val) &&
            Object.keys(val).length === 0;
          if (isEmptyObject) val = w.value;
          wv.push(val);
        }
        result.widgets_values = wv;
      } catch (_) {}
    }
    return result;
  };
}

function setupNode(node) {
  if (!isTargetNode(node) || node.__AUN_mcSetup) return;
  node.__AUN_mcSetup = true;
  // nodeCreated also fires during workflow load, BEFORE the frontend
  // applies saved widgets_values — block captures until the load path has
  // settled (loadedGraphNode/stabilization re-arm and clear this flag).
  node.__AUN_loadStabilizing = true;
  setTimeout(() => {
    if (node && node.type !== undefined) node.__AUN_loadStabilizing = false;
  }, 2500);
  node.properties = node.properties || {};
  if (typeof node.properties[PROP_KEY] !== "boolean") {
    node.properties[PROP_KEY] = true;
  }
  if (typeof node.properties[PROP_SHOW_CLIP_STRENGTH] !== "boolean") {
    node.properties[PROP_SHOW_CLIP_STRENGTH] = true;
  }
  if (node.properties[COMPACT_VALUES_PROP] === undefined) {
    node.properties[COMPACT_VALUES_PROP] = {};
  }
  if (!Array.isArray(node.__AUN_allWidgets)) node.__AUN_allWidgets = [];
  for (const w of node.widgets || []) {
    registerAllWidget(node, w);
  }
  // Keep the registry fresh when the frontend adds widgets itself.
  if (typeof node.addWidget === "function" && !node.__AUN_mcAddTracked) {
    node.__AUN_mcAddTracked = true;
    const origAddWidget = node.addWidget;
    node.addWidget = function (...args) {
      const w = origAddWidget.apply(this, args);
      if (w) registerAllWidget(this, w);
      return w;
    };
  }
  node._AUN_mc_removed = new Map();
  ensureCompactRowStyles();
  ensureWidgetSerialization(node);
  wireWidgetCallbacks(node);
  startLiveMonitor(node);
  applyCompact(node);
  scheduleCompactHeightRefresh(node);
  if (!node.__AUN_mcRemovedPatched) {
    node.__AUN_mcRemovedPatched = true;
    const origRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
      try {
        disposeCompactRows(node);
      } catch (_) {}
      if (node._AUN_mcMonitor) {
        clearInterval(node._AUN_mcMonitor);
        node._AUN_mcMonitor = null;
      }
      if (node.__AUN_compactHeightTimer) {
        clearTimeout(node.__AUN_compactHeightTimer);
        node.__AUN_compactHeightTimer = null;
      }
      return typeof origRemoved === "function"
        ? origRemoved.apply(this, args)
        : undefined;
    };
  }
}

function initExistingNodes() {
  if (!app?.canvas?.graph) return false;
  const nodes = app.canvas.graph._nodes || app.canvas.graph.nodes || [];
  let initialized = false;
  for (const node of nodes) {
    if (!isTargetNode(node) || node.__AUN_mcSetup) continue;
    node.__AUN_loadStabilizing = true;
    setupNode(node);
    try {
      restoreAunWidgetValues(node);
    } catch (_) {}
    try {
      applyCompact(node);
    } catch (_) {}
    scheduleCompactLoadStabilization(node);
    initialized = true;
  }
  return initialized;
}

let __AUN_mcScanTimer = null;

function startStackScanner() {
  if (__AUN_mcScanTimer) return;
  __AUN_mcScanTimer = setInterval(() => {
    try {
      initExistingNodes();
    } catch (_) {}
  }, 2000);
}

// ── Extension ─────────────────────────────────────────────────────────

registerVueExtension({
  name: "AUN.LoraStackWithTriggersModelClip.Vue",

  async setup() {
    initExistingNodes();
    startStackScanner();
    vueRegisterNodeDblClick((node) => {
      if (node.comfyClass === NODE_TYPE) toggleCompactMode(node);
    });
    const cv = app?.canvas?.canvas;
    if (cv && typeof cv.addEventListener === "function") {
      for (const evt of [
        "wheel",
        "mousedown",
        "pointerdown",
        "pointerup",
      ]) {
        cv.addEventListener(evt, () => scheduleCompactRowsUpdate(), {
          passive: true,
        });
      }
    }
    // Drag tracking is handled by the RAF loop, which repositions rows from
    // the node's current DOM rect every frame. A pointer-delta fast path is
    // intentionally NOT used: it shifted rows by raw pointer movement even
    // when the node was stationary (grab on a widget/socket, or a missed
    // pointerup left fastDragNodeId set), permanently detaching the overlays.
    // Hide rows while a node is being dragged (canvas-drawn frontends).
    const canvas = app?.canvas;
    if (canvas && !canvas.__AUN_mcDragMonitorSetup) {
      canvas.__AUN_mcDragMonitorSetup = true;
      const origStart = canvas.onNodeDragStart;
      canvas.onNodeDragStart = function (event, dragged) {
        if (dragged) dragged.__AUN_nodeBeingDragged = true;
        return origStart?.apply(this, arguments);
      };
      const origEnd = canvas.onNodeDragEnd;
      canvas.onNodeDragEnd = function (event) {
        if (canvas.graph?._nodes) {
          for (const n of canvas.graph._nodes) {
            n.__AUN_nodeBeingDragged = false;
          }
        }
        return origEnd?.apply(this, arguments);
      };
    }
    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => scheduleCompactRowsUpdate());
      window.addEventListener("pointermove", (e) => {
        if (reorderDrag && e.buttons === 1) {
          if (
            Math.abs(e.clientX - reorderDrag.startX) +
              Math.abs(e.clientY - reorderDrag.startY) >
            6
          ) {
            reorderDrag.moved = true;
          }
          if (reorderDrag.moved) {
            const t = document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest?.(".aun-lora-compact-row");
            for (const el of document.querySelectorAll(
              ".aun-lora-compact-row.drag-target",
            )) {
              el.classList.remove("drag-target");
            }
            if (t && t !== reorderDrag.row && t.dataset.slotIndex) {
              t.classList.add("drag-target");
            }
          }
        }
      });
      window.addEventListener("pointerup", (e) => {
        if (!reorderDrag) return;
        const drag = reorderDrag;
        reorderDrag = null;
        for (const el of document.querySelectorAll(
          ".aun-lora-compact-row.dragging, .aun-lora-compact-row.drag-target",
        )) {
          el.classList.remove("dragging", "drag-target");
        }
        if (!drag.moved) return;
        const targetEl = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest?.(".aun-lora-compact-row");
        if (!targetEl) return;
        const targetIdx = Number(targetEl.dataset.slotIndex);
        if (Number.isFinite(targetIdx) && targetIdx !== drag.slotIndex) {
          swapWidgetSlots(drag.node, drag.slotIndex, targetIdx);
        }
      });
    }
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;
    if (!nodeType.prototype._AUN_mc_vueDblClickPatched) {
      nodeType.prototype._AUN_mc_vueDblClickPatched = true;
      const orig = nodeType.prototype.onDblClick;
      nodeType.prototype.onDblClick = function (e, pos, canvas) {
        if (pos && pos[1] >= 0) {
          toggleCompactMode(this);
          return true;
        }
        return typeof orig === "function"
          ? orig.apply(this, arguments)
          : false;
      };
    }
    // Re-apply file-sourced values by name after the frontend applies
    // widgets_values positionally. A compact-mode save only serializes the
    // presented widgets, so the positional application (workflow load, or a
    // render-mode switch) lands on the wrong widgets — the by-name stash
    // fixes them. Patched on the prototype so it covers the first
    // configure of freshly loaded nodes.
    if (!nodeType.prototype._AUN_mc_vueConfigurePatched) {
      nodeType.prototype._AUN_mc_vueConfigurePatched = true;
      const origConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function (info) {
        let result;
        try {
          result = origConfigure?.apply(this, arguments);
        } catch (_) {}
        try {
          if (!isCompact(this)) return result;
          restoreAunWidgetValues(this);
          const stash = this.properties?.[COMPACT_VALUES_PROP];
          if (stash && typeof stash === "object") {
            for (const [name, value] of Object.entries(stash)) {
              const w = getWidget(this, name);
              if (w && value !== undefined && w.value !== value) {
                w.value = value;
              }
            }
          }
        } catch (_) {}
        return result;
      };
    }
  },

  getNodeMenuItems(node) {
    if (node?.comfyClass !== NODE_TYPE) return [];
    const compact = isCompact(node);
    return [
      {
        content: compact ? "AUN: Show all controls" : "AUN: Compact mode",
        callback: () => toggleCompactMode(node),
      },
      {
        content: showClipStrengthInCompact(node)
          ? "AUN: Hide clip strength"
          : "AUN: Show clip strength",
        callback: () => toggleCompactClipStrength(node),
      },
      {
        content: showFooter(node) ? "AUN: Hide footer" : "AUN: Show footer",
        callback: () => {
          setShowFooter(node, !showFooter(node));
          updateAutoHeight(node);
          forceFullRedraw(node);
          setTimeout(() => vueTriggerWorkflowCapture(), 50);
        },
      },
    ];
  },

  nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;
    setupNode(node);
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_TYPE) return;
    node.__AUN_loadStabilizing = true;
    setupNode(node);
    try {
      restoreAunWidgetValues(node);
    } catch (_) {}
    try {
      applyCompact(node);
    } catch (_) {}
    scheduleCompactLoadStabilization(node);
  },
});
