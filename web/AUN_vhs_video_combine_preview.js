import { app } from "../../scripts/app.js";
import { applyWidgetHiddenState } from "./widgets.js";
import { syncCollapseVueLabels, withUESuppressed } from "./index.js";

// Preview Mode for VHS Video Combine (VideoHelperSuite).
// Pure frontend monkey-patch: hides all control widgets (including the
// dynamic format widgets VHS rebuilds on `format` change) and leaves only
// the VHS video/audio preview visible. Mirrors the AUN Save Image
// Preview Mode (double-click / right-click toggle, height persistence).
// No-ops when VideoHelperSuite is not installed.

const TARGET_CLASSES = new Set(["VHS_VideoCombine"]);

const PK = "aun_vhs_preview";
const SAVED_HEIGHT_KEY = "__aun_vhs_saved_height";

function isPreviewWidget(w) {
  if (!w) return false;
  const name = String(w.name || "").toLowerCase();
  // VHS registers its DOM previews via addDOMWidget("videopreview"/"audiopreview", ...)
  if (name === "videopreview" || name === "audiopreview") return true;
  if (name.includes("preview")) return true;
  return false;
}

function markDirty(node) {
  // NOTE: intentionally no setSize() here. The node keeps whatever size the
  // user set manually; hidden widgets collapse to zero height on their own
  // and the VHS preview widget defines the visible body.
  try {
    node?.graph?.setDirtyCanvas(true, true);
  } catch (_) {}
}

function applyWidgetVisibility(node) {
  if (!node?.widgets) return;
  const on = !!node.properties?.[PK];
  for (const w of node.widgets) {
    if (isPreviewWidget(w)) {
      // Never hide the VHS preview itself.
      applyWidgetHiddenState(w, false);
      continue;
    }
    applyWidgetHiddenState(w, on);
  }
}

function applyPreview(node, next) {
  if (!node) return;
  const target = !!next;
  if (!!node.properties?.[PK] === target) return;
  node.properties = node.properties || {};
  node.properties[PK] = target;
  applyWidgetVisibility(node);
  // Blank eagerly (not just in onDrawForeground): the canvas paints slots
  // BEFORE onDrawForeground runs in the same frame, and with a static graph
  // no second frame is ever requested — so draw-time-only blanking would
  // leave the stale painted labels on screen forever.
  syncSlotLabels(node);
  markDirty(node);
  // VueNodes frontend renders slot labels as DOM text (canvas
  // onDrawForeground blanking never runs there) — sync the hiding stylesheet.
  syncCollapseVueLabels();
}

function toggle(node) {
  if (!node) return;
  applyPreview(node, !node.properties?.[PK]);
}

// VHS rebuilds the format-specific widgets (crf, etc.) inside the `format`
// widget callback. Re-hide the fresh widgets after VHS recreates them.
// Our chain is attached at instance setup (after VHS's prototype-level
// chain), so it runs after VHS's recreation logic synchronously.
function hookFormatWidget(node) {
  if (!node?.widgets || node.__aun_vhs_format_hooked) return;
  const fmt = node.widgets.find((w) => w?.name === "format");
  if (!fmt || typeof fmt.callback !== "function") return;
  const prev = fmt.callback;
  fmt.callback = function (...args) {
    const r = prev.apply(this, args);
    try {
      // Widgets array was spliced by VHS (and new inputs may have been
      // added); hide the new ones and blank their slot labels. VHS already
      // calls its own fitHeight() after recreating them, so don't resize here.
      applyWidgetVisibility(node);
      syncSlotLabels(node);
      markDirty(node);
    } catch (_) {}
    return r;
  };
  node.__aun_vhs_format_hooked = true;
}

// Invisible-but-truthy slot label used in Preview Mode.
// The canvas renderer falls back to the slot `name` for any falsy label
// ("" included — which is why "" blanking showed the names stacked at one
// point), so the label must be truthy to stick. U+200B renders as nothing,
// has ~zero width, and survives trim(). Tradeoff: `label || name` readers
// (e.g. Use Everywhere broadcast matching) see this instead of the real
// name while preview is on; the original is restored on Show Controls.
const HIDDEN_LABEL = "\u200B";

// Blank (or restore) slot labels. Returns true when anything changed.
// Factored out of onDrawForeground so toggles can apply it eagerly: the
// canvas paints slots before onDrawForeground runs, so draw-time-only
// blanking always lags one frame behind — and on a static graph that next
// frame never comes.
function syncSlotLabels(node) {
  if (!node) return false;
  const on = !!node.properties?.[PK];
  let changed = false;
  for (const slot of [...(node.inputs || []), ...(node.outputs || [])]) {
    if (node.widgets?.length && slot.widget) continue;
    if (!on) {
      if ("__aun_vhs_origLabel" in slot) {
        delete slot.label;
        delete slot.__aun_vhs_origLabel;
        changed = true;
      } else if (
        slot.label === "" ||
        slot.label === " " ||
        slot.label === HIDDEN_LABEL
      ) {
        delete slot.label;
        changed = true;
      }
      continue;
    }
    if (!("__aun_vhs_origLabel" in slot)) {
      slot.__aun_vhs_origLabel = slot.label;
    }
    if (slot.label !== HIDDEN_LABEL) {
      slot.label = HIDDEN_LABEL;
      changed = true;
    }
  }
  return changed;
}

function setupNode(node) {
  if (!node || !TARGET_CLASSES.has(node.comfyClass)) return;

  if (!node.__aun_vhs_preview_hooked) {
    node.properties = node.properties || {};

    const origResize = node.onResize;
    node.onResize = function () {
      origResize?.apply(this, arguments);
      // Skip saving during configure phase to prevent layout resizes from
      // overwriting the restored user height.
      if (!this.__aun_configuring) {
        this.properties[SAVED_HEIGHT_KEY] = this.size?.[1];
      }
    };

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

    const origDrawFg = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
      if (origDrawFg) origDrawFg.apply(this, arguments);
      // Backstop for slots added after the toggle (e.g. VHS recreating
      // format inputs). If anything changed, request the follow-up frame
      // that actually paints the blank labels.
      try {
        if (syncSlotLabels(this)) {
          this.graph?.setDirtyCanvas(true, false);
        }
      } catch (_) {}
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

      // AUN double-click takes precedence over UE's restrictions dialog.
      withUESuppressed(this, () => toggle(this));
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

    node.__aun_vhs_preview_hooked = true;

    // Keep the Vue label-hiding stylesheet fresh when a preview-mode node is
    // deleted (its id could otherwise linger in the CSS).
    const origRemoved = node.onRemoved;
    node.onRemoved = function () {
      const r = origRemoved?.apply(this, arguments);
      try {
        syncCollapseVueLabels();
      } catch (_) {}
      return r;
    };
  }

  hookFormatWidget(node);
  // Re-apply on every load: nodeCreated fires before properties are restored
  // from the workflow JSON, so the post-configure pass is what actually hides
  // the widgets (and blanks the slot labels).
  applyWidgetVisibility(node);
  syncSlotLabels(node);

  // On F5 / tab switch the graph is re-configured (and VHS recreates its
  // format widgets); re-hook and re-apply once it finishes.
  if (!node.__aun_vhs_cfg_hooked) {
    node.__aun_vhs_cfg_hooked = true;
    const origConfigure = node.onConfigure;
    node.onConfigure = function () {
      // Flag to prevent onResize from overwriting restored height during layout.
      this.__aun_configuring = true;
      // A fresh `format` widget instance may have been created by VHS.
      this.__aun_vhs_format_hooked = false;
      origConfigure?.apply(this, arguments);
      hookFormatWidget(this);
      applyWidgetVisibility(this);
      syncSlotLabels(this);
      // Restore persisted height from properties after workflow load.
      const savedH = this.properties?.[SAVED_HEIGHT_KEY];
      if (typeof savedH === "number" && savedH > 0) {
        this.size[1] = savedH;
      }
      this.__aun_configuring = false;
      // Reload with preview on (F5 / tab switch): re-hide Vue DOM slot labels.
      syncCollapseVueLabels();
    };
  }
}

app.registerExtension({
  name: "AUN.VHS.VideoCombine.PreviewMode",
  nodeCreated: (node) => setupNode(node),
  loadedGraphNode: (node) => setupNode(node),
});
