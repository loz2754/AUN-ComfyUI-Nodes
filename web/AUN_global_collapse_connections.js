import { app } from "../../scripts/app.js";
import { forceGraphRedraw } from "./index.js";

const PK = "collapse_connections";
const SETTING_ID = "AUN.CollapseConnections.Enabled";
const USER_HEIGHT_KEY = "__aun_gc_userHeight";

let globalDefault = false;

function isWidgetLinked(node, slot) {
  return !!(node.widgets?.length && slot.widget);
}

function shouldSkip(node) {
  return (
    node.__aun_collapse_hooked ||
    node.__aun_cmp_collapse_hooked ||
    node.__aun_collapse_setup_done ||
    node.__AUN_compactInit ||
    node.__AUN_stackInit ||
    node.comfyClass === "AUNShowAnyMulti" ||
    node.comfyClass === "AUNPassthroughAnyMulti" ||
    node.comfyClass === "AUNImageSliderComparer" ||
    node.comfyClass === "AUNAddToPromptMulti"
  );
}

function isCollapsed(node) {
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
    return isCollapsed(this) ? origGetOutputPos(0) : origGetOutputPos(index);
  };

  node.getInputPos = function (index) {
    return isCollapsed(this) ? origGetInputPos(0) : origGetInputPos(index);
  };

  node.computeSize = function (out) {
    const s = origComputeSize(out);
    if (isCollapsed(this)) {
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
    const c = isCollapsed(this);
    if (!c) return;
    for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
      if (isWidgetLinked(this, slot)) continue;
      // Save original label before hiding, then set to space.
      if (!slot.__aun_gc_origLabel && slot.label && slot.label !== " ") {
        slot.__aun_gc_origLabel = slot.label;
      }
      slot.label = " ";
    }
  };
}

function toggleNodeCollapse(node) {
  if (!node) return;
  node.properties = node.properties || {};
  const goingToCollapse = !isCollapsed(node);

  if (goingToCollapse) {
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
      if (slot.__aun_gc_origLabel != null) {
        slot.label = slot.__aun_gc_origLabel;
        delete slot.__aun_gc_origLabel;
      }
    }
    const expandedH = node.properties[USER_HEIGHT_KEY] || node.computeSize()[1];
    node.setSize([node.size[0], expandedH]);
    delete node.properties[USER_HEIGHT_KEY];
  }
  node.graph?.setDirtyCanvas(true, true);
}

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
    const on = isCollapsed(this);
    options.push(null, {
      content: on ? "Show Connections" : "Collapse Connections",
      callback: () => toggleNodeCollapse(this),
    });
  };

  const origConfigure = node.onConfigure;
  node.onConfigure = function () {
    origConfigure?.apply(this, arguments);
    applyCollapseState(this);
    if (isCollapsed(this)) {
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
    // Restore original functions so the node behaves as though this
    // extension never touched it.
    if (node.__aun_gc_origGetOutputPos) node.getOutputPos = node.__aun_gc_origGetOutputPos;
    if (node.__aun_gc_origGetInputPos) node.getInputPos = node.__aun_gc_origGetInputPos;
    if (node.__aun_gc_origComputeSize) node.computeSize = node.__aun_gc_origComputeSize;
    if (node.__aun_gc_origDrawFg != null) node.onDrawForeground = node.__aun_gc_origDrawFg;
  }
  forceGraphRedraw(app);
}

app.registerExtension({
  name: "AUN.GlobalCollapseConnections",
  nodeCreated: (node) => hookNode(node),
  loadedGraphNode: (node) => hookNode(node),
  async setup() {
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
