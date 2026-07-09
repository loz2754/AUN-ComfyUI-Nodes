import { app } from "../../scripts/app.js";

const TARGET_CLASSES = new Set(["AUNSaveImage", "AUNSaveImageV2"]);

const HIDE_WIDGETS = new Set([
  "steps", "cfg", "modelname", "sampler_name", "scheduler",
  "seed_value", "date_format", "sidecar_format",
  "lpw_positive", "lpw_negative", "loras_delimiter",
  "preview", "save_image", "save_sidecar_to_file",
  "path_filename", "filename", "path", "extension",
]);

function setupNode(node) {
  if (!node || !TARGET_CLASSES.has(node.comfyClass)) return;
  if (node.__aun_collapse_hooked) return;

  node.properties = node.properties || {};
  const PK = "collapse_connections";
  const SIZE_KEY = `__${PK}_full_size`;

  function applyWidgetVisibility() {
    const c = !!node.properties?.[PK];
    for (const w of node.widgets || []) {
      if (HIDE_WIDGETS.has(w.name)) {
        w.hidden = c;
        w.options = w.options || {};
        w.options.noDraw = c;
      }
    }
  }

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

  node.computeSize = function (out) {
    const w = out?.[0] ?? this.size[0] ?? 240;
    if (this.properties?.[PK]) {
      const h = this[SIZE_KEY]?.[1] ?? this.size[1] ?? 100;
      return [w, h];
    }
    const orig = this._origComputeSize || (() => this.size);
    return orig(out);
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

  function toggle() {
    const on = !node.properties[PK];
    node.properties[PK] = on;
    if (on) {
      node[SIZE_KEY] = [node.size[0], node.size[1]];
    } else {
      node[SIZE_KEY] = null;
    }
    applyWidgetVisibility();
    node.graph?.setDirtyCanvas(true, true);
  }

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

    toggle.call(this);
  };

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    if (origMenu) origMenu.apply(this, [canvas, options]);
    const on = !!this.properties?.[PK];
    options.push(null, {
      content: on ? "Show Controls" : "Preview Mode",
      callback: () => toggle.call(this),
    });
  };

  node._origComputeSize = node.computeSize || (() => node.size);

  node.__aun_collapse_hooked = true;
  applyWidgetVisibility();

  if (node.properties[PK]) {
    node[SIZE_KEY] = [node.size[0], node.size[1]];
  }
}

app.registerExtension({
  name: "AUN.SaveImage.PreviewMode",
  nodeCreated: (node) => setupNode(node),
  loadedGraphNode: (node) => setupNode(node),
});