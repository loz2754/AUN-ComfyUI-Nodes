import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { getWidget } from "./widgets.js";
import { withUESuppressed } from "./index.js";

const NODE_CLASS = "AUNAddToPromptMulti";
const MAX_ADDONS = 10;
const PROP_COMPACT = "_AUN_compactMode";

const TITLE_H = 28;
const ROW_H = 22;
const ROW_GAP = 2;
const SIDE_PAD = 8;
const BADGE_PAD = 6;
const LINE_H = 16;
const FOOTER_MIN_H = 2 * LINE_H + 8;
const SCROLLBAR_W = 4;
const MODE_CYCLE = { off: "on", on: "random", random: "off" };
const ORDER_TOGGLE = { prompt_first: "addon_first", addon_first: "prompt_first" };

function clampAddons(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 1 : Math.max(1, Math.min(MAX_ADDONS, n));
}

// NOTE: local isCompact/setCompact kept intentionally — strict `=== true`
// semantics (shared utils.js uses truthy check).
function isCompact(node) {
  return node?.properties?.[PROP_COMPACT] === true;
}

function setCompact(node, val) {
  if (!node.properties) node.properties = {};
  node.properties[PROP_COMPACT] = !!val;
}

function getAddonLabel(node, index) {
  const textW = getWidget(node, `text_to_add${index}`);
  if (textW && textW.value && textW.value.trim()) {
    return textW.value.trim().split("\n")[0];
  }
  return `Addon ${index}`;
}

function ensureHiddenAware(widget) {
  if (!widget || widget.__aun_hiddenAware) return;
  widget.__aun_hiddenAware = true;
  const isMultiline =
    widget.type === "customtext" || widget.options?.multiline === true;
  const orig = typeof widget.computeSize === "function" ? widget.computeSize : null;
  widget.computeSize = function (...args) {
    if (this.hidden) return [args[0] ?? 200, 0];
    let [w, h] = orig
      ? orig.apply(this, args)
      : [args[0] ?? 200, this.comfyHeight ?? 20];
    if (isMultiline) h = Math.max(h, 100);
    return [w, h];
  };
  if (isMultiline && widget.inputEl) {
    widget.inputEl.style.minHeight = "80px";
  }
}

function applyWidgetHiddenState(widget, hidden) {
  if (!widget) return;
  ensureHiddenAware(widget);
  widget.hidden = !!hidden;
  if (widget.flags) widget.flags.hidden = !!hidden;
  if (widget.options) widget.options.noDraw = !!hidden;
  if (widget.inputEl?.style) widget.inputEl.style.display = hidden ? "none" : "";
}

function updateNodeVisibility(node) {
  const numAddons = clampAddons(getWidget(node, "num_addons")?.value ?? 1);
  const compact = isCompact(node);

  applyWidgetHiddenState(getWidget(node, "master_prompt"), compact);
  applyWidgetHiddenState(getWidget(node, "num_addons"), compact);

  for (let i = 1; i <= MAX_ADDONS; i++) {
    const hiddenInFull = i > numAddons;
    const hidden = compact || hiddenInFull;
    applyWidgetHiddenState(getWidget(node, `text_to_add${i}_mode`), hidden);
    applyWidgetHiddenState(getWidget(node, `text_to_add${i}`), hidden);
    applyWidgetHiddenState(getWidget(node, `order${i}`), hidden);
  }

  updateNodeSize(node);
  node.setDirtyCanvas(true, true);
}

function updateNodeSize(node) {
  // Never fight the native title-only collapse, and never shrink a size the
  // user has set: only grow when below the minimum.
  if (node.flags?.collapsed) return;
  node.widgets_dirty = true;
  let h;
  try {
    h = node.computeSize()?.[1];
  } catch {
    h = node.size?.[1] ?? 200;
  }
  if (typeof h !== "number" || !isFinite(h)) h = node.size?.[1] ?? 200;

  const compact = isCompact(node);
  if (compact) {
    const numAddons = clampAddons(getWidget(node, "num_addons")?.value ?? 1);
    const minH = TITLE_H + 4 + numAddons * (ROW_H + ROW_GAP) + 4 + FOOTER_MIN_H + 2;
    if ((node.size?.[1] ?? 0) < minH) node.setSize([node.size[0], minH]);
  } else {
    if ((node.size?.[1] ?? 0) < h) node.setSize([node.size[0], h]);
  }
}

function ellipsizeText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "...").width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + "...";
}

function extractPromptFromOutput(output) {
  if (!output) return null;
  let text = output.prompt ?? output["0"] ?? (Array.isArray(output) ? output[0] : null);
  if (Array.isArray(text)) text = text[0];
  return text != null ? String(text) : null;
}

function pullNodeOutput(node) {
  if (!node || !app) return null;
  const key = String(node.id);
  const out = app.nodeOutputs?.[key];
  return out ? extractPromptFromOutput(out) : null;
}

function getResolvedText(node) {
  if (node.__aun_lastOutput != null) return node.__aun_lastOutput;
  const fromApp = pullNodeOutput(node);
  if (fromApp != null) {
    node.__aun_lastOutput = fromApp;
    node.setDirtyCanvas?.(true, true);
    return fromApp;
  }
  return "";
}

function getFooterRect(node) {
  const numAddons = clampAddons(getWidget(node, "num_addons")?.value ?? 1);
  const rowsBottom = TITLE_H + 4 + numAddons * (ROW_H + ROW_GAP) + 4;
  const w = node?.size?.[0] ?? 300;
  const h = node?.size?.[1] ?? 200;
  return { x0: 8, x1: w - 8, y0: rowsBottom + 2, y1: h - 4, w, h };
}

function wrapTextLines(ctx, text, maxW) {
  const out = [];
  if (!text) return out;
  const paragraphs = String(text).split("\n");
  for (const para of paragraphs) {
    if (para === "") { out.push(""); continue; }
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function getScroll(node) {
  if (!node.__aun_promptScroll) node.__aun_promptScroll = { offset: 0 };
  return node.__aun_promptScroll;
}

function getFooterLines(ctx, node, rect) {
  ctx.font = "12px sans-serif";
  const maxW = Math.max(10, rect.x1 - rect.x0 - 8 - SCROLLBAR_W);
  const resolved = getResolvedText(node);
  const lines = resolved ? wrapTextLines(ctx, resolved, maxW) : [];
  return { lines, maxW };
}

function getMaxOffset(node, ctx) {
  const rect = getFooterRect(node);
  const { lines } = getFooterLines(ctx, node, rect);
  const boxH = Math.max(0, rect.y1 - rect.y0);
  const viewLines = Math.max(1, Math.floor((boxH - 8) / LINE_H));
  return Math.max(0, lines.length - viewLines);
}

function drawResolvedFooter(ctx, node) {
  const rect = getFooterRect(node);
  const { x0, x1, y0, y1 } = rect;
  const boxH = Math.max(0, y1 - y0);
  if (boxH < 8) { return; }
  const w = rect.w, h = rect.h;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x0, y0, x1 - x0, boxH, [0, 0, 4, 4]);
  } else {
    ctx.rect(x0, y0, x1 - x0, boxH);
  }
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.fillRect(x0, y0, x1 - x0, 1);

  const { lines, maxW } = getFooterLines(ctx, node, rect);
  const viewLines = Math.max(1, Math.floor((boxH - 8) / LINE_H));
  const maxOffset = Math.max(0, lines.length - viewLines);
  const scroll = getScroll(node);
  if (scroll.offset > maxOffset) scroll.offset = maxOffset;
  if (scroll.offset < 0) scroll.offset = 0;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "12px sans-serif";

  // clip to footer box
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0 + 2, x1 - x0, boxH - 4);
  ctx.clip();

  if (lines.length === 0) {
    ctx.fillStyle = "#888";
    ctx.textBaseline = "middle";
    ctx.fillText("(empty)", x0 + 4, y0 + boxH / 2);
  } else {
    ctx.fillStyle = "#eee";
    let lineY = y0 + 4;
    for (let i = 0; i < viewLines; i++) {
      const idx = scroll.offset + i;
      if (idx >= lines.length) break;
      ctx.fillText(lines[idx], x0 + 4, lineY, maxW);
      lineY += LINE_H;
    }
  }
  ctx.restore();

  // scrollbar
  if (maxOffset > 0) {
    const trackX = x1 - SCROLLBAR_W - 2;
    const trackY0 = y0 + 4;
    const trackH = boxH - 8;
    const thumbH = Math.max(12, (trackH * viewLines) / lines.length);
    const thumbY = trackY0 + (trackH - thumbH) * (scroll.offset / maxOffset);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(trackX, trackY0, SCROLLBAR_W, trackH);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(trackX, thumbY, SCROLLBAR_W, thumbH);
  }

  ctx.restore();
}

function scrollBy(node, delta) {
  const ctx = app?.canvas?.ctx;
  if (!ctx) return false;
  const maxOffset = getMaxOffset(node, ctx);
  if (maxOffset <= 0) return false;
  const scroll = getScroll(node);
  const next = Math.max(0, Math.min(maxOffset, scroll.offset + delta));
  if (next === scroll.offset) return false;
  scroll.offset = next;
  node.setDirtyCanvas?.(true, true);
  return true;
}

function isOverFooter(node, localX, localY) {
  const r = getFooterRect(node);
  return localX >= r.x0 && localX <= r.x1 && localY >= r.y0 && localY <= r.y1;
}

function isOverScrollbar(node, localX, localY) {
  const r = getFooterRect(node);
  const trackX = r.x1 - SCROLLBAR_W - 2;
  return localX >= trackX - 4 && localX <= r.x1 && localY >= r.y0 + 4 && localY <= r.y1 - 4;
}

function installGlobalWheelListener() {
  if (installGlobalWheelListener.done) return;
  installGlobalWheelListener.done = true;
  document.addEventListener("wheel", (e) => {
    const canvas = app?.canvas?.canvas;
    if (!canvas || e.target !== canvas) return;
    const gm = app.canvas.graph_mouse;
    if (!Array.isArray(gm)) return;
    for (const node of app.graph?._nodes || []) {
      if (node.type !== NODE_CLASS && node.comfyClass !== NODE_CLASS) continue;
      if (!isCompact(node) || node.flags?.collapsed) continue;
      const local = [gm[0] - node.pos[0], gm[1] - node.pos[1]];
      if (!isOverFooter(node, local[0], local[1])) continue;
      const delta = (e.deltaY || 0) > 0 ? 1 : -1;
      scrollBy(node, delta);
      // Always consume the wheel while over the footer so the canvas never
      // zooms/scrolls, even at the first/last line.
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }, true);
}

function handleFooterMouseDown(node, event, pos) {
  if (!isCompact(node) || node.flags?.collapsed) return false;
  if (!Array.isArray(pos)) return false;
  const [lx, ly] = pos;
  if (!isOverFooter(node, lx, ly)) return false;
  // Only the scrollbar consumes the click; footer text stays draggable.
  if (!isOverScrollbar(node, lx, ly)) return false;

  const r = getFooterRect(node);
  const ctx = app?.canvas?.ctx;
  const maxOffset = getMaxOffset(node, ctx);
  if (maxOffset <= 0) return true;

  const trackY0 = r.y0 + 4;
  const trackH = Math.max(1, r.y1 - r.y0 - 8);
  const { lines } = getFooterLines(ctx, node, r);
  const viewLines = Math.max(1, Math.floor((r.y1 - r.y0 - 8) / LINE_H));
  const thumbH = Math.max(12, (trackH * viewLines) / Math.max(1, lines.length));
  const scroll = getScroll(node);
  const thumbTop = trackY0 + (trackH - thumbH) * (scroll.offset / maxOffset);

  if (ly < thumbTop) { scrollBy(node, -viewLines); return true; }
  if (ly > thumbTop + thumbH) { scrollBy(node, viewLines); return true; }

  const drag = { startY: ly, startOffset: scroll.offset, trackH, total: lines.length, maxOffset };
  node.__aun_promptScrollDrag = drag;
  const onMove = (ev) => {
    if (!node.graph || !node.__aun_promptScrollDrag) { cleanup(); return; }
    const gm = app?.canvas?.graph_mouse;
    if (!Array.isArray(gm)) return;
    const localY = gm[1] - node.pos[1];
    const next = Math.round(drag.startOffset + ((localY - drag.startY) / drag.trackH) * drag.total);
    scroll.offset = Math.max(0, Math.min(drag.maxOffset, next));
    node.setDirtyCanvas?.(true, true);
  };
  const cleanup = () => {
    if (node.__aun_promptScrollDrag === drag) node.__aun_promptScrollDrag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", cleanup);
    window.removeEventListener("pointercancel", cleanup);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", cleanup);
  window.addEventListener("pointercancel", cleanup);
  return true;
}

installGlobalWheelListener();

function drawCompactRows(ctx, node) {
  const hitAreas = [];
  const numAddons = clampAddons(getWidget(node, "num_addons")?.value ?? 1);
  const nodeW = node.size[0] || 300;

  for (let i = 1; i <= numAddons; i++) {
    const rowY = TITLE_H + 4 + (i - 1) * (ROW_H + ROW_GAP);

    const modeW = getWidget(node, `text_to_add${i}_mode`);
    const modeVal = modeW?.value || "off";
    const modeLabel = modeVal === "on" ? "On" : modeVal === "random" ? "Rnd" : "Off";

    const orderW = getWidget(node, `order${i}`);
    const orderVal = orderW?.value || "prompt_first";
    const orderLabel = orderVal === "addon_first" ? "Before" : "After";

    ctx.save();
    ctx.font = "bold 11px sans-serif";
    const modeBadgeW = ctx.measureText(modeLabel).width + BADGE_PAD * 2;
    ctx.font = "11px sans-serif";
    const orderBadgeW = ctx.measureText(orderLabel).width + BADGE_PAD * 2;
    ctx.restore();

    const modeX = SIDE_PAD;
    const modeY = rowY + (ROW_H - 16) / 2;
    const orderX = nodeW - SIDE_PAD - orderBadgeW;
    const orderY = rowY + (ROW_H - 16) / 2;
    const labelX = modeX + modeBadgeW + 6;
    const labelMaxW = orderX - 6 - labelX;

    ctx.save();
    ctx.fillStyle = modeVal === "on" ? "#2a6e3f" : modeVal === "random" ? "#6e5a2a" : "#555";
    ctx.beginPath();
    ctx.roundRect(modeX, modeY, modeBadgeW, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#ddd";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(modeLabel, modeX + modeBadgeW / 2, modeY + 8);
    ctx.restore();
    hitAreas.push({ type: "mode", index: i, x: modeX, y: modeY, w: modeBadgeW, h: 16 });

    if (labelMaxW > 4) {
      const labelText = getAddonLabel(node, i);
      ctx.save();
      ctx.font = "12px sans-serif";
      const displayText = ellipsizeText(ctx, labelText, labelMaxW);
      ctx.fillStyle = "#eee";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(displayText, labelX, rowY + ROW_H / 2);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = orderVal === "addon_first" ? "#5a4a7a" : "#3a6a8a";
    ctx.beginPath();
    ctx.roundRect(orderX, orderY, orderBadgeW, 16, 3);
    ctx.fill();
    ctx.fillStyle = "#ddd";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(orderLabel, orderX + orderBadgeW / 2, orderY + 8);
    ctx.restore();
    hitAreas.push({ type: "order", index: i, x: orderX, y: orderY, w: orderBadgeW, h: 16 });
  }

  node.__aun_hitAreas = hitAreas;
}

function isOverHitArea(node, pos) {
  if (!node.__aun_hitAreas) return false;
  const [mx, my] = pos;
  return node.__aun_hitAreas.some(
    (a) => mx >= a.x && mx <= a.x + a.w && my >= a.y && my <= a.y + a.h
  );
}

function toggleCompact(node) {
  const wasCompact = isCompact(node);
  // Remember the height the user set for the mode we are leaving.
  if (wasCompact) node.__aun_savedCompactH = node.size?.[1];
  else node.__aun_savedFullH = node.size?.[1];

  setCompact(node, !wasCompact);
  updateNodeVisibility(node);

  // Adapt the height to the new mode instead of keeping the other mode's height.
  requestAnimationFrame(() => {
    if (!node || node.flags?.collapsed) return;
    const nowCompact = isCompact(node);
    if (nowCompact) {
      const numAddons = clampAddons(getWidget(node, "num_addons")?.value ?? 1);
      const minH = TITLE_H + 4 + numAddons * (ROW_H + ROW_GAP) + 4 + FOOTER_MIN_H + 2;
      const saved = node.__aun_savedCompactH;
      const target = Math.max(minH, (typeof saved === "number" && saved > 0) ? saved : minH);
      node.setSize([node.size[0], target]);
    } else {
      let h;
      try { h = node.computeSize()?.[1]; } catch { h = node.size?.[1] ?? 200; }
      if (typeof h !== "number" || !isFinite(h)) h = node.size?.[1] ?? 200;
      const saved = node.__aun_savedFullH;
      const target = Math.max(h, (typeof saved === "number" && saved > 0) ? saved : h);
      node.setSize([node.size[0], target]);
    }
    node.setDirtyCanvas?.(true, true);
  });
}

let _executedBound = false;
function bindExecutedRedraw() {
  if (_executedBound) return;
  _executedBound = true;
  api.addEventListener("executed", ({ detail }) => {
    const nodeId = String(detail.display_node || detail.node);
    const output = detail.output;
    if (!output) return;
    app.graph?._nodes?.forEach(n => {
      if (n.type !== NODE_CLASS || String(n.id) !== nodeId) return;
      let text = output.prompt ?? output["0"] ?? (Array.isArray(output) ? output[0] : null);
      if (Array.isArray(text)) text = text[0];
      if (text != null) {
        n.__aun_lastOutput = String(text);
        const sc = n.__aun_promptScroll;
        if (sc) sc.offset = 0;
        n.setDirtyCanvas?.(true, true);
      }
    });
  });
}

function patchNode(node) {
  if (node.__aun_patched) return;
  node.__aun_patched = true;
  bindExecutedRedraw();

  if (typeof node.properties?.[PROP_COMPACT] !== "boolean") {
    setCompact(node, true);
  }

  for (const w of node.widgets || []) {
    ensureHiddenAware(w);
  }

  const numWidget = getWidget(node, "num_addons");
  if (numWidget && !numWidget.__aun_hasCb) {
    numWidget.__aun_hasCb = true;
    const origCb = numWidget.callback;
    numWidget.callback = function (v) {
      origCb?.apply(this, arguments);
      updateNodeVisibility(node);
    };
  }

  // onExecuted fallback in case the API ever calls it directly
  const origOnExecuted = node.onExecuted;
  node.onExecuted = function (message) {
    origOnExecuted?.apply(this, arguments);
    if (message) {
      let prompt = message.prompt ?? message["0"] ?? message[0];
      if (Array.isArray(prompt)) prompt = prompt[0];
      if (prompt != null) {
        this.__aun_lastOutput = String(prompt);
        const sc = this.__aun_promptScroll;
        if (sc) sc.offset = 0;
        this.setDirtyCanvas?.(true, true);
      }
    }
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    origDrawFg?.apply(this, arguments);
    // Native collapse (title-only) must hide the compact overlays too.
    if (this.flags?.collapsed) {
      delete this.__aun_hitAreas;
      return;
    }
    if (isCompact(this)) {
      drawCompactRows(ctx, this);
      drawResolvedFooter(ctx, this);
    }
  };

  const origMouseDown = node.onMouseDown;
  node.onMouseDown = function (event, pos) {
    if (!this.flags?.collapsed && isCompact(this) && pos && pos.length >= 2) {
      if (handleFooterMouseDown(this, event, pos)) return true;
    }
    if (!this.flags?.collapsed && isCompact(this) && pos && pos.length >= 2 && this.__aun_hitAreas) {
      const [mx, my] = pos;
      for (const area of this.__aun_hitAreas) {
        if (mx >= area.x && mx <= area.x + area.w && my >= area.y && my <= area.y + area.h) {
          if (area.type === "mode") {
            const w = getWidget(this, `text_to_add${area.index}_mode`);
            if (!w) break;
            w.value = MODE_CYCLE[w.value] || "off";
            if (w.callback) w.callback(w.value);
          } else if (area.type === "order") {
            const w = getWidget(this, `order${area.index}`);
            if (!w) break;
            w.value = ORDER_TOGGLE[w.value] || "prompt_first";
            if (w.callback) w.callback(w.value);
          }
          this.setDirtyCanvas(true, true);
          return true;
        }
      }
    }
    return origMouseDown?.apply(this, arguments);
  };

  const origWheel = node.onMouseWheel;
  node.onMouseWheel = function (event, pos, delta) {
    if (!this.flags?.collapsed && isCompact(this) && pos && pos.length >= 2) {
      const r = getFooterRect(this);
      const [lx, ly] = pos;
      if (lx >= r.x0 && lx <= r.x1 && ly >= r.y0 && ly <= r.y1) {
        const d = ((delta != null ? delta : (event?.deltaY ?? 0)) > 0) ? 1 : -1;
        scrollBy(this, d);
        return true;
      }
    }
    return origWheel?.apply(this, arguments);
  };

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);
    if (app?.canvas?.active_widget) return;
    if (isCompact(this) && pos && pos.length >= 2 && isOverHitArea(this, pos)) return;
    // AUN double-click takes precedence over UE's restrictions dialog.
    withUESuppressed(this, () => toggleCompact(this));
  };

  const origExtraMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (graphcanvas, options) {
    origExtraMenu?.apply(this, arguments);
    options.push({
      content: isCompact(this) ? "AUN: Show all controls" : "AUN: Compact mode",
      callback: () => toggleCompact(this),
    });
  };

  const origConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    origConfigure?.apply(this, arguments);
    updateNodeVisibility(this);
  };

  const origResize = node.onResize;
  node.onResize = function () {
    const result = origResize?.apply(this, arguments);
    if (!this.flags?.collapsed && isCompact(this)) {
      const numAddons = clampAddons(getWidget(this, "num_addons")?.value ?? 1);
      const minH = TITLE_H + 4 + numAddons * (ROW_H + ROW_GAP) + 4 + FOOTER_MIN_H + 2;
      if (this.size[1] < minH) this.size[1] = minH;
    }
    return result;
  };

  const origRemoved = node.onRemoved;
  node.onRemoved = function () {
    delete this.__aun_hitAreas;
    delete this.__aun_patched;
    origRemoved?.apply(this, arguments);
  };

  updateNodeVisibility(node);
}

app.registerExtension({
  name: "AUN.AddToPromptMulti.Canvas",
  nodeCreated(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    patchNode(node);
  },
  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    patchNode(node);
  },
});
