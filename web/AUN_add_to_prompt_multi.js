import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "AUNAddToPromptMulti";
const MAX_ADDONS = 10;
const PROP_COMPACT = "_AUN_compactMode";

const TITLE_H = 28;
const ROW_H = 22;
const ROW_GAP = 2;
const SIDE_PAD = 8;
const BADGE_PAD = 6;
const FOOTER_H = 22;

const MODE_CYCLE = { off: "on", on: "random", random: "off" };
const ORDER_TOGGLE = { prompt_first: "addon_first", addon_first: "prompt_first" };

function getWidget(node, name) {
  return node?.widgets?.find((w) => w.name === name) ?? null;
}

function clampAddons(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 1 : Math.max(1, Math.min(MAX_ADDONS, n));
}

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
    const fh = node.__aun_footerHeight || FOOTER_H;
    const minH = TITLE_H + 4 + numAddons * (ROW_H + ROW_GAP) + 4 + fh + 2;
    node.setSize([node.size[0], Math.max(h, minH)]);
  } else {
    node.setSize([node.size[0], Math.max(h, 260)]);
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

function computeFooterHeight(ctx, nodeW, text, lineH) {
  if (!text) return FOOTER_H;
  const maxW = nodeW - SIDE_PAD * 2 - 8;
  if (maxW <= 0) return FOOTER_H;
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return Math.max(FOOTER_H, lines.length * lineH + 6);
}

function drawResolvedFooter(ctx, node) {
  const resolved = getResolvedText(node);
  const nodeW = node.size[0] || 300;
  const nodeH = node.size[1] || 200;
  ctx.font = "bold 12px sans-serif";
  const lineH = 16;
  const fh = computeFooterHeight(ctx, nodeW, resolved, lineH);

  if (fh !== node.__aun_footerHeight) {
    node.__aun_footerHeight = fh;
    updateNodeSize(node);
  }

  const y = nodeH - fh - 2;
  ctx.save();
  ctx.fillStyle = "rgba(35, 35, 35, 0.92)";
  ctx.beginPath();
  ctx.roundRect(0, y, nodeW, fh, [0, 0, 4, 4]);
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.rect(SIDE_PAD, y, nodeW - SIDE_PAD * 2, 1);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  if (resolved) {
    ctx.fillStyle = "#eee";
    const maxW = nodeW - SIDE_PAD * 2 - 8;
    let lineY = y + 4;
    const words = resolved.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, SIDE_PAD + 4, lineY);
        lineY += lineH;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, SIDE_PAD + 4, lineY);
  } else {
    ctx.fillStyle = "#888";
    ctx.textBaseline = "middle";
    ctx.fillText("(empty)", SIDE_PAD + 4, y + fh / 2);
  }
  ctx.restore();
}

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
      ctx.font = "bold 12px sans-serif";
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
  setCompact(node, !isCompact(node));
  updateNodeVisibility(node);
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
        this.setDirtyCanvas?.(true, true);
      }
    }
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    origDrawFg?.apply(this, arguments);
    if (isCompact(this)) {
      drawCompactRows(ctx, this);
      drawResolvedFooter(ctx, this);
    }
  };

  const origMouseDown = node.onMouseDown;
  node.onMouseDown = function (event, pos) {
    if (isCompact(this) && pos && pos.length >= 2 && this.__aun_hitAreas) {
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

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);
    if (app?.canvas?.active_widget) return;
    if (isCompact(this) && pos && pos.length >= 2 && isOverHitArea(this, pos)) return;
    toggleCompact(this);
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
    if (isCompact(this)) {
      const numAddons = clampAddons(getWidget(this, "num_addons")?.value ?? 1);
      const fh = this.__aun_footerHeight || FOOTER_H;
      const minH = TITLE_H + 4 + numAddons * (ROW_H + ROW_GAP) + 4 + fh + 2;
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
