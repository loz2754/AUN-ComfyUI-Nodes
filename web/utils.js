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

function _collectCollapsedNodeIds() {
  const ids = new Set();
  const visit = (graph) => {
    if (!graph || !Array.isArray(graph._nodes)) return;
    for (const node of graph._nodes) {
      if (!node) continue;
      if (node.properties?.[COLLAPSE_PK]) ids.add(String(node.id));
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
