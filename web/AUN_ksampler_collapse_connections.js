import { app } from "../../scripts/app.js";

const TARGET_CLASSES = new Set([
  "AUNKSamplerPlusV2",
  "AUNKSamplerPlusv3",
  "AUNKSamplerPlusv4",
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

  const origGetInputPos = node.getInputPos.bind(node);
  node.getInputPos = function (index) {
    if (this.properties?.[PK]) return origGetInputPos(0);
    return origGetInputPos(index);
  };

  const origComputeSize = (node.computeSize || (() => node.size)).bind(node);
  node.computeSize = function (out) {
    const s = origComputeSize(out);
    if (this.properties?.[PK]) {
      const ni = this.inputs?.filter((i) => !(this.widgets?.length && i.widget)).length || 0;
      const no = this.outputs?.length || 0;
      const rows = Math.max(ni, no);
      s[1] -= Math.max(0, rows - 1) * LiteGraph.NODE_SLOT_HEIGHT;
    }
    return s;
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    if (origDrawFg) origDrawFg.apply(this, arguments);
    const c = !!this.properties?.[PK];
    for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
      if (c) {
        slot.label = " ";
      } else {
        delete slot.label;
      }
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
  name: "AUN.KSampler.CollapseConnections",
  nodeCreated: (node) => setupNode(node),
  loadedGraphNode: (node) => setupNode(node),
});
