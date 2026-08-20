import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyWidgetHiddenState, ensureHiddenAware, getWidget, injectStyles, forceRedraw, isNodeCollapsed } from "./index.js";

const NODE_CLASS = "AUNKeywordFaceIDSettings";
const MAX_SLOTS = 6;
const PROP_KEY = "_AUN_compactMode";
const PROP_SHOW_BOX = "_AUN_showMatchBox";
const TITLE_H = 28;
const FOOTER_H = 70;
const FOOTER_PAD = 12;
const FOOTER_BOTTOM = 4;
const PARAM_OUTPUTS = new Set([
  "preset", "weight", "weight_type", "preset_faceid", "lora_strength",
  "weight_faceid", "weight_faceidv2", "weight_type_faceid",
]);
const VISIBLE_OUTPUTS = ["matched_keyword", "matched_index", "settings_text", "preset_number"];

const SETTING_KEYS = [
  "preset", "weight", "weight_type",
  "preset_faceid", "lora_strength",
  "weight_faceid", "weight_faceidv2", "weight_type_faceid",
];

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

function applyCompactSlotLabels(node) {
  const compact = isCompact(node);
  const slots = node.outputs || [];
  for (const slot of slots) {
    if (!slot) continue;
    if (compact) {
      if (!("__aun_compact_origLabel" in slot)) {
        slot.__aun_compact_origLabel = slot.label;
      }
      slot.label = " ";
    } else {
      if ("__aun_compact_origLabel" in slot) {
        slot.label = slot.__aun_compact_origLabel;
        delete slot.__aun_compact_origLabel;
      }
      if (slot.label === " ") {
        delete slot.label;
      }
    }
  }
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

function getRailBottomY() {
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  return (1 + 0.7) * slotH;
}

function getMinimumCompactHeight(node) {
  const footerH = getFooterHeight(node);
  const base = Math.max(TITLE_H, getRailBottomY());
  return footerH > 0 ? base + FOOTER_PAD + footerH + FOOTER_BOTTOM : base + FOOTER_BOTTOM;
}

function drawFooterBox(ctx, node) {
  const footerH = getFooterHeight(node);
  if (footerH <= 0 || node.__AUN_nodeBeingDragged) return;
  const w = node?.size?.[0] ?? 300;
  const x0 = 8;
  const x1 = w - 8;
  const y0 = getRailBottomY() + FOOTER_PAD;
  const y1 = y0 + footerH;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 4);
  } else {
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
  }
  ctx.fill();
  ctx.restore();
}

function ensureFooterStyles() {
  if (globalThis.__AUN_faceid_footer_styles) return;
  globalThis.__AUN_faceid_footer_styles = true;
  injectStyles("AUN-faceid-footer-styles", `
    .AUN-faceid-footer {
      position: absolute;
      z-index: 12;
      display: none;
      overflow-y: auto;
      box-sizing: border-box;
      pointer-events: auto;
      font: 11px sans-serif;
      color: rgba(220,220,220,0.9);
      padding: 2px 6px;
      background: transparent;
      white-space: normal;
      word-break: break-word;
      border-radius: 0;
      border: none;
    }
    .AUN-faceid-footer::-webkit-scrollbar {
      width: 5px;
    }
    .AUN-faceid-footer::-webkit-scrollbar-track {
      background: transparent;
    }
    .AUN-faceid-footer::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
    }
    .AUN-faceid-footer::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.35);
    }
    .AUN-faceid-footer b {
      font-weight: 700;
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
  activeFooters.set(node.id, node);
  return el;
}

function disposeFooter(node) {
  node.__AUN_faceidFooter?.remove?.();
  node.__AUN_faceidFooter = null;
  activeFooters.delete(node.id);
}

const activeFooters = new Map();

const skipWidgetNames = new Set([
  "index", "mode", "seed", "strength", "apply_lora", "visible_inputs", "case_sensitive",
  "reference_phrase", "manual_preset", "match_keywords",
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

function getManualBundle(node) {
  const mp = Number(getWidget(node, "manual_preset")?.value ?? 1);
  if (mp >= 1 && mp <= MAX_SLOTS) return getRowSettings(node, mp);
  return null;
}

function splitKeywords(raw) {
  return String(raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function findMatch(node) {
  const ref = getReferencePhrase(node);
  if (!ref) return null;
  const csWidget = getWidget(node, "case_sensitive");
  const cs = !!csWidget?.value;
  const search = cs ? ref : ref.toLowerCase();
  const count = getVisibleCount(node);

  for (let i = 1; i <= count; i++) {
    const kws = splitKeywords(getWidget(node, "keyword" + i)?.value);
    for (const kw of kws) {
      const matchKw = cs ? kw : kw.toLowerCase();
      if (search.includes(matchKw)) {
        return { index: i, keyword: kw, ...getRowSettings(node, i) };
      }
    }
  }
  return null;
}

function getMatchData(node) {
  const last = node.__AUN_faceidLast;
  if (last && last.index > 0) {
    return last;
  }

  const manual = getManualBundle(node);
  const mp = Number(getWidget(node, "manual_preset")?.value ?? 1);
  const keywordsOn = String(getWidget(node, "match_keywords")?.value ?? "Yes") === "Yes";

  if (keywordsOn) {
    const matched = findMatch(node);
    if (matched) return matched;
  }
  if (manual) return { index: mp, keyword: "", ...manual };
  return null;
}

function pyFloat(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0.0";
  return n % 1 === 0 ? `${n}.0` : String(n);
}

function pyStr(v) {
  return `'${String(v ?? "")}'`;
}

function settingsTuple(match) {
  return (
    `(${pyStr(match.preset)}, ${pyFloat(match.weight)}, ${pyStr(match.weight_type)}, ` +
    `${pyStr(match.preset_faceid)}, ${pyFloat(match.lora_strength)}, ` +
    `${pyFloat(match.weight_faceid)}, ${pyFloat(match.weight_faceidv2)}, ${pyStr(match.weight_type_faceid)})`
  );
}

function formatFooter(match) {
  return `${footerLabel(match)} ${settingsTuple(match)}`;
}

function footerLabel(match) {
  if (match.index > 0 && match.keyword) return `#${match.index} ${match.keyword}`;
  if (match.index > 0) return `preset ${match.index}`;
  return "no match";
}

function footerDetail(match) {
  return ` ${settingsTuple(match)}`;
}

function graphToScreen(canvasRect, graphX, graphY, scale, offsetX, offsetY) {
  return {
    x: canvasRect.left + (graphX + offsetX) * scale,
    y: canvasRect.top + (graphY + offsetY) * scale
  };
}

function isNodeOccluded(node, canvasRect, scale, offsetX, offsetY) {
  const nodes = app.canvas?.graph?._nodes;
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

  if (!compact || node.__AUN_nodeBeingDragged) {
    el.style.display = "none";
    return;
  }

  const canvas = app?.canvas;
  if (!canvas || !canvas.canvas || !canvas.ds) {
    el.style.display = "none";
    return;
  }

  if (node.graph && node.graph !== app.canvas?.graph) {
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
    el.textContent = "";
    if (match) {
      const b = document.createElement("b");
      b.textContent = footerLabel(match);
      el.appendChild(b);
      el.appendChild(document.createTextNode(footerDetail(match)));
    } else {
      el.textContent = "no keyword match";
    }
  }

  if (!match) {
    el.style.opacity = "0.55";
  } else {
    el.style.opacity = "1";
  }

  const y0 = getRailBottomY() + FOOTER_PAD;
  const y1 = y0 + footerHeight;
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

function setupDragMonitor() {
  const canvas = app?.canvas;
  if (!canvas || canvas.__AUN_dragMonitorSetup) return;
  canvas.__AUN_dragMonitorSetup = true;
  const origOnNodeDragStart = canvas.onNodeDragStart;
  canvas.onNodeDragStart = function (event, node_being_dragged) {
    if (node_being_dragged) {
      node_being_dragged.__AUN_nodeBeingDragged = true;
    }
    return origOnNodeDragStart?.apply(this, arguments);
  };
  const origOnNodeDragEnd = canvas.onNodeDragEnd;
  canvas.onNodeDragEnd = function (event) {
    if (canvas.graph?._nodes) {
      for (const n of canvas.graph._nodes) {
        n.__AUN_nodeBeingDragged = false;
      }
    }
    return origOnNodeDragEnd?.apply(this, arguments);
  };
}

let footerRAF = null;

function startFooterRAF() {
  if (footerRAF) return;
  function rafLoop() {
    footerRAF = requestAnimationFrame(rafLoop);
    if (!app?.canvas?.graph) return;
    const currentGraph = app.canvas.graph;
    for (const [nodeId, node] of activeFooters) {
      if (node.type === undefined) {
        activeFooters.delete(nodeId);
        continue;
      }
      if (node.graph !== currentGraph) {
        const el = node.__AUN_faceidFooter;
        if (el) el.style.display = "none";
        continue;
      }
      syncAndPositionFooter(node);
    }
    if (activeFooters.size === 0) {
      cancelAnimationFrame(footerRAF);
      footerRAF = null;
    }
  }
  rafLoop();
}

function scheduleFooterUpdate() {
  startFooterRAF();
}

function updateVisibility(node) {
  const count = getVisibleCount(node);
  const compact = isCompact(node);

  applyCompactSlotLabels(node);

  const mpW = getWidget(node, "manual_preset");
  if (mpW) {
    const opts = Array.from({ length: count }, (_, i) => String(i + 1));
    mpW.options = mpW.options || {};
    mpW.options.values = opts;
    if (!opts.includes(String(mpW.value))) {
      mpW.value = opts[opts.length - 1];
    }
  }

  applyWidgetHiddenState(getWidget(node, "visible_inputs"), compact);
  applyWidgetHiddenState(getWidget(node, "case_sensitive"), compact);
  applyWidgetHiddenState(getWidget(node, "match_keywords"), compact);

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

  if (compact) {
    ensureFooter(node);
    activeFooters.set(node.id, node);
    scheduleFooterUpdate();
  } else {
    const el = node.__AUN_faceidFooter;
    if (el) {
      el.style.display = "none";
      activeFooters.delete(node.id);
    }
  }
}

app.registerExtension({
  name: "AUN.KeywordFaceIDSettings",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;

    setupDragMonitor();

    const origGetOutputPos = nodeType.prototype.getOutputPos;
    if (typeof origGetOutputPos === "function") {
      nodeType.prototype.getOutputPos = function (index) {
        if (isCompact(this)) {
          return origGetOutputPos.call(this, 0);
        }
        return origGetOutputPos.apply(this, arguments);
      };
    }

    const origComputeSize = nodeType.prototype.computeSize;
    if (typeof origComputeSize === "function") {
      nodeType.prototype.computeSize = function (out) {
        if (isCompact(this)) {
          const s = origComputeSize.call(this, out);
          s[1] = getMinimumCompactHeight(this);
          return s;
        }
        return origComputeSize.apply(this, arguments);
      };
    }

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
      drawFooterBox(ctx, this);
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
    preset_number: detail.preset_number ?? "",
  };
  if (isCompact(node)) {
    syncAndPositionFooter(node);
  }
});