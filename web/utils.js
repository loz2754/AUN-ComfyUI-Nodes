/**
 * General-purpose utility functions shared across AUN web extensions.
 */

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
