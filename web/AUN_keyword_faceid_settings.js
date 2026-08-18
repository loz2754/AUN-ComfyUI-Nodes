import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyWidgetHiddenState, ensureHiddenAware, getWidget, injectStyles, forceRedraw, isNodeCollapsed } from "./index.js";

const NODE_CLASS = "AUNKeywordFaceIDSettings";
const MAX_SLOTS = 6;
const PROP_KEY = "_AUN_compactMode";
const PROP_SHOW_BOX = "_AUN_showMatchBox";
const TITLE_H = 28;
const FOOTER_H = 42;

const SETTING_KEYS = [
  "preset", "weight", "weight_type",
  "preset_faceid", "lora_strength",
  "weight_faceid", "weight_faceidv2", "weight_type_faceid",
];
const DEFAULT_KEYS = SETTING_KEYS.map((k) => `${k}_default`);

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

function showBox(node) {
  return node?.properties?.[PROP_SHOW_BOX] !== false;
}

function setShowBox(node, show) {
  if (!node) return;
  node.properties = node.properties || {};
  node.properties[PROP_SHOW_BOX] = !!show;
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
      console.warn("AUNKeywordFaceIDSettings: computeSize failed", err);
    }
  }
}

function getFooterHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node) || !showBox(node)) return 0;
  return FOOTER_H;
}

function getMinimumCompactHeight(node) {
  return TITLE_H + 4 + getFooterHeight(node) + 4;
}

function ensureFooterStyles() {
  if (globalThis.__AUN_faceid_footer_styles) return;
  globalThis.__AUN_faceid_footer_styles = true;
  injectStyles("AUN-faceid-footer-styles", `
    .AUN-faceid-footer {
      position: absolute;
      z-index: 12;
      display: none;
      box-sizing: border-box;
      pointer-events: none;
      font: 11px sans-serif;
      color: rgba(220,220,220,0.9);
      padding: 2px 6px;
      background: transparent;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-radius: 0;
      border: none;
    }
  `);
}

function ensureFooter(node) {
  if (node.__AUN_faceidFooter) return node.__AUN_faceidFooter;
  ensureFooterStyles();
  const el = document.createElement("div");
  el.className = "AUN-faceid-footer";
  document.body.appendChild(el);
  node.__AUN_faceidFooter = el;
  return el;
}

function disposeFooter(node) {
  node.__AUN_faceidFooter?.remove?.();
  node.__AUN_faceidFooter = null;
}

const skipWidgetNames = new Set([
  "index", "mode", "seed", "strength", "apply_lora", "visible_inputs", "case_sensitive",
  "reference_phrase",
  ...DEFAULT_KEYS,
  "preset", "weight", "weight_type", "preset_faceid", "lora_strength",
  "weight_faceid", "weight_faceidv2", "weight_type_faceid",
]);

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

function getRowSettings(node, i) {
  const out = {};
  for (const key of SETTING_KEYS) {
    const w = getWidget(node, `${key}${i}`);
    out[key] = w?.value ?? null;
  }
  return out;
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
    const kwVal = String(kw?.value ?? "").trim();
    if (!kwVal) continue;
    const matchKw = cs ? kwVal : kwVal.toLowerCase();
    if (search.includes(matchKw)) {
      return { index: i, keyword: kwVal, ...getRowSettings(node, i) };
    }
  }
  return null;
}

function getMatchData(node) {
  const last = node.__AUN_faceidLast;
  if (last && last.keyword && last.index > 0 && last.weight != null) {
    return last;
  }
  return findMatch(node);
}

function formatFooter(match) {
  return (
    `#${match.index} ${match.keyword} | ` +
    `preset=${match.preset} w=${match.weight} wt=${match.weight_type} | ` +
    `preset=${match.preset_faceid} ls=${match.lora_strength} ` +
    `w=${match.weight_faceid} wv2=${match.weight_faceidv2} wt=${match.weight_type_faceid}`
  );
}

function graphToScreen(canvasRect, graphX, graphY, scale, offsetX, offsetY) {
  return {
    x: canvasRect.left + (graphX + offsetX) * scale,
    y: canvasRect.top + (graphY + offsetY) * scale
  };
}

function isNodeOccluded(node, canvasRect, scale, offsetX, offsetY) {
  const nodes = app?.graph?._nodes;
  if (!nodes) return false;

  const selfScreen = graphToScreen(canvasRect, node.pos[0], node.pos[1], scale, offsetX, offsetY);
  const selfRight = selfScreen.x + (node.size?.[0] ?? 300) * scale;
  const selfBottom = selfScreen.y + (node.size?.[1] ?? 100) * scale;

  for (const other of nodes) {
    if (!other || other === node) continue;
    if ((other.index ?? -1) <= (node.index ?? -2)) continue;
    if (isNodeCollapsed(other)) continue;

    const otherScreen = graphToScreen(canvasRect, other.pos[0], other.pos[1], scale, offsetX, offsetY);
    const otherRight = otherScreen.x + (other.size?.[0] ?? 300) * scale;
    const otherBottom = otherScreen.y + (other.size?.[1] ?? 100) * scale;

    if (!(otherRight <= selfScreen.x ||
          otherScreen.x >= selfRight ||
          otherBottom <= selfScreen.y ||
          otherScreen.y >= selfBottom)) {
      return true;
    }
  }
  return false;
}

function syncAndPositionFooter(node) {
  const el = ensureFooter(node);
  const compact = isCompact(node);

  if (!compact) {
    el.style.display = "none";
    return;
  }

  const canvas = app?.canvas;
  if (!canvas || !canvas.canvas || !canvas.ds) {
    el.style.display = "none";
    return;
  }
  const canvasRect = canvas.canvas.getBoundingClientRect();
  const scale = canvas.ds.scale || 1;
  const offsetX = canvas.ds.offset?.[0] ?? 0;
  const offsetY = canvas.ds.offset?.[1] ?? 0;

  const occluded = isNodeOccluded(node, canvasRect, scale, offsetX, offsetY);
  const footerHeight = getFooterHeight(node);

  if (footerHeight <= 0 || occluded) {
    el.style.display = "none";
    return;
  }

  const nodeScreen = graphToScreen(canvasRect, node.pos[0], node.pos[1], scale, offsetX, offsetY);
  const nodeW = (node.size?.[0] ?? 300) * scale;
  const nodeH = (node.size?.[1] ?? 100) * scale;
  const padding = 20;
  if (
    nodeScreen.x + nodeW + padding < canvasRect.left ||
    nodeScreen.x - padding > canvasRect.right ||
    nodeScreen.y + nodeH + padding < canvasRect.top ||
    nodeScreen.y - padding > canvasRect.bottom
  ) {
    el.style.display = "none";
    return;
  }

  const match = getMatchData(node);
  const text = match ? formatFooter(match) : "no keyword match";
  if (el.__AUN_footerCache !== text) {
    el.__AUN_footerCache = text;
    el.textContent = text;
  }

  if (!match) {
    el.style.opacity = "0.55";
  } else {
    el.style.opacity = "1";
  }

  const h = node.size?.[1] ?? 100;
  const y0 = h - footerHeight + 3;
  const y1 = h - 6;
  const nodeX = node.pos[0];
  const nodeY = node.pos[1];
  const graphLeft = nodeX + 8;
  const graphTop = nodeY + y0;
  const graphRight = nodeX + (node.size?.[0] ?? 300) - 8;
  const graphBottom = nodeY + y1;

  const screenTL = graphToScreen(canvasRect, graphLeft, graphTop, scale, offsetX, offsetY);
  const screenBR = graphToScreen(canvasRect, graphRight, graphBottom, scale, offsetX, offsetY);

  Object.assign(el.style, {
    display: "block",
    left: `${screenTL.x}px`,
    top: `${screenTL.y}px`,
    width: `${Math.max(20, screenBR.x - screenTL.x)}px`,
    height: `${Math.max(20, screenBR.y - screenTL.y)}px`,
  });
}

let compactFooterRAF = null;
function hasCompactNodes() {
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  return nodes.some((n) => (n?.comfyClass === NODE_CLASS || n?.type === NODE_CLASS) && isCompact(n));
}

function startCompactFooterRAF() {
  if (compactFooterRAF != null) return;
  const tick = () => {
    if (!hasCompactNodes() || !app?.graph) {
      compactFooterRAF = null;
      return;
    }
    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const node of nodes) {
      if ((node?.comfyClass === NODE_CLASS || node?.type === NODE_CLASS) && isCompact(node)) {
        syncAndPositionFooter(node);
      }
    }
    compactFooterRAF = requestAnimationFrame(tick);
  };
  compactFooterRAF = requestAnimationFrame(tick);
}

function updateVisibility(node) {
  const count = getVisibleCount(node);
  const compact = isCompact(node);

  applyWidgetHiddenState(getWidget(node, "visible_inputs"), compact);
  applyWidgetHiddenState(getWidget(node, "case_sensitive"), compact);
  applyWidgetHiddenState(getWidget(node, "reference_phrase"), compact);

  for (const key of DEFAULT_KEYS) {
    applyWidgetHiddenState(getWidget(node, key), compact);
  }

  for (let i = 1; i <= MAX_SLOTS; i++) {
    const show = i <= count && !compact;
    applyWidgetHiddenState(getWidget(node, "keyword" + i), !show);
    for (const key of SETTING_KEYS) {
      applyWidgetHiddenState(getWidget(node, `${key}${i}`), !show);
    }
  }

  if (compact) {
    const h = getMinimumCompactHeight(node);
    if (node.size) node.size[1] = h;
  } else {
    resizeNode(node);
  }

  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);

  ensureFooter(node);
  if (compact) startCompactFooterRAF();
}

app.registerExtension({
  name: "AUN.KeywordFaceIDSettings",
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

      const originalOnRemoved = this.onRemoved;
      this.onRemoved = function () {
        originalOnRemoved?.apply(this, arguments);
        disposeFooter(this);
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
        syncAndPositionFooter(this);
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
      options.push({
        content: showBox(this) ? "AUN: Hide match box" : "AUN: Show match box",
        callback: () => {
          setShowBox(this, !showBox(this));
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

api.addEventListener("AUN_keyword_faceid_settings_executed", ({ detail }) => {
  if (!detail || !app?.graph) return;
  let node = app.graph.getNodeById?.(detail.node_id);
  if (!node) {
    const numericId = parseInt(detail.node_id, 10);
    if (!Number.isNaN(numericId)) {
      node = app.graph.getNodeById?.(numericId);
    }
  }
  if (!node) return;
  const isTarget = node?.comfyClass === NODE_CLASS || node?.type === NODE_CLASS;
  if (!isTarget) return;

  node.__AUN_faceidLast = {
    index: Number(detail.matched_index ?? 0),
    keyword: detail.matched_keyword ?? "",
    preset: detail.preset ?? null,
    weight: detail.weight ?? null,
    weight_type: detail.weight_type ?? null,
    preset_faceid: detail.preset_faceid ?? null,
    lora_strength: detail.lora_strength ?? null,
    weight_faceid: detail.weight_faceid ?? null,
    weight_faceidv2: detail.weight_faceidv2 ?? null,
    weight_type_faceid: detail.weight_type_faceid ?? null,
  };
  if (isCompact(node)) {
    syncAndPositionFooter(node);
  }
});