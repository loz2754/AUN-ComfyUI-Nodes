/**
 * Shared constants used across AUN web extensions.
 * Single source of truth for magic numbers and property keys.
 */

// ── Node mode values (LiteGraph) ──────────────────────────────
export const NODE_MODE = {
  ACTIVE: globalThis.LiteGraph?.ALWAYS ?? 0,
  MUTED: globalThis.LiteGraph?.NEVER ?? 2,
  BYPASSED: 4,
};

// ── Compact mode property keys ────────────────────────────────
export const PROP = {
  COMPACT_MODE: "_AUN_compactMode",
  SHOW_CLIP_STRENGTH: "_AUN_showClipStrength",
  SHOW_CLIP_STRENGTH_IN_COMPACT: "_AUN_showClipStrengthInCompact",
  SHOW_FOOTER: "_AUN_showFooter",
  SHOW_LORA_INFO: "_AUN_showLoraInfo",
  COMPACT_LEVEL: "_AUN_compactLevel",
};

// ── Common limits ─────────────────────────────────────────────
export const MAX_SLOTS = 10;
export const MAX_INPUTS = 20;
export const MIN_INPUTS = 2;
