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

function refreshWeight(w) {
  try {
    const el = w?.inputEl;
    if (el) {
      const prev = el.style.height;
      el.style.height = "auto";
      const sh = el.scrollHeight || 0;
      el.style.height = prev;
      if (sh > 0) {
        if (w) w.__aun_weight = sh;
        return sh;
      }
    }
  } catch {}
  const fb = Math.max(1, String(w?.value ?? "").split("\n").length) * 20;
  if (w) w.__aun_weight = fb;
  return fb;
}

function cachedWeight(w) {
  if (w?.__aun_weight) return w.__aun_weight;
  return refreshWeight(w);
}

const MIN_TEXTAREA_H = 40; // ~2 lines of text

function ensureStretchable(widget, node) {
  if (!widget || widget.__aun_stretchable) return;
  widget.__aun_stretchable = true;
  widget.__aun_stretchExtra = 0;
  const inner = widget.computeSize;
  widget.computeSize = function (...args) {
    if (this.hidden) return [args[0] ?? 200, 0];
    let [w, h] = inner
      ? inner.apply(this, args)
      : [args[0] ?? 200, this.comfyHeight ?? MIN_TEXTAREA_H];
    if (this.__AUN_visible === false) return [w, 0];
    h = Math.max(h, MIN_TEXTAREA_H);
    h += WIDGET_GAP;
    const extra = this.__aun_stretchExtra || 0;
    if (extra > 0) {
      h += extra;
    }
    return [w, h];
  };
  // Re-distribute extra height when the text content changes.
  if (widget.inputEl && !widget.__aun_inputHooked) {
    widget.__aun_inputHooked = true;
    widget.inputEl.addEventListener("input", () => {
      try {
        refreshWeight(widget);
        const [, ch] = node.computeSize();
        const baseH = Math.max(ch, MIN_NODE_H);
        if (node.size[1] >= baseH) {
          applyStretchForSize(node, baseH);
        }
      } catch {}
    });
  }
}

function clearStretchStyles(node) {
  for (let i = 1; i <= MAX_INPUTS; i++) {
    const w = getWidget(node, `string_${i}`);
    if (w) w.__aun_stretchExtra = 0;
    try {
      if (w?.inputEl?.style) {
        w.inputEl.style.height = "";
        w.inputEl.style.minHeight = `${MIN_TEXTAREA_H}px`;
      }
    } catch {}
  }
}

function applyStretchForSize(node, baseH) {
  const visible = getVisibleStringWidgets(node).filter((w) => !w.hidden);
  if (!visible.length) {
    for (let i = 1; i <= MAX_INPUTS; i++) {
      const w = getWidget(node, `string_${i}`);
      if (w) w.__aun_stretchExtra = 0;
    }
    return;
  }
  const extra = node.size[1] - baseH;
  if (extra <= 0) {
    for (const w of visible) {
      w.__aun_stretchExtra = 0;
      try {
        if (w.inputEl?.style) {
          w.inputEl.style.height = "";
          w.inputEl.style.minHeight = `${MIN_TEXTAREA_H}px`;
        }
      } catch {}
    }
    node.widgets_dirty = true;
    try {
      node._widgetSlotsDirty = true;
      node._setConcreteSlots?.();
      node.arrange?.();
    } catch (e) { /* ignore */ }
    return;
  }
  const weights = visible.map(cachedWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || visible.length;
  const pendingHeights = [];
  for (let idx = 0; idx < visible.length; idx++) {
    const w = visible[idx];
    const share = (weights[idx] / totalWeight) * extra;
    w.__aun_stretchExtra = share;
    try {
      const [, wh] = w.computeSize(node.size[0]);
      // Slot height includes WIDGET_GAP; the textarea itself excludes it.
      const taH = Math.max(wh - WIDGET_GAP, MIN_TEXTAREA_H);
      pendingHeights.push([w, taH]);
    } catch {}
  }
  node.widgets_dirty = true;
  // Re-run the canvas widget layout so computedHeight picks up the new
  // __aun_stretchExtra values. Without this, DOM textareas are sized by the
  // stretch while the canvas still lays them out at base height -> the widgets
  // visually spill past the node's bottom edge after a reload.
  try {
    node._widgetSlotsDirty = true;
    node._setConcreteSlots?.();
    node.arrange?.();
  } catch (e) { /* ignore */ }
  requestAnimationFrame(() => {
    for (const [w, taH] of pendingHeights) {
      try {
        if (w?.inputEl?.style) {
          w.inputEl.style.height = `${taH}px`;
          w.inputEl.style.minHeight = `${taH}px`;
        }
      } catch {}
    }
  });
}

function updateNodeVisibility(node, preserveExtra = false) {
  const numInputs = clampInputs(getWidget(node, "num_inputs")?.value ?? 1);

  for (let i = 1; i <= MAX_INPUTS; i++) {
    const w = getWidget(node, `string_${i}`);
    const hidden = i > numInputs;
    if (w) {
      w.hidden = !!hidden;
      w.__AUN_visible = !hidden;
      if (w.flags) {
        w.flags.hidden = !!hidden;
        w.flags.collapsed = !!hidden;
      }
      if (w.options) w.options.noDraw = !!hidden;
      if (w.inputEl?.style) {
        w.inputEl.style.display = hidden ? "none" : "";
      }
    }
    if (w) ensureStretchable(w, node);
  }

  // Reset stretch to measure the true base height. Manual extra height is
  // only preserved on graph load; a num_inputs change always refits so the
  // node auto-resizes to the new visible count.
  const prevH = node.size?.[1] ?? 0;
  clearStretchStyles(node);
  node.widgets_dirty = true;
  for (const w of getVisibleStringWidgets(node)) refreshWeight(w);
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
    const saved = [];
    for (let i = 1; i <= MAX_INPUTS; i++) {
      const wgt = getWidget(this, `string_${i}`);
      if (wgt) {
        saved.push([wgt, wgt.__aun_stretchExtra || 0]);
        wgt.__aun_stretchExtra = 0;
      }
    }
    let w, h;
    try {
      [w, h] = origComputeSize ? origComputeSize.apply(this, arguments) : [this.size?.[0] ?? 300, MIN_NODE_H];
    } catch {
      w = this.size?.[0] ?? 300;
      h = MIN_NODE_H;
    } finally {
      for (const [wgt, extra] of saved) {
        wgt.__aun_stretchExtra = extra;
      }
    }
    h = Math.max(h, MIN_NODE_H);
    return [w, h];
  };

  const numInputsW = getWidget(node, "num_inputs");
  if (numInputsW) {
    const origCb = numInputsW.callback;
    numInputsW.callback = function (value) {
      const result = origCb?.apply(this, arguments);
      updateNodeVisibility(node, true);
      return result;
    };
  }

  const origConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    origConfigure?.apply(this, arguments);
    updateNodeVisibility(this, true);
    // DOM widgets may not be measured yet during load; refit once they settle.
    requestAnimationFrame(() => updateNodeVisibility(this, true));
    setTimeout(() => updateNodeVisibility(this, true), 150);
  };

  const origResize = node.onResize;
  node.onResize = function (sz) {
    const result = origResize?.apply(this, arguments);
    if (node.__aun_adjusting) return result;
    try {
      node.__aun_adjusting = true;
      // node.computeSize() is base-only (stretch excluded), so the user can
      // always shrink back down; extra space is redistributed by content size.
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
    // Re-fit after the graph and DOM widgets have settled on load.
    requestAnimationFrame(() => updateNodeVisibility(node, true));
    setTimeout(() => updateNodeVisibility(node, true), 150);
  },
});
