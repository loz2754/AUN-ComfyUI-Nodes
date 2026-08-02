import { app } from "../../scripts/app.js";
import { applyWidgetHiddenState } from "./widgets.js";

const TARGET_CLASSES = new Set(["AUNSaveImage", "AUNSaveImageV2"]);

const PK = "collapse_connections";

const HIDE_WIDGETS = new Set([
  "steps", "cfg", "modelname", "sampler_name", "scheduler",
  "seed_value", "date_format", "sidecar_format",
  "lpw_positive", "lpw_negative", "loras_delimiter",
  "preview", "save_image", "save_sidecar_to_file",
  "path_filename", "filename", "path", "extension",
]);

function applyWidgetVisibility(node) {
  if (!node?.widgets) return;
  const c = !!node.properties?.[PK];
  for (const w of node.widgets) {
    if (HIDE_WIDGETS.has(w.name)) {
      applyWidgetHiddenState(w, c);
    }
  }
}

function toggle(node) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PK] = !node.properties[PK];
  applyWidgetVisibility(node);
  node.graph?.setDirtyCanvas(true, true);
}

function setupNode(node) {
  if (!node || !TARGET_CLASSES.has(node.comfyClass)) return;

  if (!node.__aun_collapse_hooked) {
    node.properties = node.properties || {};

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

    const origComputeSize = node.computeSize.bind(node);
    node.computeSize = function (out) {
      if (this.properties?.[PK]) {
        return [out?.[0] ?? 240, 100];
      }
      const s = origComputeSize(out);
      return [s[0], 100];
    };

    const origDrawFg = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
      if (origDrawFg) origDrawFg.apply(this, arguments);
      const c = !!this.properties?.[PK];
      for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
        if (this.widgets?.length && slot.widget) continue;
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

      toggle(this);
    };

    const origMenu = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (canvas, options) {
      if (origMenu) origMenu.apply(this, [canvas, options]);
      const on = !!this.properties?.[PK];
      options.push(null, {
        content: on ? "Show Controls" : "Preview Mode",
        callback: () => toggle(this),
      });
    };

    node.__aun_collapse_hooked = true;
  }

  // Re-apply on every load: nodeCreated fires before properties are restored
  // from the workflow JSON, so the post-configure pass is what actually hides
  // the widgets.
  applyWidgetVisibility(node);

  // On F5 / tab switch the graph is re-configured; re-apply once it finishes.
  if (!node.__aun_cfg_hooked) {
    node.__aun_cfg_hooked = true;
    const origConfigure = node.onConfigure;
    node.onConfigure = function () {
      origConfigure?.apply(this, arguments);
      applyWidgetVisibility(this);
    };
  }
}

app.registerExtension({
  name: "AUN.SaveImage.PreviewMode",
  nodeCreated: (node) => setupNode(node),
  loadedGraphNode: (node) => setupNode(node),
});
