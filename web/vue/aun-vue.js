/**
 * Vue frontend helper layer for AUN nodes (Nodes 2.0).
 *
 * Extensions in web/vue/ register through registerVueExtension(), which
 * only activates on the new (Vue) frontend. Helpers here follow the new
 * widget-store rules:
 *  - widget names are unique and never renamed after registration
 *  - per-node extension data lives in node.properties
 *  - widgets are read/written via node.widgets and widget.value
 */

import { app } from "../../../scripts/app.js";
import { isNewFrontend, isVueNodesMode } from "../aun-compat.js";

/**
 * Register a Vue-layer extension (web/vue/*.js).
 *
 * Registered whenever the Vue app shell is present; its hooks no-op while
 * Nodes 2.0 (vueNodesMode) is OFF, so the compat extensions in web/*.js
 * remain in charge there (today's shipped default).
 * @param {object} def - Extension definition (app.registerExtension shape).
 * @returns {object|null} The registered extension, or null on the
 *   litegraph frontend (no Vue app shell).
 */
export function registerVueExtension(def) {
  if (!isNewFrontend()) {
    try {
      console.warn("[AUN] Vue extension skipped (no Vue app shell):", def?.name);
    } catch (_) {}
    return null;
  }
  try {
    console.info("[AUN] Vue extension registered:", def?.name);
  } catch (_) {}
  const GATED = [
    "setup",
    "beforeRegisterNodeDef",
    "nodeCreated",
    "loadedGraphNode",
    "onConfigure",
    "getNodeMenuItems",
  ];
  const wrapped = { ...def };
  for (const h of GATED) {
    const orig = def[h];
    if (typeof orig !== "function") continue;
    wrapped[h] = function (...args) {
      try {
        if (!isVueNodesMode()) {
          if (h === "getNodeMenuItems") return [];
          return undefined;
        }
      } catch (_) {}
      return orig.apply(this, args);
    };
  }
  return app.registerExtension(wrapped);
}

/**
 * Capture the Vue workflow change-tracker state so direct property/widget
 * mutations make it into the autosave snapshot (without this, mutations
 * applied after node creation don't survive F5).
 */
export function vueTriggerWorkflowCapture() {
  try {
    const candidates = [
      document.body,
      document.getElementById("app"),
      document.getElementById("vue-app"),
      document.querySelector("[data-v-app]"),
      app?.canvas?.el,
      app?.canvas?.canvas,
    ].filter(Boolean);
    for (const el of candidates) {
      let target = el;
      for (let i = 0; i < 30 && target; i++) {
        const va = target.__vue_app__;
        if (va) {
          const pinia = va.config?.globalProperties?.$pinia;
          if (pinia?._s) {
            for (const [, store] of pinia._s) {
              const ct = store.activeWorkflow?.changeTracker;
              if (ct && typeof ct.captureCanvasState === "function") {
                ct.captureCanvasState();
                return;
              }
            }
          }
          break;
        }
        target = target.parentElement;
      }
    }
  } catch (_) {}
  try {
    const pinia = window.__pinia;
    if (pinia?._s) {
      for (const [, store] of pinia._s) {
        const ct = store.activeWorkflow?.changeTracker;
        if (ct && typeof ct.captureCanvasState === "function") {
          ct.captureCanvasState();
          return;
        }
      }
    }
  } catch (_) {}
}

// ── Node double-click support ─────────────────────────────────────────
// On the Vue frontend nodes are DOM-rendered: the node container carries a
// `data-node-id` attribute, widget rows carry `node-id`/`node-type`, and
// the title area carries `data-testid=node-title` / `node-header-*`.
// dblclick events DO reach a document-level capture listener, so we
// resolve the node from the DOM instead of canvas hit-testing.

const __AUN_dblclickHandlers = new Set();

function vueNodeFromEvent(e) {
  try {
    const el = e?.target?.closest?.("[data-node-id]");
    if (!el) return null;
    const nodeId = Number(el.getAttribute("data-node-id"));
    if (!Number.isFinite(nodeId)) return null;
    return app?.graph?.getNodeById?.(nodeId) ?? null;
  } catch (_) {
    return null;
  }
}

// Installed once at module load — never depends on extension hook timing.
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener(
    "dblclick",
    (e) => {
      try {
        // Never react to dblclicks inside editable controls.
        if (e.target?.closest?.("input, textarea, select, button, a")) return;
        // Title area dblclick is the frontend's rename gesture.
        if (
          e.target?.closest?.(
            "[data-testid=node-title], [data-testid^=node-header]",
          )
        ) {
          return;
        }
        const node = vueNodeFromEvent(e);
        if (!node) return;
        for (const h of __AUN_dblclickHandlers) {
          try {
            h(node, e);
          } catch (_) {}
        }
      } catch (_) {}
    },
    true,
  );
}

/**
 * Register a handler invoked when a node is double-clicked (below the
 * title area, outside editable controls). Handlers filter by node type
 * themselves. Safe to call multiple times — handlers are deduped by
 * function reference.
 * @param {(node: object, event: MouseEvent) => void} handler
 */
export function vueRegisterNodeDblClick(handler) {
  if (typeof handler === "function") {
    __AUN_dblclickHandlers.add(handler);
  }
}

/**
 * Find a widget on a node by name.
 * @param {object} node - The ComfyUI node.
 * @param {string} name - Widget name.
 * @returns {object|null}
 */
export function vueGetWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

/**
 * Find a widget by any of several possible names.
 * @param {object} node - The ComfyUI node.
 * @param {string[]} names - Candidate names, checked in order.
 * @returns {object|null}
 */
export function vueGetWidgetByNames(node, names) {
  if (!node?.widgets || !names?.length) return null;
  for (const name of names) {
    const w = node.widgets.find((w) => w.name === name);
    if (w) return w;
  }
  return null;
}

/**
 * Set a widget value, firing its callback when the value changed.
 * @param {object} widget - The widget.
 * @param {*} value - New value.
 */
export function vueSetWidgetValue(widget, value) {
  if (!widget) return;
  const prev = widget.value;
  widget.value = value;
  if (prev !== value && typeof widget.callback === "function") {
    try {
      widget.callback.call(widget, value);
    } catch (_) {}
  }
}

/**
 * Read the AUN compact-mode flag from node.properties.
 * @param {object} node - The ComfyUI node.
 * @returns {boolean}
 */
export function vueIsCompact(node) {
  return !!node?.properties?._AUN_compactMode;
}

/**
 * Set the AUN compact-mode flag in node.properties (persisted).
 * @param {object} node - The ComfyUI node.
 * @param {boolean} compact - New state.
 */
export function vueSetCompact(node, compact) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties._AUN_compactMode = !!compact;
}
