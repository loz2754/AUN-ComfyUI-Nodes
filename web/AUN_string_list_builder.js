import { app } from "../../scripts/app.js";
import { getWidget, applyWidgetHiddenState } from "./widgets.js";

const NODE_CLASS = "AUNStringListBuilder";
const MAX_INPUTS = 20;
const TITLE_H = 30;
const MIN_NODE_H = 80;
// Breathing room between string widgets (added to layout slot only,
// not to the textarea itself).
const WIDGET_GAP = 8;

function clampInputs(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 1 : Math.max(1, Math.min(MAX_INPUTS, n));
}

function getVisibleStringWidgets(node) {
  const numInputs = clampInputs(getWidget(node, "num_inputs")?.value ?? 1);
  const out = [];
  for (let i = 1; i <= numInputs; i++) {
    const w = getWidget(node, `string_${i}`);
    if (w) out.push(w);
  }
  return out;
}

function ensureStretchable(widget, node) {
  if (!widget || widget.__aun_stretchable) return;
  widget.__aun_stretchable = true;
  const inner = widget.computeSize;
  widget.computeSize = function (...args) {
    let [w, h] = inner
      ? inner.apply(this, args)
      : [args[0] ?? 200, this.comfyHeight ?? 100];
    if (!this.hidden && this.__AUN_visible !== false) {
      h += WIDGET_GAP;
      const per = node.__aun_stretchPerWidget || 0;
      if (per > 0) {
        h += per;
      }
    }
    return [w, h];
  };
}

function clearStretchStyles(node) {
  node.__aun_stretchPerWidget = 0;
  for (let i = 1; i <= MAX_INPUTS; i++) {
    const w = getWidget(node, `string_${i}`);
    try {
      if (w?.inputEl?.style) {
        w.inputEl.style.height = "";
        w.inputEl.style.minHeight = "80px";
      }
    } catch {}
  }
}

function applyStretchForSize(node, baseH) {
  const visible = getVisibleStringWidgets(node).filter((w) => !w.hidden);
  if (!visible.length) {
    node.__aun_stretchPerWidget = 0;
    return;
  }
  const extra = node.size[1] - baseH;
  const per = extra > 0 ? extra / visible.length : 0;
  node.__aun_stretchPerWidget = per;
  if (per <= 0) return;
  for (const w of visible) {
    try {
      const [, wh] = w.computeSize(node.size[0]);
      // Slot height includes WIDGET_GAP; the textarea itself excludes it.
      const taH = Math.max(wh - WIDGET_GAP, 40);
      if (w.inputEl?.style) {
        w.inputEl.style.height = `${taH}px`;
        w.inputEl.style.minHeight = `${taH}px`;
      }
    } catch {}
  }
  node.widgets_dirty = true;
}

function updateNodeVisibility(node, preserveExtra = false) {
  const numInputs = clampInputs(getWidget(node, "num_inputs")?.value ?? 1);

  for (let i = 1; i <= MAX_INPUTS; i++) {
    const w = getWidget(node, `string_${i}`);
    applyWidgetHiddenState(w, i > numInputs);
    if (w) ensureStretchable(w, node);
  }

  // Reset stretch to measure the true base height. Manual extra height is
  // only preserved on graph load; a num_inputs change always refits so the
  // node auto-resizes to the new visible count.
  const prevH = node.size?.[1] ?? 0;
  clearStretchStyles(node);
  node.widgets_dirty = true;
  const [, ch] = node.computeSize();
  const baseH = Math.max(ch, MIN_NODE_H);
  if (preserveExtra && prevH > baseH + 1) {
    node.setSize([node.size[0], prevH]);
    applyStretchForSize(node, baseH);
  } else {
    node.setSize([node.size[0], baseH]);
  }
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
    // Report the base (unstretched) height: LiteGraph clamps manual resize
    // to computeSize(), so including stretch here would block downsizing.
    const saved = this.__aun_stretchPerWidget || 0;
    this.__aun_stretchPerWidget = 0;
    let w, h;
    try {
      [w, h] = origComputeSize ? origComputeSize.apply(this, arguments) : [this.size?.[0] ?? 300, MIN_NODE_H];
    } finally {
      this.__aun_stretchPerWidget = saved;
    }
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
    updateNodeVisibility(this, true);
  };

  const origResize = node.onResize;
  node.onResize = function (sz) {
    const result = origResize?.apply(this, arguments);
    if (node.__aun_adjusting) return result;
    try {
      node.__aun_adjusting = true;
      // node.computeSize() is base-only (stretch excluded), so the user can
      // always shrink back down; extra space is redistributed equally.
      let baseH = MIN_NODE_H;
      try {
        const [, ch] = node.computeSize();
        baseH = Math.max(ch, MIN_NODE_H);
      } catch {}
      if (node.size[1] < baseH) {
        node.setSize([node.size[0], baseH]);
        clearStretchStyles(node);
      } else {
        applyStretchForSize(node, baseH);
      }
      node.setDirtyCanvas(true, true);
    } catch {} finally {
      node.__aun_adjusting = false;
    }
    return result;
  };

  const origRemoved = node.onRemoved;
  node.onRemoved = function () {
    delete node.__aun_patched;
    delete node.__aun_stretchPerWidget;
    delete node.__aun_adjusting;
    origRemoved?.apply(this, arguments);
  };

  updateNodeVisibility(node, true);
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
