/**
 * Frontend compatibility shim for AUN nodes.
 *
 * Two render modes matter on modern ComfyUI frontends:
 *   - Nodes 2.0 OFF ("compat mode"): canvas-drawn nodes; the compat
 *     extensions in web/*.js work perfectly. This is what ships today.
 *   - Nodes 2.0 ON (vueNodesMode): DOM-rendered nodes; compat extensions
 *     break, and the Vue layer in web/vue/ takes over.
 *
 * isNewFrontend() detects the Vue app shell (present in BOTH modes).
 * isVueNodesMode() detects the actual node render mode — the gate that
 * decides which layer runs.
 */

import { app } from "../../scripts/app.js";

const SIGNALS = {
  comfyAPI: false,
  extSetting: false,
  sidebarTab: false,
  dom: false,
};

let __AUN_firstDetection = true;

function checkSignals() {
  const w = globalThis;
  const c = w.comfy;
  SIGNALS.comfyAPI = !!(c && c.comfyAPI && typeof c.comfyAPI === "object");
  const em = w.app?.extensionManager;
  SIGNALS.extSetting = typeof em?.setting?.get === "function";
  SIGNALS.sidebarTab = typeof em?.registerSidebarTab === "function";
  try {
    SIGNALS.dom = !!(
      document?.getElementById?.("vue-app") ||
      document?.querySelector?.("[data-v-app]")
    );
  } catch (_) {
    SIGNALS.dom = false;
  }
}

function logDetection(newFrontend) {
  if (!__AUN_firstDetection) return;
  __AUN_firstDetection = false;
  try {
    console.info("[AUN] frontend detection:", {
      newFrontend,
      ...SIGNALS,
      appVersion: app?.version ?? null,
      frontendVersion:
        globalThis.comfyFrontendVersion ?? app?.frontendVersion ?? null,
    });
  } catch (_) {}
  // Mode signals need the mounted DOM — log them after mount.
  try {
    setTimeout(() => {
      const lsKeys = [];
      const globalKeys = [];
      try {
        for (const k of Object.keys(localStorage ?? {})) {
          if (/node|display|render|mode|2\.0|nodes/i.test(k) && lsKeys.length < 40) {
            lsKeys.push(k);
          }
        }
        for (const k of Object.keys(globalThis)) {
          if (
            /frontend.*version|version.*frontend|vueNode|nodes2/i.test(k) &&
            globalKeys.length < 20
          ) {
            globalKeys.push(k);
          }
        }
      } catch (_) {}
      console.info("[AUN] mode detection:", {
        nodes2Setting: (() => {
          try {
            return app?.ui?.settings?.getSettingValue?.(
              "Comfy.VueNodes.Enabled",
              null,
            );
          } catch (_) {
            return null;
          }
        })(),
        vueNodesDOM: !!document?.querySelector?.("[data-node-id]"),
        lgNodeDOM: !!document?.querySelector?.(".lg-node"),
        canvasDrawn: !!document?.querySelector?.("canvas"),
        comfyFrontendVersion: globalThis.comfyFrontendVersion ?? null,
        appFrontendVersion: app?.frontendVersion ?? null,
        localStorageCandidates: lsKeys,
        globalCandidates: globalKeys,
      });
    }, 1500);
  } catch (_) {}
}

/**
 * True when the Vue app shell is present (both render modes).
 * @returns {boolean}
 */
export function isNewFrontend() {
  checkSignals();
  const result =
    SIGNALS.comfyAPI || SIGNALS.extSetting || SIGNALS.sidebarTab || SIGNALS.dom;
  logDetection(result);
  return result;
}

// ── Nodes 2.0 (vueNodesMode) detection ─────────────────────────────────

let __AUN_vueNodes = null; // null = unknown; only positive DOM probes are cached

/**
 * True when Nodes 2.0 (vueNodesMode) is active — DOM-rendered nodes.
 *
 * Authoritative source: the "Nodes 2.0" toggle setting (server-persisted),
 * read through the legacy settings shim which exists on both frontends.
 * The setting is re-read on every call — never cached — so a mid-session
 * mode switch takes effect for subsequent hook invocations.
 *
 * Fallback: a DOM probe for `[data-node-id]` node containers. Negative
 * probe results are NOT cached (nodes may simply not be mounted yet, e.g.
 * during workflow load); positive results are cached.
 *
 * Manual overrides for testing: window.__AUN_FORCE_VUE_LAYER = true,
 * window.__AUN_FORCE_COMPAT = true.
 * @returns {boolean}
 */
export function isVueNodesMode() {
  if (globalThis.__AUN_FORCE_VUE_LAYER) {
    __AUN_vueNodes = true;
    return true;
  }
  if (globalThis.__AUN_FORCE_COMPAT) {
    __AUN_vueNodes = false;
    return false;
  }

  // Re-read the toggle setting on every call — a mid-session mode switch
  // must take effect without a reload.
  for (const id of ["Comfy.VueNodes.Enabled", "Comfy.VueNodes"]) {
    try {
      const v = app?.ui?.settings?.getSettingValue?.(id, undefined);
      if (v === true) {
        __AUN_vueNodes = true;
        return true;
      }
      if (v === false) {
        __AUN_vueNodes = false;
        return false;
      }
    } catch (_) {}
  }

  // Cached positive from an earlier DOM probe.
  if (__AUN_vueNodes === true) return true;

  // DOM probe — not cached when negative.
  try {
    if (document?.querySelector?.("[data-node-id]")) {
      __AUN_vueNodes = true;
      return true;
    }
  } catch (_) {}
  return false;
}

// ── Extension registration gates ───────────────────────────────────────

const GATED_HOOKS = [
  "setup",
  "init",
  "addCustomNodeDefs",
  "getCustomWidgets",
  "beforeRegisterNodeDef",
  "nodeCreated",
  "loadedGraphNode",
  "onConfigure",
  "beforeConfigureGraph",
  "afterConfigureGraph",
  "getNodeMenuItems",
  "getExtraMenuOptions",
  "getSelectionToolboxCommands",
  "getCanvasMenuItems",
  "beforeRegisterVueAppNodeDefs",
  "registerCustomNodes",
];

function wrapHooks(def, activeCheck, hookName) {
  const wrapped = { ...def };
  for (const h of GATED_HOOKS) {
    const orig = def[h];
    if (typeof orig !== "function") continue;
    wrapped[h] = function (...args) {
      try {
        if (!activeCheck()) {
          if (h === "getNodeMenuItems") return [];
          return undefined;
        }
      } catch (_) {}
      return orig.apply(this, args);
    };
  }
  return wrapped;
}

/**
 * Register a compat (web/*.js) extension.
 *
 * The extension is always registered (the render mode is not reliably
 * known at import time). When `skipOnVue` is true its hooks no-op while
 * Nodes 2.0 (vueNodesMode) is active, letting the Vue layer take over.
 * @param {object} def - Extension definition passed to app.registerExtension.
 * @param {boolean} [skipOnVue=false] - True when a Vue-layer replacement
 *   exists for this extension.
 * @returns {object} The registered extension.
 */
export function registerLegacyExtension(def, skipOnVue = false) {
  if (skipOnVue) {
    return app.registerExtension(wrapHooks(def, () => !isVueNodesMode(), "legacy"));
  }
  return app.registerExtension(def);
}
