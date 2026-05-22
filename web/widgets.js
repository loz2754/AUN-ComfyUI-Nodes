/**
 * Widget helper utilities for AUN nodes.
 */

/**
 * Find a widget on a node by name.
 * @param {object} node - The ComfyUI node.
 * @param {string} name - Widget name to find.
 * @returns {object|null} The widget or null.
 */
export function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

/**
 * Find a widget on a node by any of several possible names.
 * @param {object} node - The ComfyUI node.
 * @param {string[]} names - Possible widget names, checked in order.
 * @returns {object|null} The first matching widget or null.
 */
export function getWidgetByNames(node, names) {
  if (!node?.widgets || !names?.length) return null;
  for (const name of names) {
    const w = node.widgets.find((w) => w.name === name);
    if (w) return w;
  }
  return null;
}

/**
 * Make a widget "hidden-aware": when hidden, it contributes zero height
 * to the node's computed size. Wraps the original computeSize once.
 * @param {object} widget - The widget to wrap.
 */
export function ensureHiddenAware(widget) {
  if (!widget || widget.__AUN_hiddenAware) return;
  const origComputeSize =
    typeof widget.computeSize === "function" ? widget.computeSize : null;
  widget.__AUN_hiddenAware = true;

  // Detect multiline textarea widgets
  const isMultiline =
    widget.type === "customtext" || widget.options?.multiline === true;

  widget.computeSize = function (...args) {
    if (this.hidden) {
      return [args[0] ?? globalThis.LiteGraph?.NODE_WIDTH ?? 200, 0];
    }
    let [w, h] = origComputeSize
      ? origComputeSize.apply(this, args)
      : [args[0] ?? 200, this.comfyHeight ?? 20];

    if (isMultiline) {
      h = Math.max(h, 100);
      this.comfyHeight = h;
    }
    return [w, h];
  };

  // Set minimum height on DOM element so it fills the computed space
  if (isMultiline && widget.inputEl) {
    widget.inputEl.style.minHeight = "80px";
  }
}

/**
 * Apply hidden/visible state to a widget with all necessary flags.
 * @param {object} widget - The widget.
 * @param {boolean} hidden - True to hide, false to show.
 */
export function applyWidgetHiddenState(widget, hidden) {
  if (!widget) return;
  ensureHiddenAware(widget);
  widget.hidden = !!hidden;
  widget.__AUN_visible = !hidden;

  if (widget.flags) {
    widget.flags.hidden = !!hidden;
    widget.flags.collapsed = !!hidden;
  }
  if (widget.options) {
    widget.options.noDraw = !!hidden;
  }
  if (widget.inputEl?.style) {
    widget.inputEl.style.display = hidden ? "none" : "";
  }
}

/**
 * Chain a callback onto an existing widget callback (preserving the original).
 * @param {object} widget - The widget.
 * @param {Function} newCallback - Callback to chain after the original.
 */
export function chainWidgetCallback(widget, newCallback) {
  if (!widget || !newCallback) return;
  const orig = widget.callback;
  widget.callback = function (...args) {
    try {
      if (typeof orig === "function") orig.apply(this, args);
    } catch (_) {}
    try {
      newCallback.apply(this, args);
    } catch (e) {
      console.warn("[AUN] chained callback error:", e);
    }
  };
}

/**
 * Set a widget value and fire its callback if it exists.
 * @param {object} widget - The widget.
 * @param {*} value - The new value.
 */
export function setWidgetValue(widget, value) {
  if (!widget) return;
  const prev = widget.value;
  widget.value = value;
  if (prev !== value && typeof widget.callback === "function") {
    try {
      widget.callback.call(widget, value);
    } catch (_) {}
  }
}
