/**
 * General-purpose utility functions shared across AUN web extensions.
 */

import { app } from "../../scripts/app.js";

// ── Numeric helpers ───────────────────────────────────────────

/**
 * Clamp a value to [min, max], returning an integer.
 */
export function clamp(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Clamp a value to [min, max], returning a float.
 */
export function clampFloat(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Parse a string as a positive integer. Returns null if invalid.
 */
export function parsePositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── Compact mode helpers ──────────────────────────────────────

/**
 * Check if a node is in compact mode.
 */
export function isCompact(node, propKey = "_AUN_compactMode") {
  return !!node?.properties?.[propKey];
}

/**
 * Set compact mode on a node.
 */
export function setCompact(node, value, propKey = "_AUN_compactMode") {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[propKey] = !!value;
}

/**
 * Check if a node is collapsed.
 */
export function isNodeCollapsed(node) {
  return !!node?.flags?.collapsed;
}

/**
 * Shrink a node left oversized by the pre-fix layout feedback loop (the node
 * grew by one widget row per arrange pass until it was tall enough to swallow
 * the canvas). Only touches absurd heights, so genuine tall nodes are safe.
 *
 * @param {object} node - The node to inspect.
 * @param {number} [threshold] - Heights below this are never touched.
 * @returns {boolean} True when the node was resized.
 */
export function repairOversizedNode(node, threshold = 5000) {
  const height = Number(node?.size?.[1]);
  if (!Number.isFinite(height) || height < threshold) return false;
  try {
    const target = node.computeSize?.()[1];
    if (Number.isFinite(target) && target > 0 && target < height) {
      node.setSize?.([node.size[0], target]);
      node.setDirtyCanvas?.(true, true);
      node.graph?.setDirtyCanvas?.(true, true);
      return true;
    }
  } catch (err) {
    /* a node that cannot compute its size is left as-is */
  }
  return false;
}

/**
 * Position to report for every slot while connection-collapse / compact mode
 * converges them onto a single point.
 *
 * Frontend >= 1.61 derives node layout from slot geometry: `arrange()` takes
 * the bounds of every non-widget input via `getInputPos()`, positions the
 * widgets below that, then writes a widget-backed input slot's `pos` back from
 * `widget.y`. Converging on an arbitrary index (the old `getInputPos(0)`) made
 * the layout read its own output: every pass moved the anchor down by
 * `NODE_SLOT_HEIGHT` and grew the node by one row, without bound.
 *
 * Anchor on a slot whose position never depends on the widget layout instead,
 * and fall back to the constant first-row geometry when no such slot exists.
 *
 * @param {object} node - The node whose slots converge.
 * @param {boolean} isInput - True for inputs, false for outputs.
 * @param {Function} original - The slot getter captured before overriding.
 * @returns {[number, number]} Position in graph coordinates.
 */
export function collapsedSlotPos(node, isInput, original) {
  const slots = (isInput ? node?.inputs : node?.outputs) || [];
  const widgetBacked = (slot) => isInput && !!node?.widgets?.length && !!slot?.widget;

  // A collapsed (title-only) node keeps the frontend's own single-point
  // geometry; convergence does not apply there.
  if (isNodeCollapsed(node)) {
    const litegraph = globalThis.LiteGraph;
    const titleH = litegraph?.NODE_TITLE_HEIGHT ?? 30;
    const width = isInput
      ? 0
      : (node?._collapsed_width ?? litegraph?.NODE_COLLAPSED_WIDTH ?? 80);
    return [(node?.pos?.[0] ?? 0) + width, (node?.pos?.[1] ?? 0) - titleH * 0.5];
  }

  if (typeof original === "function") {
    try {
      const anchor = slots.findIndex(
        (slot) => slot && !slot.pos && !widgetBacked(slot),
      );
      if (anchor >= 0) return original(anchor);
    } catch (err) {
      /* fall through to the constant geometry */
    }
  }

  // No widget-independent slot (or no captured getter): use the default
  // first-row position, which is constant across layout passes.
  const x = isInput ? 10 : Math.max(0, (node?.size?.[0] ?? 0) - 9);
  const y = 14 + (Number(node?.constructor?.slot_start_y) || 0);
  return [(node?.pos?.[0] ?? 0) + x, (node?.pos?.[1] ?? 0) + y];
}

// ── Redraw helpers ────────────────────────────────────────────

/**
 * Force a canvas redraw for a specific node and the global graph.
 */
export function forceRedraw(node, appRef) {
  node?.setDirtyCanvas?.(true, true);
  appRef?.graph?.setDirtyCanvas?.(true, true);
  appRef?.canvas?.setDirty?.(true, true);
}

/**
 * Force a canvas redraw on the global graph only.
 */
export function forceGraphRedraw(appRef) {
  appRef?.graph?.setDirtyCanvas?.(true, true);
  appRef?.canvas?.setDirty?.(true, true);
}

/**
 * Fit a node to its content. The height always follows computeSize();
 * width is only grown, so a node the user widened stays wide. Pass
 * `fitWidth` to take the computed width exactly — a brand-new node should
 * open at its content size in both directions.
 *
 * `node.size` is a typed-array view (Float64Array) in current frontends,
 * not a JS array, so it must not be gated on Array.isArray.
 */
export function fitNodeSize(node, { fitWidth = false } = {}) {
  if (node?.flags?.collapsed) return;
  if (node?.size == null || typeof node.size[1] !== "number") return;
  if (typeof node?.computeSize !== "function") return;

  const width = node.size[0] ?? 0;
  const height = node.size[1] ?? 0;

  let size = null;
  try {
    size = node.computeSize();
  } catch (err) {
    size = null;
  }
  if (!size || typeof size[1] !== "number") return;

  const nextWidth = fitWidth
    ? (size[0] ?? width)
    : Math.max(width, size[0] ?? 0);
  const next = [nextWidth, Math.max(size[1], 0)];
  if (next[0] === width && Math.abs(next[1] - height) < 1) return;

  if (typeof node.setSize === "function") {
    try {
      node.setSize(next);
    } catch (err) {
      /* fall through to the direct write */
    }
  }
  // Some frontends keep the previous height inside setSize. The computed
  // size is the real minimum, so make the assignment stick.
  if (Math.abs((node.size?.[1] ?? 0) - next[1]) > 1) {
    try {
      node.size[1] = next[1];
    } catch (err) {
      /* a read-only size is not ours to force */
    }
  }
  node.setDirtyCanvas?.(true, true);
}

// ── Title matching (used by bypass/mute/collapse-by-title nodes) ──

/**
 * Match a text string against include/exclude search terms.
 * Terms starting with '!' or '-' are exclusions; all others are inclusions.
 * Returns true if no exclusion matches AND at least one inclusion matches
 * (or only exclusions exist and none matched).
 */
export function matchesTarget(text, searchTerms) {
  if (!searchTerms || searchTerms.length === 0) return false;

  const includes = [];
  const excludes = [];

  for (const term of searchTerms) {
    if (term.startsWith("!") || term.startsWith("-")) {
      const t = term.substring(1).trim();
      if (t) excludes.push(t);
    } else {
      includes.push(term);
    }
  }

  const lowerText = text.toLowerCase();

  // Exclusion is a hard no
  if (excludes.some((exc) => lowerText.includes(exc))) {
    return false;
  }

  // At least one inclusion must match
  if (includes.length > 0) {
    return includes.some((inc) => lowerText.includes(inc));
  }

  // Only exclusions and none matched → it's a match
  return excludes.length > 0;
}

// ── Node ID parsing ───────────────────────────────────────────

/**
 * Parse a comma-separated string of node IDs into an array of integers.
 */
export function parseNodeIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))
    return raw.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

// ── Style injection helper ────────────────────────────────────

/**
 * Inject a <style> block into the document head, guarded by a window key.
 * Only injects once per key.
 */
export function injectStyles(windowKey, cssText) {
  if (window[windowKey]) return;
  const style = document.createElement("style");
  style.textContent = cssText;
  document.head.appendChild(style);
  window[windowKey] = style;
}

// ── Collapse-connections: VueNodes label hiding ──────────────────────────
// In VueNodes mode the canvas draw pipeline (including the per-frame
// onDrawForeground slot-label blanking) never runs, so collapsed slot
// labels would render as DOM text. The Vue slot components read
// `slot.label || localized_name || name` directly — the same chain Use
// Everywhere broadcast matching uses — so slot data must keep resolving to
// the real name. Labels are therefore hidden with a stylesheet scoped by
// Vue's `data-node-id` attribute instead of by mutating slot data.
const VUE_LABEL_CSS_ID = "aun-collapse-connections-vue-labels";
const COLLAPSE_PK = "collapse_connections";
// Extra per-node preview keys that need the same VueNodes slot-text hiding
// (they deliberately don't use COLLAPSE_PK so the global collapse system
// ignores them). Kept here — not in the consumer file — so the audit rule
// against local copies of shared logic stays satisfied.
const EXTRA_HIDE_LABEL_PKS = new Set([
  "aun_vhs_preview", // web/AUN_vhs_video_combine_preview.js
]);
let _vueLabelCssText = null;

function _collectCollapseGraphs() {
  const graphs = [];
  const seen = new Set();
  const push = (g) => {
    if (!g || seen.has(g)) return;
    seen.add(g);
    graphs.push(g);
  };
  try {
    push(app?.graph);
    push(app?.canvas?.graph);
    push(app?.canvas?.subgraph);
  } catch (err) {}
  return graphs;
}

// ── Use Everywhere double-click precedence ───────────────────────────────
// UE opens its restrictions dialog on any double-clicked node with
// `properties.ue_convert` set, via a canvas-level `node-double-click`
// listener that runs synchronously AFTER `node.onDblClick` in the same
// task. AUN double-click actions (collapse / compact toggles) take
// precedence: hide the flag around the action and restore it right after
// UE's check has run. Broadcast data (`ue_properties`) is never touched,
// and menu / controller / All Graph paths are unaffected (UE only hooks
// double-click). No-ops (plain call-through) when the flag is absent.
export function withUESuppressed(node, fn) {
  const props = node?.properties;
  if (!props || !props.ue_convert) {
    fn();
    return;
  }
  const saved = props.ue_convert;
  try {
    delete props.ue_convert;
    fn();
  } finally {
    setTimeout(() => {
      try {
        (node.properties ||= {}).ue_convert = saved;
      } catch (err) {}
    }, 0);
  }
}

function _collectCollapsedNodeIds() {
  const ids = new Set();
  const visit = (graph) => {
    if (!graph || !Array.isArray(graph._nodes)) return;
    for (const node of graph._nodes) {
      if (!node) continue;
      if (node.properties?.[COLLAPSE_PK]) ids.add(String(node.id));
      else {
        for (const pk of EXTRA_HIDE_LABEL_PKS) {
          if (node.properties?.[pk]) {
            ids.add(String(node.id));
            break;
          }
        }
      }
      if (node.subgraph) visit(node.subgraph);
    }
  };
  for (const graph of _collectCollapseGraphs()) visit(graph);
  return ids;
}

/**
 * Sync the VueNodes label-hiding stylesheet with live collapse state.
 * Safe to call often; only touches the DOM when membership changes.
 */
export function syncCollapseVueLabels() {
  try {
    const doc = globalThis.document;
    if (!doc) return;
    const ids = _collectCollapsedNodeIds();
    const cssEscape =
      globalThis.CSS?.escape || ((s) => String(s).replace(/["\\]/g, "\\$&"));
    let css = "";
    for (const id of ids) {
      css +=
        `[data-node-id="${cssEscape(id)}"] .text-node-component-slot-text` +
        `{display:none !important;}\n`;
    }
    if (css === _vueLabelCssText) return;
    _vueLabelCssText = css;
    let style = doc.getElementById(VUE_LABEL_CSS_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = VUE_LABEL_CSS_ID;
      doc.head.appendChild(style);
    }
    style.textContent = css;
  } catch (err) {}
}
