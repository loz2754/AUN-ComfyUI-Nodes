import { app } from "../../scripts/app.js";
import { forceGraphRedraw } from "./index.js";

const PK = "collapse_connections";
const SETTING_ID = "AUN.CollapseConnections.Enabled";
const SKIP_SETTING_ID = "AUN.CollapseConnections.SkipClasses";
const USER_HEIGHT_KEY = "__aun_gc_userHeight";

const SKIP_CLASSES = new Set([
  "AUNInputs", "AUNInputsBasic", "AUNInputsRefine", "AUNInputsRefineBasic",
  "AUNInputsDiffusers", "AUNInputsDiffusersBasic", "AUNInputsDiffusersRefineBasic",
  "AUNInputsHybrid",
  "AUNKSamplerPlusV2", "AUNKSamplerPlusv3", "AUNKSamplerPlusv4",
  "AUNSaveImage", "AUNSaveImageV2",
  "AUNShowAnyMulti", "AUNPassthroughAnyMulti",
  "AUNScanAndShowWidgets",
  "AUNImageSliderComparer", "AUNAddToPromptMulti",
  "AUNManualAutoImageSwitch",
  "AUNWildcardAddToPrompt",
  "AUNLoraStackWithTriggers", "AUNLoraStackWithTriggersModelClip", "AUNLoRAsByPromptIndex", "AUNRandomLoraModelOnly", "AUNRandomLoraModelOnlyMulti",
  "AUNMultiGroupUniversal", "AUNMultiUniversal",
  "AUNMultiMuteIndex", "AUNMultiBypassIndex",
  "AUNTextIndexSwitch4", "AUNTextIndexSwitch3", "AUNTextIndexSwitch", "AUNRandomTextIndexSwitch", "AUNRandomTextIndexSwitchV2",
  "AUNCollapseConnectionsController",
]);

let globalDefault = false;
let userSkipClasses = new Set();

function isWidgetLinked(node, slot) {
  return !!(node.widgets?.length && slot.widget);
}

function shouldSkip(node) {
  return SKIP_CLASSES.has(node.comfyClass) || userSkipClasses.has(node.comfyClass);
}

export function isConnectionCollapsed(node) {
  return typeof node.properties?.[PK] === "boolean" ? node.properties[PK] : false;
}

function applyCollapseState(node) {
  if (!node || !node.__aun_global_collapse_hooked) return;

  const origGetOutputPos = node.__aun_gc_origGetOutputPos;
  const origGetInputPos = node.__aun_gc_origGetInputPos;
  const origComputeSize = node.__aun_gc_origComputeSize;
  const origDrawFg = node.__aun_gc_origDrawFg;

  if (!globalDefault) {
    // Feature is off – restore original functions so the node behaves as
    // though this extension never touched it.
    node.getOutputPos = origGetOutputPos;
    node.getInputPos = origGetInputPos;
    node.computeSize = origComputeSize;
    node.onDrawForeground = origDrawFg;
    return;
  }

  node.getOutputPos = function (index) {
    return isConnectionCollapsed(this) ? origGetOutputPos(0) : origGetOutputPos(index);
  };

  node.getInputPos = function (index) {
    return isConnectionCollapsed(this) ? origGetInputPos(0) : origGetInputPos(index);
  };

  node.computeSize = function (out) {
    const s = origComputeSize(out);
    if (isConnectionCollapsed(this)) {
      const ni = this.inputs?.filter((i) => !isWidgetLinked(this, i)).length || 0;
      const no = this.outputs?.length || 0;
      const rows = Math.max(ni, no);
      const collapsedH = s[1] - Math.max(0, rows - 1) * LiteGraph.NODE_SLOT_HEIGHT;
      const userH = this.properties?.[USER_HEIGHT_KEY];
      s[1] = Math.max(collapsedH, userH || 0);
    }
    return s;
  };

  node.onDrawForeground = function (ctx) {
    if (origDrawFg) origDrawFg.apply(this, arguments);
    const c = isConnectionCollapsed(this);
    for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
      if (isWidgetLinked(this, slot)) continue;
      if (!c) {
        if ('__aun_gc_origLabel' in slot) {
          delete slot.label;
          delete slot.__aun_gc_origLabel;
        }
        if ('__aun_collapse_origLabel' in slot) {
          delete slot.label;
          delete slot.__aun_collapse_origLabel;
        }
        if (slot.label === " ") {
          delete slot.label;
        }
        continue;
      }
      if (!('__aun_gc_origLabel' in slot)) {
        slot.__aun_gc_origLabel = slot.label;
      }
      slot.label = " ";
    }
  };
}

function applyNodeCollapse(node, goingToCollapse) {
  if (!node) return;
  node.properties = node.properties || {};

  if (goingToCollapse && !isConnectionCollapsed(node)) {
    node.properties[USER_HEIGHT_KEY] = node.size[1];
  }

  node.properties[PK] = goingToCollapse;
  applyCollapseState(node);

  if (goingToCollapse) {
    const h = node.computeSize()[1];
    node.setSize([node.size[0], h]);
  } else {
    // Restore slot labels that were hidden during collapse.
    for (const slot of [...(node.inputs || []), ...(node.outputs || [])]) {
      if (isWidgetLinked(node, slot)) continue;
      if ('__aun_gc_origLabel' in slot) {
        delete slot.label;
        delete slot.__aun_gc_origLabel;
      }
      if ('__aun_collapse_origLabel' in slot) {
        delete slot.label;
        delete slot.__aun_collapse_origLabel;
      }
      if (slot.label === " ") {
        delete slot.label;
      }
    }
    const expandedH = node.properties[USER_HEIGHT_KEY] || node.computeSize()[1];
    node.setSize([node.size[0], expandedH]);
    delete node.properties[USER_HEIGHT_KEY];
  }
  node.graph?.setDirtyCanvas(true, true);
}

function toggleNodeCollapse(node) {
  if (!node) return;
  applyNodeCollapse(node, !isConnectionCollapsed(node));
}

// Programmatically collapse/expand a single node's connections. Used by the
// AUNCollapseConnectionsController node; the caller gates on globalDefault.
export function setNodeCollapseConnections(node, collapse) {
  if (!node) return;
  // User skip-list always wins – those nodes must never be touched.
  if (userSkipClasses.has(node.comfyClass)) return;

  const next = !!collapse;
  if (isConnectionCollapsed(node) === next) return;

  if (SKIP_CLASSES.has(node.comfyClass)) {
    // AUN nodes ship their own collapse-connections renderer that reads
    // properties[PK] live. Prefer a per-node hook that mirrors the node's own
    // toggle (each node decides whether/how to resize); never force a size here,
    // or user-set node sizing gets clobbered (e.g. AUNSaveImageV2, AUNShowAnyMulti).
    if (typeof node.__aun_remoteCollapse === "function") {
      node.__aun_remoteCollapse(next);
      return;
    }
    node.properties = node.properties || {};
    node.properties[PK] = next;
    node.graph?.setDirtyCanvas(true, true);
    return;
  }

  if (!node.__aun_global_collapse_hooked) hookNode(node);
  applyNodeCollapse(node, next);
}

// Resolve a controller node's targets against the live graph is handled by the
// AUNCollapseConnectionsController web extension (AUN_collapse_connections_controller.js),
// which resolves targets itself and calls setNodeCollapseConnections per node.

function hookNode(node) {
  if (!node || node.__aun_global_collapse_hooked) return;
  if (!globalDefault) return;
  if (shouldSkip(node)) return;

  node.properties = node.properties || {};

  node.__aun_gc_origGetOutputPos = node.getOutputPos.bind(node);
  node.__aun_gc_origGetInputPos = node.getInputPos.bind(node);
  node.__aun_gc_origComputeSize = (node.computeSize || (() => node.size)).bind(node);
  node.__aun_gc_origDrawFg = node.onDrawForeground;

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);
    if (!globalDefault) return;
    if (shouldSkip(this)) return;

    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
    if (app?.canvas?.interacting_widget || app?.canvas?.active_widget) return;

    const el = document.activeElement;
    if (
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.classList?.contains("litegraph") ||
        el.id?.includes("widget"))
    )
      return;

    toggleNodeCollapse(this);
  };

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    if (origMenu) origMenu.apply(this, [canvas, options]);
    if (!globalDefault) return;
    if (shouldSkip(this)) return;
    const on = isConnectionCollapsed(this);
    options.push(null, {
      content: on ? "Show Connections" : "Collapse Connections",
      callback: () => toggleNodeCollapse(this),
    });
  };

  const origConfigure = node.onConfigure;
  node.onConfigure = function () {
    origConfigure?.apply(this, arguments);
    applyCollapseState(this);
    if (isConnectionCollapsed(this)) {
      const h = this.computeSize()[1];
      this.setSize([this.size[0], h]);
    }
  };

  node.__aun_global_collapse_hooked = true;
}

function cleanupAllNodes(graph) {
  if (!graph?._nodes) return;
  for (const node of graph._nodes) {
    if (!node.__aun_global_collapse_hooked) continue;
    if (node.properties?.[USER_HEIGHT_KEY] != null) {
      const h = node.properties[USER_HEIGHT_KEY] || node.computeSize()[1];
      node.setSize([node.size[0], h]);
      delete node.properties[USER_HEIGHT_KEY];
    }
    if (node.properties?.[PK]) {
      node.properties[PK] = false;
      applyCollapseState(node);
    }
    // Restore slot labels before restoring original onDrawForeground.
    for (const slot of [...(node.inputs || []), ...(node.outputs || [])]) {
      if (isWidgetLinked(node, slot)) continue;
      if ('__aun_gc_origLabel' in slot) {
        delete slot.label;
        delete slot.__aun_gc_origLabel;
      }
      if ('__aun_collapse_origLabel' in slot) {
        delete slot.label;
        delete slot.__aun_collapse_origLabel;
      }
      if (slot.label === " ") {
        delete slot.label;
      }
    }
    // Restore original functions so the node behaves as though this
    // extension never touched it.
    if (node.__aun_gc_origGetOutputPos) node.getOutputPos = node.__aun_gc_origGetOutputPos;
    if (node.__aun_gc_origGetInputPos) node.getInputPos = node.__aun_gc_origGetInputPos;
    if (node.__aun_gc_origComputeSize) node.computeSize = node.__aun_gc_origComputeSize;
    if (node.__aun_gc_origDrawFg != null) node.onDrawForeground = node.__aun_gc_origDrawFg;
  }
  forceGraphRedraw(app);
}

// Read-only accessor for other extensions (e.g. the controller node overlay).
export function isGlobalCollapseEnabled() {
  return globalDefault;
}

app.registerExtension({
  name: "AUN.GlobalCollapseConnections",
  nodeCreated: (node) => hookNode(node),
  loadedGraphNode: (node) => hookNode(node),
  async setup() {
    const skipSetting = app.ui.settings.addSetting({
      id: SKIP_SETTING_ID,
      name: "Collapse connections: extra node classes to skip",
      tooltip:
        "Comma-separated node class names to exclude from collapse connections (e.g. MyCustomNode, AnotherNode).",
      type: (name, setter, value) => {
        const el = document.createElement("textarea");
        el.value = value || "";
        el.rows = 4;
        el.style.width = "100%";
        el.placeholder = "e.g. MyCustomNode, AnotherNode";
        el.addEventListener("change", () => setter(el.value));
        return el;
      },
      defaultValue: "",
      onChange: (value) => {
        userSkipClasses = new Set(
          (value || "").split(",").map((s) => s.trim()).filter(Boolean)
        );
      },
    });
    userSkipClasses = new Set(
      (skipSetting.value || "").split(",").map((s) => s.trim()).filter(Boolean)
    );

    app.ui.settings.addSetting({
      id: SETTING_ID,
      name: "⚠ EXPERIMENTAL — Global collapse connections (compact socket lines)",
      tooltip:
        "EXPERIMENTAL: May cause issues with core ComfyUI nodes or other custom node packs. " +
        "Enables double-click or right-click to collapse socket lines on non-AUN nodes. " +
        "AUN nodes with their own Collapse Connections or Compact Mode are unaffected. " +
        "If you experience unexpected behaviour, disable this setting immediately.",
      type: "boolean",
      defaultValue: false,
      onChange: (value) => {
        globalDefault = !!value;
        if (globalDefault) {
          // Feature just enabled – hook every existing node that hasn't been
          // hooked yet so nodes created while the setting was off get covered.
          if (app.graph?._nodes) {
            for (const node of app.graph._nodes) {
              hookNode(node);
              applyCollapseState(node);
            }
          }
        } else {
          cleanupAllNodes(app.graph);
        }
      },
    });
  },
});
