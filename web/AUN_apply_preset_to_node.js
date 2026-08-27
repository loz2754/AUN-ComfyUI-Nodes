// ── Apply Preset To Node – Live Widget Sync + Confirmation Footer ──
// After AUNApplyPresetToNode applies values at execution time, this:
//   1. updates the target node's widgets so the canvas reflects the applied
//      values without a manual refresh, and
//   2. draws a confirmation footer on the Apply node showing what was
//      applied (or why nothing was applied).
// ────────────────────────────────────────────────────────────────────

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { findNodeByIdentifier, forceRedraw, isNodeCollapsed, getWidget, applyWidgetHiddenState, isCompact, setCompact } from "./index.js";

const NODE_CLASS = "AUNApplyPresetToNode";
const TITLE_H = 28;
const FOOTER_H = 120;
const FOOTER_PAD = 6;
const FOOTER_BOTTOM = 6;
const LINE_H = 17;
const HEADER_H = 20;
const SCROLLBAR_W = 4;
const TEXT_CAP = 130;

function setWidgetValue(widget, value) {
  if (!widget) return;
  const type = widget.type || "";
  if (type === "combo") {
    const options = widget.options?.values || [];
    const asString = String(value);
    const valid = options.map((o) => (o && typeof o === "object" ? (o.value ?? o.content ?? "") : String(o)));
    if (valid.length && !valid.includes(asString)) return;
    widget.value = asString;
  } else if (type === "toggle" || type === "boolean") {
    widget.value = value === true || value === "true" || value === "True";
  } else if (type === "number" || type === "slider") {
    const num = Number(value);
    widget.value = Number.isFinite(num) ? num : value;
  } else {
    widget.value = value;
  }
}

function getFooterContent(info) {
  if (!info) {
    return {
      header: { text: "Not executed yet \u2014 runs apply values to the target.", color: "rgba(238,238,238,0.92)" },
      items: [],
    };
  }
  const appliedCount = info.applied ?? 0;
  const targetName = info.targetTitle || info.targetId || "target";
  const header = appliedCount > 0
    ? {
        text: `\u2713 Applied ${appliedCount} value${appliedCount === 1 ? "" : "s"} to ${targetName}`,
        color: "#8be28b",
      }
    : {
        text: `\u2717 Nothing applied to ${targetName}`,
        color: "#f38ba8",
      };

  const items = [];
  for (const [k, v] of Object.entries(info.values || {})) {
    items.push({ text: `${k} = ${v}`, color: "rgba(225,225,225,0.9)" });
  }
  for (const note of info.notes || []) {
    items.push({ text: note, color: "rgba(225,225,225,0.65)" });
  }
  return { header, items };
}

function getViewLines(node) {
  const boxH = FOOTER_H - 6;
  const viewH = Math.max(1, boxH - HEADER_H - 6);
  return Math.max(1, Math.floor(viewH / LINE_H));
}

function getScroll(node) {
  if (!node.__AUN_applyScroll) node.__AUN_applyScroll = { offset: 0 };
  return node.__AUN_applyScroll;
}

function getMaxOffset(node) {
  const content = getFooterContent(node.__AUN_applyInfo);
  return Math.max(0, content.items.length - getViewLines(node));
}

function drawFooterBox(ctx, node) {
  const info = node.__AUN_applyInfo;
  const w = node?.size?.[0] ?? 300;
  const h = node?.size?.[1] ?? 0;
  const x0 = 8;
  const x1 = w - 8;
  const y0 = h - FOOTER_H + 2;
  const boxH = FOOTER_H - 6;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x0, y0, x1 - x0, boxH, 4);
  } else {
    ctx.rect(x0, y0, x1 - x0, boxH);
  }
  ctx.fill();

  const content = getFooterContent(info);
  const viewLines = getViewLines(node);
  const maxOffset = getMaxOffset(node);
  const scroll = getScroll(node);
  if (scroll.offset > maxOffset) scroll.offset = maxOffset;

  const textX = x0 + 7;
  const maxWidth = Math.max(10, x1 - x0 - 14 - SCROLLBAR_W);

  // Roomier empty-state rendering (no scrollbar needed yet).
  if (!info) {
    ctx.textAlign = "center";
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "rgba(238,238,238,0.92)";
    ctx.fillText("Not executed yet", (x0 + x1) / 2, y0 + 34, maxWidth);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "rgba(228,228,228,0.75)";
    ctx.fillText("Runs apply values to the target.", (x0 + x1) / 2, y0 + 60, maxWidth);
    ctx.textAlign = "left";
    ctx.restore();
    return;
  }

  // Pinned header line
  ctx.font = "bold 12px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillStyle = content.header.color;
  ctx.fillText(String(content.header.text).slice(0, TEXT_CAP), textX, y0 + 5, maxWidth);

  // Scrollable value/note lines
  const viewY0 = y0 + HEADER_H;
  const viewY1 = y0 + boxH - 5;
  ctx.font = "12px sans-serif";
  for (let i = 0; i < viewLines; i++) {
    const idx = scroll.offset + i;
    if (idx >= content.items.length) break;
    const line = content.items[idx];
    ctx.fillStyle = line.color;
    ctx.fillText(String(line.text).slice(0, TEXT_CAP), textX, viewY0 + i * LINE_H + 1, maxWidth);
  }

  // Scrollbar
  if (maxOffset > 0) {
    const trackX = x1 - SCROLLBAR_W - 4;
    const trackH = viewY1 - viewY0;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(trackX, viewY0, SCROLLBAR_W, trackH);
    const thumbH = Math.max(12, (trackH * viewLines) / Math.max(1, content.items.length));
    const thumbY = viewY0 + (trackH - thumbH) * (scroll.offset / maxOffset);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(trackX, thumbY, SCROLLBAR_W, thumbH);
  }
  ctx.restore();
}

// ── Footer scroll interactions ─────────────────────────────────────
//
// Frontend 1.53.x never dispatches wheel events to nodes (the canvas
// consumes them for zoom/pan), so the scrollbar uses:
//   * a document-level capture-phase wheel listener, and
//   * click / drag on the scrollbar via node.onMouseDown (local coords).

function getFooterRect(node) {
  const w = node?.size?.[0] ?? 300;
  const h = node?.size?.[1] ?? 0;
  return { x0: 8, y0: h - FOOTER_H + 2, x1: w - 8, boxH: FOOTER_H - 6 };
}

function scrollBy(node, delta) {
  const maxOffset = getMaxOffset(node);
  if (maxOffset <= 0) return false;
  const scroll = getScroll(node);
  scroll.offset = Math.max(0, Math.min(maxOffset, scroll.offset + delta));
  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);
  return true;
}

function isOverFooter(node, localX, localY) {
  const r = getFooterRect(node);
  return localX >= r.x0 && localX <= r.x1 && localY >= r.y0 && localY <= r.y0 + r.boxH;
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
      if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) continue;
      if (!node.__AUN_applyInfo || isNodeCollapsed(node)) continue;
      const local = [gm[0] - node.pos[0], gm[1] - node.pos[1]];
      if (!isOverFooter(node, local[0], local[1])) continue;
      const delta = (e.deltaY || 0) > 0 ? 1 : -1;
      if (scrollBy(node, delta)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
  }, true);
}

function handleFooterMouseDown(node, event, pos, canvas) {
  const info = node.__AUN_applyInfo;
  if (!info || isNodeCollapsed(node) || !Array.isArray(pos) || !node.size) return false;

  const r = getFooterRect(node);
  const lx = pos[0];
  const ly = pos[1];
  if (!isOverFooter(node, lx, ly)) return false;

  const maxOffset = getMaxOffset(node);
  if (maxOffset <= 0) return true; // consume clicks inside the footer

  // Generous hit area around the scrollbar track.
  const trackX = r.x1 - SCROLLBAR_W - 4;
  if (lx < trackX - 8) return true; // click on text — just consume

  const viewY0 = r.y0 + HEADER_H;
  const trackH = Math.max(1, r.boxH - HEADER_H - 5);
  const total = Math.max(1, getFooterContent(info).items.length);
  const viewLines = getViewLines(node);
  const thumbH = Math.max(12, (trackH * viewLines) / total);
  const scroll = getScroll(node);
  const thumbTop = viewY0 + (trackH - thumbH) * (scroll.offset / maxOffset);

  if (ly < thumbTop) {
    scrollBy(node, -viewLines);
    return true;
  }
  if (ly > thumbTop + thumbH) {
    scrollBy(node, viewLines);
    return true;
  }

  // Drag the thumb.
  const drag = { startY: ly, startOffset: scroll.offset, trackH, total, maxOffset };
  node.__AUN_scrollDrag = drag;

  const onMove = (ev) => {
    if (!node.graph || !node.__AUN_scrollDrag) { cleanup(); return; }
    const gm = app?.canvas?.graph_mouse;
    if (!Array.isArray(gm)) return;
    const localY = gm[1] - node.pos[1];
    const next = Math.round(drag.startOffset + ((localY - drag.startY) / drag.trackH) * drag.total);
    scroll.offset = Math.max(0, Math.min(drag.maxOffset, next));
    node.setDirtyCanvas?.(true, true);
    forceRedraw(node);
  };
  const cleanup = () => {
    if (node.__AUN_scrollDrag === drag) node.__AUN_scrollDrag = null;
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

// ------------------------------------------------------------------
// Auto-title: "Apply → <Target>" (never clobbers a user-set title)
// ------------------------------------------------------------------

function applyAutoTitle(node, targetTitle) {
  const wanted = targetTitle ? `Apply \u2192 ${targetTitle}` : null;
  if (!wanted) return;
  const prev = node.__AUN_prevAutoTitle;
  const isDefault =
    !node.title ||
    node.title === "Apply Preset To Node" ||
    node.title === prev;
  if (isDefault && node.title !== wanted) {
    node.title = wanted;
    node.setDirtyCanvas?.(true, true);
  }
  node.__AUN_prevAutoTitle = wanted;
}

function refreshTitleFromGraph(node) {
  if (!node) return;
  const ident = String(node.widgets?.find((w) => w.name === "node_identifier")?.value ?? "").trim();
  if (!ident) return;
  const target = findNodeByIdentifier(node.graph || app?.graph, ident, node);
  if (!target) return;
  applyAutoTitle(node, target.title || target.comfyClass || null);
}

// ------------------------------------------------------------------
// Compact mode — double-click toggles: config widgets hide, sockets
// converge to dots, and the confirmation footer takes over the node.
// ------------------------------------------------------------------

function getCompactHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node)) return 0;
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  return TITLE_H + slotH * 0.6 + FOOTER_PAD + FOOTER_H + FOOTER_BOTTOM;
}

// In compact mode the socket labels are hidden. Labels are stored/restored
// exactly (same pattern as the collapse connections extension).
function applySlotLabels(node, compact) {
  for (const slot of [...(node.outputs || []), ...(node.inputs || [])]) {
    if (slot.widget) continue; // converted-widget input — leave its label alone
    if (compact) {
      if (slot.label !== " ") {
        slot.__aun_apply_origLabel = slot.label;
      }
      slot.label = " ";
    } else {
      if ("__aun_apply_origLabel" in slot) {
        slot.label = slot.__aun_apply_origLabel;
        delete slot.__aun_apply_origLabel;
      } else if (slot.label === " ") {
        delete slot.label;
      }
    }
  }
}

function updateVisibility(node) {
  const compact = isCompact(node);
  for (const name of ["node_identifier", "only_widgets", "aliases"]) {
    applyWidgetHiddenState(getWidget(node, name), compact);
  }
  applySlotLabels(node, compact);

  if (compact && !isNodeCollapsed(node)) {
    node.size[1] = getCompactHeight(node);
  } else if (!compact) {
    try {
      node.size[1] = node.computeSize()[1];
    } catch (err) {
      console.warn("AUNApplyPresetToNode: computeSize failed", err);
    }
  }
  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);
}

function toggleCompactMode(node) {
  if (!node) return;
  setCompact(node, !isCompact(node));
  updateVisibility(node);
}

// ------------------------------------------------------------------
// Extension: reserve footer space + draw it
// ------------------------------------------------------------------

app.registerExtension({
  name: "AUN.ApplyPresetToNode",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;

    const origComputeSize = nodeType.prototype.computeSize;
    if (typeof origComputeSize === "function") {
      nodeType.prototype.computeSize = function () {
        const s = origComputeSize.apply(this, arguments);
        if (isCompact(this) && !isNodeCollapsed(this)) {
          s[1] = getCompactHeight(this);
          return s;
        }
        s[1] = (s[1] || 0) + FOOTER_H + FOOTER_PAD;
        return s;
      };
    }

    const origDrawFg = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      origDrawFg?.apply(this, arguments);
      if (isNodeCollapsed(this)) return;
      drawFooterBox(ctx, this);
    };

    const origMouseDown = nodeType.prototype.onMouseDown;
    nodeType.prototype.onMouseDown = function (event, pos, canvas) {
      if (handleFooterMouseDown(this, event, pos, canvas)) return true;
      return origMouseDown ? origMouseDown.apply(this, arguments) : undefined;
    };

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      const identW = this.widgets?.find((w) => w.name === "node_identifier");
      if (identW && !identW.__AUN_apply_hooked) {
        identW.__AUN_apply_hooked = true;
        const orig = identW.callback;
        identW.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => refreshTitleFromGraph(this.node));
        };
      }

      const originalDblClick = this.onDblClick;
      this.onDblClick = function (event, pos) {
        originalDblClick?.apply(this, arguments);
        if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
        toggleCompactMode(this);
      };

      // Converge all sockets to one position while compact.
      if (!this.__AUN_apply_posHooked) {
        this.__AUN_apply_posHooked = true;
        const origGetOutputPos = this.getOutputPos.bind(this);
        const origGetInputPos = this.getInputPos.bind(this);
        this.getOutputPos = function (index) {
          return isCompact(this) ? origGetOutputPos(0) : origGetOutputPos(index);
        };
        this.getInputPos = function (index) {
          return isCompact(this) ? origGetInputPos(0) : origGetInputPos(index);
        };
      }

      requestAnimationFrame(() => {
        refreshTitleFromGraph(this);
        updateVisibility(this);
      });
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      requestAnimationFrame(() => updateVisibility(this));
    };

    const originalGetMenuOptions = nodeType.prototype.getMenuOptions;
    nodeType.prototype.getMenuOptions = function () {
      const options = originalGetMenuOptions
        ? originalGetMenuOptions.apply(this, arguments)
        : [];
      options.push({
        content: isCompact(this) ? "AUN: Show all widgets" : "AUN: Compact mode",
        callback: () => {
          toggleCompactMode(this);
        },
      });
      return options;
    };
  },

  nodeCreated(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    requestAnimationFrame(() => {
      refreshTitleFromGraph(node);
      updateVisibility(node);
    });
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;
    requestAnimationFrame(() => {
      refreshTitleFromGraph(node);
      updateVisibility(node);
    });
  },
});

// ------------------------------------------------------------------
// WebSocket: sync target widgets + update the confirmation footer
// ------------------------------------------------------------------

api.addEventListener("AUN_apply_preset_applied", ({ detail }) => {
  if (!detail || !app?.graph) return;

  const applyNode = app.graph.getNodeById?.(detail.node_id);
  const target = findNodeByIdentifier(app.graph, detail.target_id, applyNode);
  const values = detail.values;
  const valueObj = values && typeof values === "object" ? values : {};

  if (target) {
    let changed = false;
    for (const [name, value] of Object.entries(valueObj)) {
      const input = target.inputs?.find((inp) => inp.name === name);
      if (input?.link != null) continue; // linked inputs are never overwritten
      const widget = target.widgets?.find((w) => w.name === name);
      if (!widget) continue;
      setWidgetValue(widget, value);
      changed = true;
    }
    if (changed) {
      target.setDirtyCanvas?.(true, true);
      forceRedraw(target);
    }
  }

  if (applyNode && (applyNode.comfyClass === NODE_CLASS || applyNode.type === NODE_CLASS)) {
    applyNode.__AUN_applyInfo = {
      targetId: String(detail.target_id ?? ""),
      targetTitle: detail.target_title || target?.title || target?.comfyClass || "",
      values: valueObj,
      notes: Array.isArray(detail.notes) ? detail.notes : [],
      applied: Object.keys(valueObj).length,
    };
    applyNode.__AUN_applyScroll = { offset: 0 };
    applyAutoTitle(applyNode, detail.target_title || target?.title || target?.comfyClass || null);
    applyNode.setDirtyCanvas?.(true, true);
    forceRedraw(applyNode);
  }
});
