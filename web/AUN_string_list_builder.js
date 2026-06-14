import { app } from "../../scripts/app.js";
import { getWidget, applyWidgetHiddenState } from "./widgets.js";

const NODE_CLASS = "AUNStringListBuilder";
const MAX_INPUTS = 20;
const TITLE_H = 30;
const MIN_NODE_H = 80;

function clampInputs(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 1 : Math.max(1, Math.min(MAX_INPUTS, n));
}

function updateNodeVisibility(node) {
  const numInputs = clampInputs(getWidget(node, "num_inputs")?.value ?? 1);

  for (let i = 1; i <= MAX_INPUTS; i++) {
    applyWidgetHiddenState(getWidget(node, `string_${i}`), i > numInputs);
  }

  node.widgets_dirty = true;
  const [, ch] = node.computeSize();
  node.setSize([node.size[0], ch]);
  node.setDirtyCanvas(true, true);
}

function patchNode(node) {
  if (node.__aun_patched) return;
  node.__aun_patched = true;

  for (const w of node.widgets || []) {
    w.__AUN_visible = true;
  }

  const origComputeSize = node.computeSize;
  node.computeSize = function () {
    let [w, h] = origComputeSize ? origComputeSize.apply(this, arguments) : [this.size?.[0] ?? 300, MIN_NODE_H];
    h = Math.max(h, MIN_NODE_H);
    return [w, h];
  };

  const numInputsW = getWidget(node, "num_inputs");
  if (numInputsW) {
    const origCb = numInputsW.callback;
    numInputsW.callback = function (value) {
      const result = origCb?.apply(this, arguments);
      updateNodeVisibility(node);
      return result;
    };
  }

  const origConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    origConfigure?.apply(this, arguments);
    updateNodeVisibility(this);
  };

  const origRemoved = node.onRemoved;
  node.onRemoved = function () {
    delete node.__aun_patched;
    origRemoved?.apply(this, arguments);
  };

  updateNodeVisibility(node);
}

app.registerExtension({
  name: "AUN.StringListBuilder.Inputs",
  async nodeCreated(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    patchNode(node);
  },
  async loadedGraphNode(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    patchNode(node);
  },
});
