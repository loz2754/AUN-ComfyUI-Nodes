import { app } from "../../scripts/app.js";
import { applyWidgetHiddenState, ensureHiddenAware, getWidget, forceRedraw, isNodeCollapsed } from "./index.js";

const NODE_CLASS = "AUNKeywordPresetSelector";
const MAX_SLOTS = 20;
const PROP_KEY = "_AUN_compactMode";
const TITLE_H = 28;
const SIDE_PAD = 10;
const BOX_H = 22;
const BOX_GAP = 4;

function getVisibleCount(node) {
  const w = getWidget(node, "visible_inputs");
  const val = w?.value;
  return Number.isFinite(val) ? Math.max(2, Math.min(MAX_SLOTS, Math.floor(val))) : 5;
}

function isCompact(node) {
  return !!node?.properties?.[PROP_KEY];
}

function setCompact(node, compact) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_KEY] = !!compact;
}

function toggleCompactMode(node) {
  if (!node) return;
  setCompact(node, !isCompact(node));
  updateVisibility(node);
}

function resizeNode(node) {
  if (typeof node?.computeSize === "function") {
    try {
      const newSize = node.computeSize();
      if (node.size && node.size.length >= 2) {
        node.size[1] = newSize[1];
      } else {
        node.size = newSize;
      }
    } catch (err) {
      console.warn("AUNKeywordPresetSelector: computeSize failed", err);
    }
  }
}

function getMinimumCompactHeight() {
  return TITLE_H + BOX_GAP + BOX_H + BOX_GAP;
}

const skipWidgetNames = new Set(["index", "mode", "seed", "strength", "apply_lora", "visible_inputs", "case_sensitive", "reference_phrase", "preset_default"]);

function traceLinkValue(startLink, visited, depth) {
  depth = depth || 0;
  if (!startLink || depth > 8) return undefined;
  const link = app.graph.links?.get?.(startLink);
  if (!link?.origin_id) return undefined;
  const n = app.graph.getNodeById?.(link.origin_id);
  if (!n) return undefined;
  if (visited.has(n.id)) return undefined;
  visited.add(n.id);

  const nodeType = (n.type || "").toUpperCase();
  if (nodeType.includes("SWITCH") || nodeType.includes("RANDOM")) {
    const idxW = n.widgets?.find(w => w.name === "index");
    if (idxW) {
      const idx = n.__AUN_lastExecutedIndex ?? (parseInt(idxW.value) || 1);
      const textN = n.widgets?.find(w => w.name === `text${idx}`);
      if (textN && typeof textN.value === "string" && textN.value) {
        return textN.value.split("\n")[0].trim();
      }
    }
  }
  if (n.__AUN_lastOutput_label != null) return String(n.__AUN_lastOutput_label);
  if (n.__AUN_lastOutput_text != null) return String(n.__AUN_lastOutput_text);
  if (n.__AUN_lastOutput_prompt_title != null) return String(n.__AUN_lastOutput_prompt_title);
  const labelSlotIdx = n.outputs?.findIndex(o => o.name === "label");
  const preferredSlot = labelSlotIdx >= 0 ? labelSlotIdx : link.origin_slot;
  const slotKey = `__AUN_lastOutput_${preferredSlot}`;
  if (n[slotKey] != null) return String(n[slotKey]);
  const connectedSlotKey = `__AUN_lastOutput_${link.origin_slot}`;
  if (n[connectedSlotKey] != null) return String(n[connectedSlotKey]);
  if (n.__AUN_lastOutput != null) return String(n.__AUN_lastOutput);
  if (n.__AUN_loraMultiLastLabel != null) return String(n.__AUN_loraMultiLastLabel);

  const textWidget = n.widgets?.find((w) => {
    const name = (w.name || "").toLowerCase();
    if (skipWidgetNames.has(name)) return false;
    const type = (w.type || "").toUpperCase();
    return (
      type === "TEXT" || type === "STRING" || type === "CUSTOMTEXT" ||
      name === "value" || name === "text" || name === "label" ||
      name === "output_text" || name === "result"
    );
  });
  if (textWidget && typeof textWidget.value === "string" && textWidget.value) {
    const wInp = n.inputs?.find(inp => inp.widget?.name === textWidget.name);
    if (wInp?.link) return traceLinkValue(wInp.link, visited, depth + 1);
    return textWidget.value;
  }
  const srcInput = n.inputs?.[link.origin_slot];
  if (srcInput?.link) return traceLinkValue(srcInput.link, visited, depth + 1);
  return undefined;
}

function getReferencePhrase(node) {
  const refWidget = getWidget(node, "reference_phrase");
  if (!refWidget) return "";
  const refInput = node.inputs?.find(
    (inp) => inp.name === "reference_phrase" || inp.widget?.name === "reference_phrase"
  );
  if (refInput?.link != null) {
    const traced = traceLinkValue(refInput.link, new Set());
    if (traced != null) return traced;
    return String(refWidget?.value ?? "").trim();
  }
  return String(refWidget?.value ?? "").trim();
}

function findMatch(node) {
  const ref = getReferencePhrase(node);
  if (!ref) return null;
  const csWidget = getWidget(node, "case_sensitive");
  const cs = !!csWidget?.value;
  const search = cs ? ref : ref.toLowerCase();
  const count = getVisibleCount(node);

  for (let i = 1; i <= count; i++) {
    const kw = getWidget(node, "keyword" + i);
    const pr = getWidget(node, "preset" + i);
    const kwVal = String(kw?.value ?? "").trim();
    const prVal = String(pr?.value ?? "").trim();
    if (!kwVal) continue;
    const matchKw = cs ? kwVal : kwVal.toLowerCase();
    if (search.includes(matchKw)) {
      return { index: i, keyword: kwVal, value: prVal };
    }
  }
  return null;
}

function drawMatchBox(ctx, node, match) {
  const w = node.size?.[0] ?? 300;
  const x0 = SIDE_PAD;
  const y0 = TITLE_H + BOX_GAP;
  const boxW = Math.max(120, w - SIDE_PAD * 2);
  const boxH = BOX_H;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.roundRect(x0, y0, boxW, boxH, 4);
  ctx.fill();

  const text = `${match.index} ${match.keyword}: ${match.value}`;
  ctx.fillStyle = "rgba(220, 220, 220, 0.95)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const maxWidth = boxW - 8;
  const metrics = ctx.measureText(text);
  let displayText = text;
  if (metrics.width > maxWidth) {
    const ellipsis = "\u2026";
    let truncated = text;
    while (ctx.measureText(truncated + ellipsis).width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    displayText = truncated + ellipsis;
  }
  ctx.fillText(displayText, x0 + 4, y0 + boxH / 2);
  ctx.restore();
}

function updateVisibility(node) {
  const count = getVisibleCount(node);
  const compact = isCompact(node);

  applyWidgetHiddenState(getWidget(node, "visible_inputs"), compact);
  applyWidgetHiddenState(getWidget(node, "case_sensitive"), compact);
  applyWidgetHiddenState(getWidget(node, "reference_phrase"), compact);

  for (let i = 1; i <= MAX_SLOTS; i++) {
    const show = i <= count && !compact;
    applyWidgetHiddenState(getWidget(node, "keyword" + i), !show);
    applyWidgetHiddenState(getWidget(node, "preset" + i), !show);
  }

  applyWidgetHiddenState(getWidget(node, "preset_default"), compact);

  if (compact) {
    const h = getMinimumCompactHeight();
    if (node.size) node.size[1] = h;
  } else {
    resizeNode(node);
  }

  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);
}

app.registerExtension({
  name: "AUN.KeywordPresetSelector",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      onNodeCreated?.apply(this, arguments);
      requestAnimationFrame(() => updateVisibility(this));

      const vis = getWidget(this, "visible_inputs");
      if (vis && !vis.__aun_hooked) {
        vis.__aun_hooked = true;
        const orig = vis.callback;
        vis.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => updateVisibility(this.node));
        };
      }

      const originalDblClick = this.onDblClick;
      this.onDblClick = function (event, pos) {
        originalDblClick?.apply(this, arguments);
        if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
        toggleCompactMode(this);
      };
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      updateVisibility(this);
    };

    const protoOrigDrawFg = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      protoOrigDrawFg?.apply(this, arguments);
      if (isCompact(this)) {
        const match = findMatch(this);
        if (match) {
          drawMatchBox(ctx, this, match);
        }
      }
    };

    const originalGetMenuOptions = nodeType.prototype.getMenuOptions;
    nodeType.prototype.getMenuOptions = function () {
      const options = originalGetMenuOptions
        ? originalGetMenuOptions.apply(this, arguments)
        : [];
      options.push({
        content: this.properties?.[PROP_KEY]
          ? "AUN: Show all widgets"
          : "AUN: Compact mode",
        callback: () => {
          setCompact(this, !this.properties?.[PROP_KEY]);
          updateVisibility(this);
        },
      });
      return options;
    };
  },

  nodeCreated(node) {
    if (node.comfyClass !== NODE_CLASS) return;
    requestAnimationFrame(() => updateVisibility(node));
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE_CLASS) return;
    requestAnimationFrame(() => updateVisibility(node));
  },
});