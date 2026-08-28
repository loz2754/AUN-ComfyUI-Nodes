import { app } from "../../scripts/app.js";
import { registerLegacyExtension } from "./aun-compat.js";
import { api } from "../../scripts/api.js";
import { getWidget, ensureHiddenAware, applyWidgetHiddenState } from "./widgets.js";
import { injectStyles } from "./utils.js";

const NODE_TYPE = "AUNImageSliderComparer";
const MAX_PAIRS = 4;
const COLLAPSE_KEY = "collapse_connections";

const STATE = new WeakMap();

// Comparer nodes whose DOM overlay must track the native collapsed flag.
const COLLAPSED_NODES = new Set();

const CSS_KEY = "__aun_image_slider_comparer_styles";
injectStyles(
  CSS_KEY,
  `
.aun-cmp { display: flex; flex-direction: column; }
.aun-cmp-header { flex: none; display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: rgba(28,28,38,0.96); border-bottom: 1px solid rgba(255,255,255,0.14); }
.aun-cmp-side { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
.aun-cmp-side.right { justify-content: flex-end; }
.aun-cmp-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 11px sans-serif; color: #fff; }
.aun-cmp-name.right { text-align: right; }
.aun-cmp-vs { flex: none; font: 600 10px sans-serif; color: #ffb454; }
.aun-cmp-badge { flex: none; font: 600 9px sans-serif; color: #ffb454; background: rgba(255,180,84,0.14); border: 1px solid rgba(255,180,84,0.4); border-radius: 9px; padding: 0 6px; }
.aun-cmp-dims { flex: none; font: 500 9px sans-serif; color: #b8b8c8; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); border-radius: 9px; padding: 0 6px; white-space: nowrap; }
.aun-cmp-imgarea { flex: 1; min-height: 0; position: relative; overflow: hidden; background: #111; cursor: ew-resize; touch-action: none; }
.aun-cmp-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; }
.aun-cmp-divider { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.92); box-shadow: 0 0 4px rgba(0,0,0,0.85); pointer-events: none; }
.aun-cmp-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #8a8a96; font: 600 12px sans-serif; background: #141418; }
`,
);

function getState(node) {
  let s = STATE.get(node);
  if (!s) {
    s = { namesKey: null, baseTitle: null, sliderWidget: null, cache: {} };
    STATE.set(node, s);
  }
  return s;
}

function getWidgetByName(node, name) {
  return getWidget(node, name);
}

function normalizePair(value) {
  if (typeof value === "number") {
    return Math.min(MAX_PAIRS, Math.max(1, Math.round(value)));
  }
  const n = parseInt(String(value).replace("Pair", "").trim(), 10);
  return Number.isInteger(n) && n >= 1 ? Math.min(MAX_PAIRS, n) : 1;
}

function normalizeFrame(value) {
  const n = Math.round(Number(value));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function getConnectedOutputLabel(node, slot) {
  if (!slot || slot.link == null) return null;
  const graph = node.graph || app.graph;
  if (!graph) return null;
  const links = graph.links;
  const link = links?.get ? links.get(slot.link) : links?.[slot.link];
  if (!link) return null;
  const src = graph.getNodeById ? graph.getNodeById(link.origin_id) : null;
  if (!src || !src.outputs) return null;
  const out = src.outputs[link.origin_slot];
  if (!out) return null;
  // Collapse handlers set slot.label to " " (space) to visually hide labels.
  // Treat space-only labels as no label so downstream nodes fall back to name.
  const label = out.label || "";
  if (!label.trim()) return out.name || null;
  return label || out.name || null;
}

function collectNames(node) {
  const names = {};
  node.properties = node.properties || {};
  const raw = node.properties.input_labels;
  const labels =
    raw && typeof raw === "object" ? raw : (node.properties.input_labels = {});
  for (let p = 1; p <= MAX_PAIRS; p++) {
    for (const side of ["left", "right"]) {
      const key = `pair${p}_${side}`;
      const slot = node.inputs?.find((s) => s.name === key);
      const connected = slot ? getConnectedOutputLabel(node, slot) : null;
      const t = typeof slot?.label === "string" ? slot.label.trim() : "";
      if (connected) {
        // A manual label only applies while the slot is connected; it is tied
        // to the source it was named for, so it is dropped on disconnect.
        if (t && t !== connected && t !== slot?.name) {
          labels[key] = t;
        } else if (t && t === connected) {
          delete labels[key];
        }
      } else {
        delete labels[key];
      }
      names[key] = labels[key] || connected || key;
    }
  }
  return names;
}

function applySlotLabels(node, names) {
  if (!node?.inputs) return;
  const collapsed = isCollapsed(node);
  for (const slot of node.inputs) {
    if (typeof slot?.name !== "string") continue;
    const m = /^pair(\d)_(left|right)$/.exec(slot.name);
    if (!m) continue;
    const key = slot.name;
    slot.label = collapsed ? " " : names[key] || key;
  }
}

function toArraySafe(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.keys(value);
  return [];
}

function getContextMenuClass() {
  if (globalThis.LiteGraph?.ContextMenu) return globalThis.LiteGraph.ContextMenu;
  if (globalThis.app?.LiteGraph?.ContextMenu) return globalThis.app.LiteGraph.ContextMenu;
  return null;
}

// The stock ComboWidget dropdown menu is unreliable in this frontend version
// (items render but left-click selection never fires), so we install our own
// callback-style ContextMenu for the pair selector. Arrow buttons are kept.
function installPairMenu(node) {
  const pw = getWidgetByName(node, "pair");
  const Ctx = getContextMenuClass();
  if (!pw || !Ctx || pw.__aun_cmp_menu) return;
  pw.__aun_cmp_menu = true;

  pw.onClick = function ({ e, node: n, canvas: c }) {
    const r = e.canvasX - n.pos[0];
    const w = this.width || n.size[0];
    if (r < 40) return this.decrementValue({ e, node: n, canvas: c });
    if (r > w - 40) return this.incrementValue({ e, node: n, canvas: c });

    const names = collectNames(n);
    const titles = {};
    for (let p = 1; p <= MAX_PAIRS; p++) {
      const key = `Pair ${p}`;
      const l = names[`pair${p}_left`];
      const rr = names[`pair${p}_right`];
      titles[key] = l || rr ? `Pair ${p} — ${l || "∅"} vs ${rr || "∅"}` : key;
    }

    let values;
    try {
      values = toArraySafe(this.getValues(n));
    } catch (_) {
      values = Array.from({ length: MAX_PAIRS }, (_, i) => `Pair ${i + 1}`);
    }

    const entries = values.map((v) => ({
      title: titles[v] || String(v),
      callback: () => {
        try {
          this.setValue(v, { e, node: n, canvas: c });
        } catch (err) {
          console.warn("[AUN] pair selection failed", err);
        }
      },
    }));

    try {
      new Ctx(entries, {
        scale: Math.max(1, c.ds.scale),
        event: e,
        className: "dark",
      });
    } catch (err) {
      console.warn("[AUN] pair menu failed", err);
    }
  };
}

function applyPairOptions(node, names) {
  const pw = getWidgetByName(node, "pair");
  if (!pw) return;
  const titles = {};
  for (let p = 1; p <= MAX_PAIRS; p++) {
    const key = `Pair ${p}`;
    const l = names[`pair${p}_left`];
    const r = names[`pair${p}_right`];
    titles[key] = l || r ? `Pair ${p} — ${l || "∅"} vs ${r || "∅"}` : key;
  }
  // Replace the options object (fresh reference) so Vue-backed combos pick up
  // the enriched labels reactively. Values stay stable for the backend.
  pw.options = {
    ...(pw.options || {}),
    values: Array.from({ length: MAX_PAIRS }, (_, i) => `Pair ${i + 1}`),
    getOptionLabel: (value) => titles[value] || String(value),
  };
}

function updateTitle(node, names) {
  const state = getState(node);
  const pair = normalizePair(getWidgetByName(node, "pair")?.value);
  const l = names?.[`pair${pair}_left`];
  const r = names?.[`pair${pair}_right`];
  let suffix = "";
  if (l || r) suffix = ` — ${l || "∅"} vs ${r || "∅"} (Pair ${pair})`;
  if (!state.baseTitle) {
    state.baseTitle = String(node.title || node.comfyClass || NODE_TYPE).replace(
      /\s*—.*\(Pair \d+\)$/,
      "",
    );
  }
  const target = state.baseTitle + suffix;
  if (node.title !== target) node.title = target;
}

function refreshMeta(node) {
  if (!node) return;
  const state = getState(node);
  const names = collectNames(node);
  state.namesKey = JSON.stringify(names);
  applySlotLabels(node, names);
  applyPairOptions(node, names);
  installPairMenu(node);
  installFrameMenu(node);
  updateTitle(node, names);
  if (state.sliderWidget) renderCachedPair(node);
  node.setDirtyCanvas?.(true, true);
}

// ── Frame widget state (dropdown; options track the active pair's frame count) ──

function frameOptionList(count) {
  const n = Math.max(1, Math.round(Number(count)) || 1);
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

// Coerce the frame widget value to a valid string within the given option list.
function normalizeFrameWidgetValue(fw, count) {
  if (!fw) return;
  const values = frameOptionList(count);
  const idx = values.indexOf(String(fw.value));
  if (idx !== -1) return String(fw.value);
  const num = Math.round(Number(fw.value)) || 1;
  return String(Math.max(1, Math.min(num, values.length)));
}

// The stock ComboWidget dropdown menu is unreliable in this frontend version,
// so the frame selector uses the same custom ContextMenu as the pair selector
// (arrow buttons are kept).
function installFrameMenu(node) {
  const fw = getWidgetByName(node, "frame");
  const Ctx = getContextMenuClass();
  if (!fw || !Ctx || fw.__aun_cmp_frame_menu) return;
  fw.__aun_cmp_frame_menu = true;

  fw.onClick = function ({ e, node: n, canvas: c }) {
    const r = e.canvasX - n.pos[0];
    const w = this.width || n.size[0];
    if (r < 40) return this.decrementValue({ e, node: n, canvas: c });
    if (r > w - 40) return this.incrementValue({ e, node: n, canvas: c });

    const activePair = normalizePair(getWidgetByName(n, "pair")?.value);
    const fc = getState(n).cache?.[activePair]?.frame_count;
    let values;
    if (fc >= 1) {
      values = frameOptionList(fc);
    } else {
      try {
        values = toArraySafe(this.getValues(n));
      } catch (_) {
        values = ["1"];
      }
    }
    if (!values.length) values = ["1"];

    const entries = values.map((v) => ({
      title: `Frame ${v}`,
      callback: () => {
        try {
          this.setValue(String(v), { e, node: n, canvas: c });
        } catch (err) {
          console.warn("[AUN] frame selection failed", err);
        }
      },
    }));

    try {
      new Ctx(entries, {
        scale: Math.max(1, c.ds.scale),
        event: e,
        className: "dark",
      });
    } catch (err) {
      console.warn("[AUN] frame menu failed", err);
    }
  };
}

function applyFrameState(node, comparer) {
  const fw = getWidgetByName(node, "frame");
  if (!fw) return;
  ensureHiddenAware(fw);
  const count = comparer?.frame_count || 1;
  // Fresh options reference so Vue-backed combos pick up the new frame list.
  fw.options = {
    ...(fw.options || {}),
    values: frameOptionList(count),
  };
  const v = normalizeFrameWidgetValue(fw, count);
  if (String(fw.value) !== v) fw.value = v;
  applyWidgetHiddenState(fw, false);
  node.graph?.setDirtyCanvas?.(true, true);
}

// ── DOM slider widget (mirrors the AUN video preview overlay pattern) ──

function offsetDOMWidget(widget, ctx, node, widgetWidth, widgetY, height) {
  const margin = 6;
  const padding = 12;
  const elRect = ctx.canvas.getBoundingClientRect();
  const M = new DOMMatrix()
    .scaleSelf(elRect.width / ctx.canvas.width, elRect.height / ctx.canvas.height)
    .multiplySelf(ctx.getTransform());
  const y1 = widgetY + margin;
  const h = Math.max(0, height) - margin;
  const y2 = y1 + Math.max(0, h);
  const p1 = new DOMPoint(padding, y1).matrixTransform(M);
  const p2 = new DOMPoint(Math.max(0, widgetWidth - padding), y2).matrixTransform(M);
  Object.assign(widget.inputEl.style, {
    transformOrigin: "0 0",
    transform: "none",
    left: `${elRect.left + p1.x}px`,
    top: `${elRect.top + p1.y}px`,
    width: `${Math.max(0, p2.x - p1.x)}px`,
    height: `${Math.max(0, p2.y - p1.y)}px`,
    position: "absolute",
    zIndex: 5,
  });
}

function forwardBackgroundEvents(container) {
  if (!container || !app?.canvas) return;
  container.addEventListener(
    "contextmenu",
    (event) => {
      if (container.__aunContextMenu?.(event)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    },
    true,
  );
  for (const [eventName, handlerName] of [
    ["mousewheel", "_mousewheel_callback"],
    ["wheel", "_mousewheel_callback"],
  ]) {
    container.addEventListener(
      eventName,
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        app.canvas?.[handlerName]?.call(app.canvas, event);
      },
      true,
    );
  }
  container.addEventListener("pointerdown", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    app.canvas?._mousedown_callback?.call(app.canvas, event);
  });
}

function updateSlider(widget, pct) {
  const s = Math.max(0, Math.min(100, pct));
  widget.__slider = s;
  if (widget.__imgLeft) {
    const isSlide = widget.parent?.properties?.comparer_mode === "Slide";
    if (isSlide) {
      // Slide mode: clip left image from the left edge so the right image
      // appears from the left and expands rightward as the slider moves.
      widget.__imgLeft.style.clipPath = `inset(0 0 0 ${s}%)`;
    } else {
      // Drag mode: left image hidden at 0%, fully visible at 100%.
      widget.__imgLeft.style.clipPath = `inset(0 ${100 - s}% 0 0)`;
    }
  }
  if (widget.__divider) {
    widget.__divider.style.left = `${s}%`;
  }
}

function buildImageUrl(info) {
  if (!info) return "";
  return api.apiURL("/view?" + new URLSearchParams(info).toString());
}

function downloadUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "image.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openUrl(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function createSliderWidget(node, state) {
  const HEADER_H = 34;

  const widget = {
    name: "__aun_image_slider",
    type: "aun_imageslider",
    value: {},
    inputEl: null,
    __slider: 50,
    draw(ctx, nodeRef, widgetWidth, widgetY) {
      if (!this.inputEl) return;
      // Hide the DOM overlay while the node is natively collapsed (collapse dot).
      if (nodeRef?.flags?.collapsed) {
        this.inputEl.style.display = "none";
        return;
      }
      this.inputEl.style.display = "";
      // Fill the space below this widget to the bottom of the node, so the
      // comparer tracks the user-set node height instead of forcing its own.
      const avail = Math.max(
        40,
        (nodeRef.size?.[1] ?? 300) - widgetY - 8,
      );
      offsetDOMWidget(this, ctx, nodeRef, widgetWidth, widgetY, avail);
      // Callback-independent sync: if the Pair/Frame widget values changed,
      // re-render from cache on the next canvas draw, no matter how the
      // values were set (arrows, drag, typed input, or programmatic).
      if (nodeRef && typeof nodeRef === "object") {
        const pairV = getWidgetByName(nodeRef, "pair")?.value;
        const frameV = getWidgetByName(nodeRef, "frame")?.value;
        if (pairV !== this.__lastPair || frameV !== this.__lastFrame) {
          this.__lastPair = pairV;
          this.__lastFrame = frameV;
          renderCachedPair(nodeRef);
        }
      }
    },
    computeSize(width) {
      if (!this.inputEl) return [Array.isArray(width) ? width[0] : width ?? 300, 0];
      const w = Array.isArray(width) ? width[0] : width ?? node.size?.[0] ?? 300;
      return [w, HEADER_H + 200 + 4];
    },
    onRemoved() {
      this.inputEl?.remove();
      this.inputEl = null;
    },
  };

  const container = document.createElement("div");
  container.className = "aun-cmp";

  const header = document.createElement("div");
  header.className = "aun-cmp-header";

  const leftSide = document.createElement("div");
  leftSide.className = "aun-cmp-side";

  const leftName = document.createElement("span");
  leftName.className = "aun-cmp-name";

  const dimsLeft = document.createElement("span");
  dimsLeft.className = "aun-cmp-dims";
  dimsLeft.style.display = "none";

  leftSide.append(leftName, dimsLeft);

  const vs = document.createElement("span");
  vs.className = "aun-cmp-vs";
  vs.textContent = "vs";

  const rightSide = document.createElement("div");
  rightSide.className = "aun-cmp-side right";

  const dimsRight = document.createElement("span");
  dimsRight.className = "aun-cmp-dims";
  dimsRight.style.display = "none";

  const rightName = document.createElement("span");
  rightName.className = "aun-cmp-name right";

  rightSide.append(dimsRight, rightName);

  const badge = document.createElement("span");
  badge.className = "aun-cmp-badge";
  badge.style.display = "none";

  header.append(leftSide, vs, rightSide, badge);

  const imgArea = document.createElement("div");
  imgArea.className = "aun-cmp-imgarea";

  const imgRight = document.createElement("img");
  imgRight.className = "aun-cmp-img";
  imgRight.draggable = false;
  imgRight.alt = "after";

  const imgLeft = document.createElement("img");
  imgLeft.className = "aun-cmp-img";
  imgLeft.draggable = false;
  imgLeft.alt = "before";
  imgLeft.style.clipPath = "inset(0 50% 0 0)";

  const divider = document.createElement("div");
  divider.className = "aun-cmp-divider";
  divider.style.left = "50%";

  const emptyOverlay = document.createElement("div");
  emptyOverlay.className = "aun-cmp-empty";
  emptyOverlay.textContent = "No input — connect pairN_left / pairN_right";
  emptyOverlay.style.display = "none";

  imgArea.append(imgRight, imgLeft, divider, emptyOverlay);
  container.append(header, imgArea);

  // Slide mode: slider follows mouse without clicking
  imgArea.addEventListener("pointermove", (event) => {
    if (node.properties?.comparer_mode !== "Slide") return;
    const rect = imgArea.getBoundingClientRect();
    updateSlider(widget, ((event.clientX - rect.left) / rect.width) * 100);
  });

  imgArea.addEventListener("pointerleave", () => {
    if (node.properties?.comparer_mode !== "Slide") return;
    updateSlider(widget, 0);
  });

  // Drag mode: click and drag to scrub (default behaviour)
  imgArea.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (node.properties?.comparer_mode === "Slide") return;
    event.preventDefault();
    event.stopPropagation();
    imgArea.setPointerCapture?.(event.pointerId);
    const scrub = (ev) => {
      const rect = imgArea.getBoundingClientRect();
      updateSlider(widget, ((ev.clientX - rect.left) / rect.width) * 100);
    };
    scrub(event);
    const onMove = (ev) => scrub(ev);
    const onUp = (ev) => {
      imgArea.releasePointerCapture?.(ev.pointerId);
      imgArea.removeEventListener("pointermove", onMove);
      imgArea.removeEventListener("pointerup", onUp);
    };
    imgArea.addEventListener("pointermove", onMove);
    imgArea.addEventListener("pointerup", onUp);
  });

  imgLeft.addEventListener("load", () => {
    // The comparer fills the node's user-set height, so no auto-resize needed.
    node.graph?.setDirtyCanvas?.(true, true);
    updateDims(widget);
  });

  imgRight.addEventListener("load", () => {
    updateDims(widget);
  });

  forwardBackgroundEvents(container);

  // Right-click on the image area opens a per-side menu: left of the divider
  // targets the left image, right of it targets the right image.
  container.__aunContextMenu = (event) => {
    const Ctx = getContextMenuClass();
    if (!Ctx) return false;
    const rect = imgArea.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right) return false;
    const side =
      event.clientX < rect.left + (rect.width * (widget.__slider || 50)) / 100
        ? "left"
        : "right";
    const info = side === "left" ? widget.__currentLeft : widget.__currentRight;
    if (!info) return false;
    const label = side === "left" ? "Left" : "Right";
    const url = buildImageUrl(info);
    try {
      new Ctx(
        [
          {
            title: `Open ${label} Image in New Tab`,
            callback: () => openUrl(url),
          },
          {
            title: `Download ${label} Image`,
            callback: () =>
              downloadUrl(url, info.filename || `${side}.png`),
          },
        ],
        { event, className: "dark" },
      );
    } catch (err) {
      console.warn("[AUN] image context menu failed", err);
    }
    return true;
  };

  widget.__container = container;
  widget.__imgLeft = imgLeft;
  widget.__imgRight = imgRight;
  widget.__divider = divider;
  widget.__emptyOverlay = emptyOverlay;
  widget.__leftName = leftName;
  widget.__rightName = rightName;
  widget.__vs = vs;
  widget.__badge = badge;
  widget.__dimsLeft = dimsLeft;
  widget.__dimsRight = dimsRight;

  widget.inputEl = container;
  widget.parent = node;
  document.body.appendChild(container);

  return widget;
}

function setSliderData(widget, data) {
  if (!widget || !widget.__imgLeft) return;
  widget.__emptyOverlay.style.display = "none";
  widget.__imgLeft.style.display = "";
  widget.__imgRight.style.display = "";
  if (widget.__imgLeft.src !== data.leftUrl) widget.__imgLeft.src = data.leftUrl;
  if (widget.__imgRight.src !== data.rightUrl) widget.__imgRight.src = data.rightUrl;
  widget.__leftName.textContent = data.leftName || "Left";
  widget.__rightName.textContent = data.rightName || "Right";
  widget.__vs.textContent = "vs";
  widget.__currentLeft = data.leftInfo || null;
  widget.__currentRight = data.rightInfo || null;
  const parts = [data.pairLabel, data.frameText].filter(Boolean);
  widget.__badge.textContent = parts.join(" · ");
  widget.__badge.style.display = parts.length ? "" : "none";
  updateDims(widget);
  const isSlide = widget.parent?.properties?.comparer_mode === "Slide";
  updateSlider(widget, isSlide ? 0 : 50);
}

function updateDims(widget) {
  if (!widget || !widget.__imgLeft) return;
  const lw = widget.__imgLeft.naturalWidth;
  const lh = widget.__imgLeft.naturalHeight;
  const rw = widget.__imgRight.naturalWidth;
  const rh = widget.__imgRight.naturalHeight;
  const set = (el, w, h) => {
    if (!el) return;
    const t = w && h ? `${w}×${h}` : "";
    el.textContent = t;
    el.style.display = t ? "" : "none";
  };
  set(widget.__dimsLeft, lw, lh);
  set(widget.__dimsRight, rw, rh);
}

function setSliderEmpty(widget, pairLabel) {
  if (!widget || !widget.__imgLeft) return;
  widget.__imgLeft.removeAttribute("src");
  widget.__imgRight.removeAttribute("src");
  widget.__imgLeft.style.display = "none";
  widget.__imgRight.style.display = "none";
  widget.__emptyOverlay.style.display = "flex";
  widget.__leftName.textContent = pairLabel || "Pair";
  widget.__rightName.textContent = "";
  widget.__vs.textContent = "";
  widget.__badge.style.display = "none";
  widget.__currentLeft = null;
  widget.__currentRight = null;
  widget.__dimsLeft.textContent = "";
  widget.__dimsLeft.style.display = "none";
  widget.__dimsRight.textContent = "";
  widget.__dimsRight.style.display = "none";
}

function renderSlider(node, comparer) {
  const state = getState(node);
  if (!state.sliderWidget) {
    state.sliderWidget = createSliderWidget(node, state);
    node.addCustomWidget(state.sliderWidget);
  }

  if (comparer && typeof comparer === "object") {
    if (Array.isArray(comparer.pairs)) {
      for (const p of comparer.pairs) state.cache[p.pair_index] = p;
    } else if (comparer.pair_index != null) {
      state.cache[comparer.pair_index] = comparer;
    }
  }

  renderCachedPair(node);

  if (Array.isArray(comparer?.saved_images) && comparer.saved_images.length) {
    flashSaved(
      state.sliderWidget,
      comparer.saved_images.map((i) => i.filename),
    );
  }
}

// Show the freshly saved output filenames in the badge, then revert.
function flashSaved(widget, filenames) {
  if (!widget || !widget.__badge) return;
  const badge = widget.__badge;
  const original = badge.textContent;
  badge.textContent = `Saved: ${filenames.join(", ")}`;
  badge.style.display = "";
  if (widget.__flashTimer) clearTimeout(widget.__flashTimer);
  widget.__flashTimer = setTimeout(() => {
    badge.textContent = original;
    badge.style.display = original ? "" : "none";
    widget.__flashTimer = null;
  }, 5000);
}

function renderPair(widget, pairData, frameIndex) {
  if (!widget || !widget.__imgLeft) return;
  if (
    !pairData ||
    pairData.empty ||
    !pairData.left_images?.length ||
    !pairData.right_images?.length
  ) {
    setSliderEmpty(
      widget,
      pairData?.pair_name || `Pair ${pairData?.pair_index ?? "?"}`,
    );
    return;
  }
  const f = Math.max(
    1,
    Math.min(frameIndex || 1, pairData.frame_count || pairData.left_images.length),
  );
  const li = pairData.left_images[Math.min(f - 1, pairData.left_images.length - 1)];
  const ri = pairData.right_images[Math.min(f - 1, pairData.right_images.length - 1)];

  let leftName = pairData.left_name || "Left";
  let rightName = pairData.right_name || "Right";
  const node = widget.parent;
  if (node) {
    const names = collectNames(node);
    const liKey = `pair${pairData.pair_index}_left`;
    const riKey = `pair${pairData.pair_index}_right`;
    if (names[liKey] && names[liKey] !== liKey) leftName = names[liKey];
    if (names[riKey] && names[riKey] !== riKey) rightName = names[riKey];
  }

  setSliderData(widget, {
    leftUrl: buildImageUrl(li),
    rightUrl: buildImageUrl(ri),
    leftInfo: li,
    rightInfo: ri,
    leftName,
    rightName,
    pairLabel: `Pair ${pairData.pair_index}`,
    frameText:
      (pairData.frame_count || 1) > 1
        ? `Frame ${f}/${pairData.frame_count}`
        : "",
  });
}

function renderCachedPair(node) {
  const state = getState(node);
  if (!state.sliderWidget) {
    state.sliderWidget = createSliderWidget(node, state);
    node.addCustomWidget(state.sliderWidget);
  }
  const widget = state.sliderWidget;
  if (!widget || !widget.inputEl) return;

  applySliderVisibility(node);

  const pairIndex = normalizePair(getWidgetByName(node, "pair")?.value);
  const frameIndex = normalizeFrame(getWidgetByName(node, "frame")?.value);
  const pairData = state.cache?.[pairIndex];

  if (pairData) {
    renderPair(widget, pairData, frameIndex);
    applyFrameState(node, pairData);
  } else {
    showPairPending(node, pairIndex);
  }
}

// Show the newly selected pair's header before it has been executed/cached.
function showPairPending(node, pairIndex) {
  const state = getState(node);
  if (!state.sliderWidget) {
    state.sliderWidget = createSliderWidget(node, state);
    node.addCustomWidget(state.sliderWidget);
  }
  const widget = state.sliderWidget;
  if (!widget || !widget.inputEl) return;
  const names = collectNames(node);
  widget.__leftName.textContent = names[`pair${pairIndex}_left`] || "Left";
  widget.__rightName.textContent = names[`pair${pairIndex}_right`] || "Right";
  widget.__vs.textContent = "vs";
  widget.__badge.textContent = `Pair ${pairIndex}`;
  widget.__badge.style.display = "";
  widget.__currentLeft = null;
  widget.__currentRight = null;
  widget.__dimsLeft.textContent = "";
  widget.__dimsLeft.style.display = "none";
  widget.__dimsRight.textContent = "";
  widget.__dimsRight.style.display = "none";
  widget.__imgLeft.removeAttribute("src");
  widget.__imgRight.removeAttribute("src");
  widget.__imgLeft.style.display = "none";
  widget.__imgRight.style.display = "none";
  widget.__emptyOverlay.style.display = "flex";
  widget.__emptyOverlay.textContent = "Run the workflow to view this pair";
  applyFrameState(node, null);
}

function clearStaleSliderWidget(node) {
  if (!node?.widgets) return;
  const idx = node.widgets.findIndex((w) => w.name === "__aun_image_slider");
  if (idx !== -1) {
    node.widgets[idx].onRemoved?.();
    node.widgets.splice(idx, 1);
  }
}

// ── Polling for renamed output slots / late connections ──

function startPoll(node) {
  if (node.__aun_cmp_poll) return;
  node.__aun_cmp_poll = setInterval(() => {
    if (!node || node.type === undefined) {
      if (node?.__aun_cmp_poll) {
        clearInterval(node.__aun_cmp_poll);
        node.__aun_cmp_poll = null;
      }
      return;
    }
    const names = collectNames(node);
    const key = JSON.stringify(names);
    if (key !== getState(node).namesKey) {
      refreshMeta(node);
    }
    applySliderVisibility(node);
  }, 400);
}

// ── Collapse connections (mirrors the other AUN collapse extensions) ──

function isCollapsed(node) {
  return !!(node?.properties?.[COLLAPSE_KEY]);
}

// In collapsed mode only the pair/frame selectors (and the image area) stay
// visible; the extra widgets (save_active, prefix) are hidden.
const COLLAPSE_KEEP_WIDGETS = new Set(["pair", "frame", "__aun_image_slider"]);

function applyCollapseWidgets(node) {
  if (!node?.widgets) return;
  const collapsed = isCollapsed(node);
  for (const w of node.widgets) {
    if (!w?.name || w.name === "__aun_image_slider") continue;
    applyWidgetHiddenState(w, collapsed && !COLLAPSE_KEEP_WIDGETS.has(w.name));
  }
}

function toggleCollapse(node) {
  if (!node) return;
  node.properties = node.properties || {};
  const goingToCollapse = !isCollapsed(node);

  if (goingToCollapse) {
    // Save expanded height before collapsing so it survives F5.
    node.properties[SAVED_HEIGHT_KEY] = node.size?.[1] ?? node.__aun_cmp_userHeight;
  } else {
    // Save collapsed height before expanding so it survives F5.
    node.properties[SAVED_HEIGHT_COLLAPSED_KEY] = node.size?.[1] ?? node.__aun_cmp_userHeight;
  }

  node.properties[COLLAPSE_KEY] = goingToCollapse;
  applyCollapseWidgets(node);
  refreshMeta(node);

  if (!goingToCollapse) {
    // Restore expanded height when un-collapsing.
    const expandedH = node.properties[SAVED_HEIGHT_KEY] || node.computeSize()?.[1];
    if (expandedH > 0) {
      node.__aun_cmp_userHeight = expandedH;
      node.size[1] = expandedH;
    }
    delete node.properties[SAVED_HEIGHT_COLLAPSED_KEY];
  } else {
    // Restore collapsed height when collapsing.
    const collapsedH = node.properties[SAVED_HEIGHT_COLLAPSED_KEY];
    if (typeof collapsedH === "number" && collapsedH > 0) {
      node.__aun_cmp_userHeight = collapsedH;
      node.size[1] = collapsedH;
    }
    delete node.properties[SAVED_HEIGHT_KEY];
  }

  node.graph?.setDirtyCanvas(true, true);
}

// Is the node's screen rect (mostly) outside the visible canvas? Off-screen
// nodes are culled by LiteGraph, so their widget draw()/offsetDOMWidget never
// run and the DOM overlay would otherwise stay pinned at the old screen spot
// (e.g. after a bookmark viewport jump), floating with no node body to dismiss.
function isComparerOffScreen(node, canvas) {
  if (!canvas?.canvas || !node?.pos || !node?.size) return false;
  const ds = canvas.ds;
  if (!ds) return false;
  const rect = canvas.canvas.getBoundingClientRect();
  const scale = ds.scale;
  const x = rect.left + (node.pos[0] + ds.offset[0]) * scale;
  const y = rect.top + (node.pos[1] + ds.offset[1]) * scale;
  const w = (node.size[0] || 300) * scale;
  const h = (node.size[1] || 100) * scale;
  const m = 64;
  return x + w < -m || x > rect.width + m || y + h < -m || y > rect.height + m;
}

// Hide the DOM overlay when the node is natively collapsed (collapse dot)
// or scrolled off-screen. When visible, draw() shows and positions it, so
// this function only ever hides.
function applySliderVisibility(node) {
  const w = getState(node)?.sliderWidget;
  if (!w?.inputEl) return;
  if (node?.flags?.collapsed || isComparerOffScreen(node, app?.canvas)) {
    w.inputEl.style.display = "none";
  }
}

// Per-frame enforcement: the frontend may re-show DOM widgets on graph
// reload / tab switch, and viewport jumps must drop off-screen overlays,
// so keep the overlay in sync continuously (mirrors AUNShowAnyMulti).
function startSliderVisibilityLoop() {
  function tick() {
    for (const node of COLLAPSED_NODES) {
      applySliderVisibility(node);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
startSliderVisibilityLoop();

// Detect resize-handle drags on the LiteGraph canvas so that computeSize
// can skip the Math.max(userH) guard while the user is actively dragging.
// Without this, computeSize enforces the old userH as a minimum during the
// drag, preventing the user from shrinking the node below its previous height.
(function setupResizeDetection() {
  const RESIZE_HANDLE_PX = 10;
  let attached = false;
  function getCanvasPos(e) {
    const c = app?.canvas;
    if (!c?.canvas || !c.ds) return null;
    const rect = c.canvas.getBoundingClientRect();
    const ds = c.ds;
    return {
      x: (e.clientX - rect.left) / ds.scale - ds.offset[0],
      y: (e.clientY - rect.top) / ds.scale - ds.offset[1],
    };
  }
  function onPointerDown(e) {
    const c = app?.canvas;
    if (!c || e.button !== 0) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    // node_over is set by LiteGraph during mousemove, available on click.
    const node = c.node_over;
    if (!node || node.__aun_cmp_userHeight == null) return;
    const nx = node.pos[0];
    const ny = node.pos[1];
    const nw = node.size?.[0] ?? 200;
    const nh = node.size?.[1] ?? 100;
    // LiteGraph resize handle: 10×10 px square at bottom-right corner.
    if (
      pos.x >= nx + nw - RESIZE_HANDLE_PX &&
      pos.x <= nx + nw &&
      pos.y >= ny + nh - RESIZE_HANDLE_PX &&
      pos.y <= ny + nh
    ) {
      node.__aun_cmp_resizing = true;
    }
  }
  function onPointerUp() {
    const c = app?.canvas;
    if (!c) return;
    // Clear all nodes — the pointer may have moved off the original node.
    for (const n of c.graph?.nodes ?? []) {
      if (n.__aun_cmp_resizing) n.__aun_cmp_resizing = false;
    }
  }
  function tryAttach() {
    if (attached) return;
    const canvas = app?.canvas?.canvas;
    if (!canvas) return;
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    attached = true;
  }
  tryAttach();
  if (!attached) {
    const poll = setInterval(() => {
      tryAttach();
      if (attached) clearInterval(poll);
    }, 200);
  }
})();

const SAVED_HEIGHT_KEY = "__aun_cmp_saved_height";
const SAVED_HEIGHT_COLLAPSED_KEY = "__aun_cmp_saved_height_collapsed";

function applyCollapseHooks(node) {
  if (node.__aun_cmp_collapse_hooked) return;

  // Restore persisted height from properties, falling back to current size.
  node.properties = node.properties || {};
  const collapsed = isCollapsed(node);
  const savedKey = collapsed ? SAVED_HEIGHT_COLLAPSED_KEY : SAVED_HEIGHT_KEY;
  const persistedH = node.properties[savedKey];
  if (typeof persistedH === "number" && persistedH > 0) {
    node.__aun_cmp_userHeight = persistedH;
    // Apply immediately so the height is correct even before computeSize runs.
    node.size[1] = persistedH;
  } else {
    node.__aun_cmp_userHeight = node.size?.[1] ?? 0;
  }

  const origGetInputPos = node.getInputPos?.bind(node);
  node.getInputPos = function (index) {
    if (this.properties?.[COLLAPSE_KEY]) return origGetInputPos(0);
    return origGetInputPos(index);
  };

  const origComputeSize = (node.computeSize || (() => node.size)).bind(node);
  node.computeSize = function (out) {
    const s = origComputeSize(out);
    if (s && s.length >= 2) {
      if (this.properties?.[COLLAPSE_KEY]) {
        const ni =
          this.inputs?.filter((i) => !(this.widgets?.length && i.widget)).length || 0;
        const no = this.outputs?.length || 0;
        const rows = Math.max(ni, no);
        s[1] -= Math.max(0, rows - 1) * LiteGraph.NODE_SLOT_HEIGHT;
      }
      const userH = this.__aun_cmp_userHeight;
      // Skip height enforcement during active resize drag so the user can
      // decrease the height freely.  After the drag ends, the new height
      // is persisted by onResize and Math.max resumes protecting it from
      // LiteGraph's computeSize auto-shrink on subsequent layout passes.
      // Check both our flag and LiteGraph's resizing_node for robustness.
      const resizing = this.__aun_cmp_resizing || app?.canvas?.resizing_node === this;
      if (userH > 0 && !resizing) s[1] = Math.max(s[1], userH);
    }
    return s;
  };

  // Track the user-set height and persist to properties (both expanded/collapsed).
  const origResize = node.onResize;
  node.onResize = function () {
    origResize?.apply(this, arguments);
    // Skip saving during configure phase to prevent layout resizes from
    // overwriting the restored user height.
    if (this.__aun_configuring) return;
    this.__aun_cmp_userHeight = this.size?.[1] ?? this.__aun_cmp_userHeight;
    const key = this.properties?.[COLLAPSE_KEY]
      ? SAVED_HEIGHT_COLLAPSED_KEY
      : SAVED_HEIGHT_KEY;
    this.properties[key] = this.__aun_cmp_userHeight;
  };

  // The native collapse dot toggles flags.collapsed; keep the DOM overlay in sync.
  const origCollapse = node.collapse;
  if (typeof origCollapse === "function") {
    node.collapse = function () {
      const r = origCollapse.apply(this, arguments);
      applySliderVisibility(this);
      return r;
    };
  }

  // On F5 / tab switch the graph is re-configured: nodeCreated runs before
  // properties are restored, so applyCollapseWidgets at that point sees the
  // pre-restore (non-collapsed) state. Re-apply once configure finishes.
  const origConfigure = node.onConfigure;
  node.onConfigure = function () {
    // Flag to prevent onResize from overwriting restored height during layout.
    this.__aun_configuring = true;
    origConfigure?.apply(this, arguments);
    // Restore persisted height from properties based on collapsed state.
    const collapsed = isCollapsed(this);
    const savedKey = collapsed ? SAVED_HEIGHT_COLLAPSED_KEY : SAVED_HEIGHT_KEY;
    const persistedH = this.properties?.[savedKey];
    if (typeof persistedH === "number" && persistedH > 0) {
      this.__aun_cmp_userHeight = persistedH;
      this.size[1] = persistedH;
    }
    applyCollapseWidgets(this);
    this.__aun_configuring = false;
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
    toggleCollapse(this);
  };

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    if (origMenu) origMenu.apply(this, [canvas, options]);
    const on = isCollapsed(this);
    options.push(null, {
      content: on ? "Show Connections" : "Collapse Connections",
      callback: () => toggleCollapse(this),
    });
    options.push({
      content: `Slider Mode: ${this.properties?.comparer_mode === "Slide" ? "Slide" : "Drag"}`,
      callback: () => {
        this.properties.comparer_mode =
          this.properties.comparer_mode === "Slide" ? "Drag" : "Slide";
        this.graph?.setDirtyCanvas(true, true);
      },
    });

    const w = getState(this)?.sliderWidget;
    const cur = w?.__currentLeft;
    const curR = w?.__currentRight;
    if (cur || curR) {
      options.push(null);
      if (cur) {
        options.push(
          {
            content: "Open Left in New Tab",
            callback: () => openUrl(buildImageUrl(cur)),
          },
          {
            content: "Download Left Image",
            callback: () => downloadUrl(buildImageUrl(cur), cur.filename || "left.png"),
          },
        );
      }
      if (curR) {
        options.push(
          {
            content: "Open Right in New Tab",
            callback: () => openUrl(buildImageUrl(curR)),
          },
          {
            content: "Download Right Image",
            callback: () => downloadUrl(buildImageUrl(curR), curR.filename || "right.png"),
          },
        );
      }
    }
  };

  node.__aun_cmp_collapse_hooked = true;

  if (isCollapsed(node)) {
    applyCollapseWidgets(node);
  }
}

function setupNode(node) {
  if (!node) return;
  if (node.comfyClass !== NODE_TYPE && node.type !== NODE_TYPE) return;

  const state = getState(node);

  if (!state.done) {
    state.done = true;

    // Suppress the built-in image preview; our DOM slider owns the display.
    node.hideOutputImages = true;

    // Ensure comparer_mode property exists with a default.
    node.properties = node.properties || {};
    if (typeof node.properties.comparer_mode !== "string") {
      node.properties.comparer_mode = "Drag";
    }

    clearStaleSliderWidget(node);
    applyCollapseHooks(node);
    COLLAPSED_NODES.add(node);

    const fw = getWidgetByName(node, "frame");
    if (fw) {
      ensureHiddenAware(fw);
      // Old workflows saved numeric frame values; keep the combo value as a
      // valid string from its current option list before any execution.
      const values = Array.isArray(fw.options?.values) ? fw.options.values : null;
      if (values?.length && !values.includes(String(fw.value))) {
        const num = Math.round(Number(fw.value)) || 1;
        fw.value = String(Math.max(1, Math.min(num, values.length)));
      }
      if (!fw.__aun_cmp_hooked) {
        fw.__aun_cmp_hooked = true;
        const origF = fw.callback;
        fw.callback = function (value) {
          origF?.call(this, value);
          renderCachedPair(node);
        };
      }
    }

    const pw = getWidgetByName(node, "pair");
    if (pw && !pw.__aun_cmp_hooked) {
      pw.__aun_cmp_hooked = true;
      const orig = pw.callback;
      pw.callback = function (value) {
        orig?.call(this, value);
        refreshMeta(node);
      };
    }

    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function (slotType, index, linked, linkInfo) {
      origConn?.apply(this, arguments);
      refreshMeta(this);
    };

    const origOWC = node.onWidgetChanged;
    node.onWidgetChanged = function (name, value) {
      origOWC?.apply(this, arguments);
      if (name === "frame") {
        renderCachedPair(this);
    } else if (name === "pair") {
      refreshMeta(this);
    }
  };

  const origRemoved = node.onRemoved;
  node.onRemoved = function () {
    const s = STATE.get(this);
    if (s?.sliderWidget) {
      try {
        s.sliderWidget.onRemoved?.();
      } catch (_) {}
      s.sliderWidget = null;
    }
    if (this.__aun_cmp_poll) {
      clearInterval(this.__aun_cmp_poll);
      this.__aun_cmp_poll = null;
    }
    COLLAPSED_NODES.delete(this);
    STATE.delete(this);
    return origRemoved?.apply(this, arguments);
  };

  refreshMeta(node);
  startPoll(node);
  }

  // Idempotent: re-apply the collapsed widget state whenever the node is
  // loaded/configured (nodeCreated fires before properties are restored, so
  // the post-configure pass is the one that actually hides the widgets).
  applyCollapseWidgets(node);
}
registerLegacyExtension({
  name: "AUN.ImageSliderComparer",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_TYPE) return;

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const r = originalOnExecuted ? originalOnExecuted.call(this, message) : undefined;
      // Suppress any default inline preview; our DOM slider owns the display.
      if (this) this.imgs = [];
      try {
        // Backend sends "comparer" as a list (ComfyUI ui values must be lists).
        const cmp = Array.isArray(message?.comparer)
          ? message.comparer[0]
          : message?.comparer;
        renderSlider(this, cmp);
      } catch (e) {
        console.warn("[AUN] ImageSliderComparer render error", e);
      }
      return r;
    };
  },

  nodeCreated(node) {
    setupNode(node);
  },

  loadedGraphNode(node) {
    setupNode(node);
  },

  nodeInputConnected(node, inputSlot) {
    if (node.comfyClass === NODE_TYPE) refreshMeta(node);
  },

  nodeInputDisconnected(node, inputSlot) {
    if (node.comfyClass === NODE_TYPE) refreshMeta(node);
  },
});
