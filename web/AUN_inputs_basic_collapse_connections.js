import { app } from "../../scripts/app.js";

const TARGET_CLASSES = new Set([
  "AUNInputsBasic",
  "AUNInputs",
  "AUNInputsRefine",
  "AUNInputsRefineBasic",
  "AUNInputsDiffusers",
  "AUNInputsDiffusersBasic",
  "AUNInputsDiffusersRefineBasic",
  "AUNInputsHybrid",
]);

function setupNode(node) {
  if (!node || !TARGET_CLASSES.has(node.comfyClass)) return;
  if (node.__aun_collapse_hooked) return;

  node.properties = node.properties || {};
  const PK = "collapse_connections";

  const origGetOutputPos = node.getOutputPos.bind(node);
  node.getOutputPos = function (index) {
    if (this.properties?.[PK]) return origGetOutputPos(0);
    return origGetOutputPos(index);
  };

  const origComputeSize = (node.computeSize || (() => node.size)).bind(node);
  node.computeSize = function (out) {
    const s = origComputeSize(out);
    if (this.properties?.[PK]) {
      const n = this.outputs?.length || 0;
      s[1] -= Math.max(0, n - 1) * LiteGraph.NODE_SLOT_HEIGHT;
    }
    return s;
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    if (origDrawFg) origDrawFg.apply(this, arguments);
    const c = !!this.properties?.[PK];
    if (!c) return;
    for (const out of this.outputs || []) {
      if (!out.__aun_collapse_origLabel && out.label && out.label !== " ") {
        out.__aun_collapse_origLabel = out.label;
      }
      out.label = " ";
    }
  };

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);

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

    this.properties[PK] = !this.properties[PK];
    if (!this.properties[PK]) {
      for (const out of this.outputs || []) {
        if (out.__aun_collapse_origLabel != null) {
          out.label = out.__aun_collapse_origLabel;
          delete out.__aun_collapse_origLabel;
        }
      }
    }
    this.setSize([this.size[0], this.computeSize()[1]]);
    this.graph?.setDirtyCanvas(true, true);
  };

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    if (origMenu) origMenu.apply(this, [canvas, options]);
    const on = !!this.properties?.[PK];
    options.push(null, {
      content: on ? "Show Connections" : "Collapse Connections",
      callback: () => {
        this.properties[PK] = !on;
        if (!this.properties[PK]) {
          for (const out of this.outputs || []) {
            if (out.__aun_collapse_origLabel != null) {
              out.label = out.__aun_collapse_origLabel;
              delete out.__aun_collapse_origLabel;
            }
          }
        }
        this.setSize([this.size[0], this.computeSize()[1]]);
        this.graph?.setDirtyCanvas(true, true);
      },
    });
  };

  node.__aun_collapse_hooked = true;

  if (node.properties[PK]) {
    node.setSize([node.size[0], node.computeSize()[1]]);
  }
}

app.registerExtension({
  name: "AUN.InputsBasic.CollapseConnections",
  nodeCreated: (node) => setupNode(node),
  loadedGraphNode: (node) => setupNode(node),
});
