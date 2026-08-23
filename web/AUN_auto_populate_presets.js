import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyWidgetHiddenState, ensureHiddenAware, getWidget, injectStyles, forceRedraw, isNodeCollapsed } from "./index.js";

const NODE_CLASS = "AUNAutoPopulatePresets";
const MAX_ROWS = 20;
const MAX_WIDGETS = 25;
const PROP_KEY = "_AUN_compactMode";
const PROP_SHOW_BOX = "_AUN_showMatchBox";
const TITLE_H = 28;
const FOOTER_H = 70;
const FOOTER_PAD = 12;
const FOOTER_BOTTOM = 4;

function getVisibleRows(node) {
  const w = getWidget(node, "visible_rows");
  const val = w?.value;
  return Number.isFinite(val) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(val))) : 5;
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
      console.warn("AUNAutoPopulatePresets: computeSize failed", err);
    }
  }
}

function getFooterHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node) || !showBox(node)) return 0;
  return FOOTER_H;
}

function getRailBottomY(node) {
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  return Math.max(0, (1 + 0.7) * slotH);
}

function getMinimumCompactHeight(node) {
  const footerH = getFooterHeight(node);
  const base = Math.max(TITLE_H, getRailBottomY(node));
  return footerH > 0 ? base + FOOTER_PAD + footerH + FOOTER_BOTTOM : base + FOOTER_BOTTOM;
}

function drawFooterBox(ctx, node) {
  const footerH = getFooterHeight(node);
  if (footerH <= 0 || node.__AUN_nodeBeingDragged) return;
  const w = node?.size?.[0] ?? 300;
  const x0 = 8;
  const x1 = w - 8;
  const y0 = getRailBottomY(node) + FOOTER_PAD;
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
  if (globalThis.__AUN_autopop_footer_styles) return;
  globalThis.__AUN_autopop_footer_styles = true;
  injectStyles("AUN-autopop-footer-styles", `
    .AUN-autopop-footer {
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
    .AUN-autopop-footer::-webkit-scrollbar { width: 5px; }
    .AUN-autopop-footer::-webkit-scrollbar-track { background: transparent; }
    .AUN-autopop-footer::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
    .AUN-autopop-footer::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
    .AUN-autopop-footer b { font-weight: 700; }
  `);
}

function ensureFooter(node) {
  if (node.__AUN_autopopFooter) return node.__AUN_autopopFooter;
  ensureFooterStyles();
  const el = document.createElement("div");
  el.className = "AUN-autopop-footer";
  document.body.appendChild(el);
  node.__AUN_autopopFooter = el;
  activeFooters.set(node.id, node);
  return el;
}

function disposeFooter(node) {
  node.__AUN_autopopFooter?.remove?.();
  node.__AUN_autopopFooter = null;
  activeFooters.delete(node.id);
}

const activeFooters = new Map();

// ------------------------------------------------------------------
// Link tracing
// ------------------------------------------------------------------

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
  const labelSlotIdx = n.outputs?.findIndex(o => o.name === "label");
  const preferredSlot = labelSlotIdx >= 0 ? labelSlotIdx : link.origin_slot;
  const slotKey = `__AUN_lastOutput_${preferredSlot}`;
  if (n[slotKey] != null) return String(n[slotKey]);
  const connectedSlotKey = `__AUN_lastOutput_${link.origin_slot}`;
  if (n[connectedSlotKey] != null) return String(n[connectedSlotKey]);
  if (n.__AUN_lastOutput != null) return String(n.__AUN_lastOutput);

  const textWidget = n.widgets?.find((w) => {
    const name = (w.name || "").toLowerCase();
    if (["visible_rows", "case_sensitive", "reference_phrase", "manual_preset", "match_keywords",
         "node_identifier", "filter_include", "filter_exclude"].includes(name)) return false;
    const type = (w.type || "").toUpperCase();
    return type === "TEXT" || type === "STRING" || type === "CUSTOMTEXT";
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

// ------------------------------------------------------------------
// Widget rename/re-type from scan results
// ------------------------------------------------------------------

function renameAndRetypeWidgets(node, widgetData) {
  const count = getVisibleRows(node);

  if (!node.__aun_slotMapping) node.__aun_slotMapping = {};

  for (let i = 1; i <= MAX_ROWS; i++) {
    const show = i <= count;
    const rowKey = "row" + i;
    if (!node.__aun_slotMapping[rowKey]) node.__aun_slotMapping[rowKey] = {};

    const kwW = getWidget(node, "keyword" + i);
    if (kwW) applyWidgetHiddenState(kwW, !show);

    if (!show) {
      for (let s = 1; s <= MAX_WIDGETS; s++) {
        const w = getWidget(node, "slot" + i + "_" + s);
        if (w) applyWidgetHiddenState(w, true);
      }
      continue;
    }

    const rowMap = node.__aun_slotMapping[rowKey];
    const usedSlots = new Set(Object.values(rowMap));
    const newNames = widgetData.map(w => w.name);
    const newByName = new Map(widgetData.map(w => [w.name, w]));

    // Remove mappings for widgets no longer in the scan
    for (const [name, slot] of Object.entries(rowMap)) {
      if (!newNames.includes(name)) {
        usedSlots.delete(slot);
        delete rowMap[name];
      }
    }

    // Assign new widgets to unoccupied slots in order
    for (const name of newNames) {
      if (rowMap[name] != null) continue;
      for (let s = 1; s <= MAX_WIDGETS; s++) {
        if (!usedSlots.has(s)) {
          rowMap[name] = s;
          usedSlots.add(s);
          break;
        }
      }
    }

    // Apply mapping: rename/re-type each slot
    for (let s = 1; s <= MAX_WIDGETS; s++) {
      const w = getWidget(node, "slot" + i + "_" + s);
      if (!w) continue;

      const assignedName = Object.entries(rowMap).find(([_, v]) => v === s)?.[0];
      if (!assignedName || !newByName.has(assignedName)) {
        applyWidgetHiddenState(w, true);
        continue;
      }

      const wd = newByName.get(assignedName);
      applyWidgetHiddenState(w, false);
      const displayName = wd.name + i;

      if (wd.options && Array.isArray(wd.options) && wd.options.length > 0) {
        w.type = "combo";
        w.options = w.options || {};
        w.options.values = [...wd.options];
        if (!wd.options.includes(String(w.value))) {
          w.value = wd.options[0];
        }
      } else if (wd.type === "INT") {
        w.type = "number";
        w.options = w.options || {};
        w.options.step = 1;
        w.options.precision = 0;
      } else if (wd.type === "FLOAT") {
        w.type = "number";
        w.options = w.options || {};
        w.options.step = 0.05;
        w.options.precision = 2;
      } else if (wd.type === "BOOLEAN") {
        w.type = "toggle";
      } else {
        w.type = "string";
      }

      w.__aun_displayName = displayName;
      w.__aun_widgetName = wd.name;
      w.__aun_rowIndex = i;
      w.label = displayName;
    }
  }
}

// ------------------------------------------------------------------
// Keyword matching
// ------------------------------------------------------------------

function splitKeywords(raw) {
  return String(raw ?? "").split(",").map(k => k.trim()).filter(Boolean);
}

function getRowValues(node, rowIndex, widgetData) {
  const values = {};
  for (let s = 0; s < widgetData.length; s++) {
    const genericName = "slot%d_%d".replace("%d", rowIndex).replace("%d", s + 1);
    const w = getWidget(node, genericName);
    values[widgetData[s].name] = w?.value ?? "";
  }
  return values;
}

function findMatch(node, widgetData) {
  const ref = getReferencePhrase(node);
  if (!ref) return null;
  const csWidget = getWidget(node, "case_sensitive");
  const cs = !!csWidget?.value;
  const search = cs ? ref : ref.toLowerCase();
  const count = getVisibleRows(node);

  for (let i = 1; i <= count; i++) {
    const kws = splitKeywords(getWidget(node, "keyword" + i)?.value);
    for (const kw of kws) {
      const matchKw = cs ? kw : kw.toLowerCase();
      if (search.includes(matchKw)) {
        return { index: i, keyword: kw, values: getRowValues(node, i, widgetData) };
      }
    }
  }
  return null;
}

function getMatchData(node) {
  const last = node.__AUN_lastMatch;
  if (last && last.index > 0) return last;

  const widgetData = getWidgetData(node);
  if (!widgetData.length) return null;

  const keywordsOn = String(getWidget(node, "match_keywords")?.value ?? "Yes") === "Yes";
  if (keywordsOn) {
    const matched = findMatch(node, widgetData);
    if (matched) return matched;
  }
  const mp = Math.max(1, Math.min(Number(getWidget(node, "manual_preset")?.value ?? 1), getVisibleRows(node)));
  return { index: mp, keyword: "", values: getRowValues(node, mp, widgetData) };
}

function getWidgetData(node) {
  try { return JSON.parse(node.__aun_widgetDataJSON || "[]"); } catch { return []; }
}

// ------------------------------------------------------------------
// Output relabeling
// ------------------------------------------------------------------

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

function relabelOutputs(node, widgetData) {
  const rowMap = node.__aun_slotMapping?.row1 || {};
  const nameBySlot = new Map(Object.entries(rowMap).map(([name, slot]) => [slot, name]));
  const newByName = new Map(widgetData.map(w => [w.name, w]));

  for (let i = 0; i < (node.outputs?.length ?? 0); i++) {
    const slot = i + 1;
    const assignedName = nameBySlot.get(slot);
    let displayName = "";
    if (assignedName && newByName.has(assignedName)) {
      displayName = assignedName;
    } else if (i < widgetData.length) {
      displayName = widgetData[i].name;
    }
    node.outputs[i].label = displayName;
    node.outputs[i].name = displayName || `value_${slot}`;
  }
}

// ------------------------------------------------------------------
// Visibility
// ------------------------------------------------------------------

function updateVisibility(node) {
  const count = getVisibleRows(node);
  const compact = isCompact(node);
  const widgetData = getWidgetData(node);

  applyCompactSlotLabels(node);

  // Show/hide keyword and slot widgets
  for (let i = 1; i <= MAX_ROWS; i++) {
    const show = i <= count;
    const kwW = getWidget(node, "keyword" + i);
    if (kwW) applyWidgetHiddenState(kwW, !show || compact);

    for (let s = 1; s <= MAX_WIDGETS; s++) {
      const genericName = "slot%d_%d".replace("%d", i).replace("%d", s);
      const w = getWidget(node, genericName);
      if (w) {
        const visible = show && s <= widgetData.length && !compact;
        applyWidgetHiddenState(w, !visible);
      }
    }
  }

  // Hide config widgets in compact mode
  for (const name of ["visible_rows", "case_sensitive", "match_keywords", "node_identifier",
                       "filter_include", "filter_exclude"]) {
    applyWidgetHiddenState(getWidget(node, name), compact);
  }
  // manual_preset is always visible (matches FaceIDSettings behavior)
  const mpW = getWidget(node, "manual_preset");
  if (mpW) {
    const opts = Array.from({ length: count }, (_, i) => String(i + 1));
    mpW.options = mpW.options || {};
    mpW.options.values = opts;
    if (!opts.includes(String(mpW.value))) {
      mpW.value = opts[opts.length - 1];
    }
  }

  if (compact) {
    node.size[1] = getMinimumCompactHeight(node);
    ensureFooter(node);
    activeFooters.set(node.id, node);
    scheduleFooterUpdate();
  } else {
    resizeNode(node);
    const el = node.__AUN_autopopFooter;
    if (el) {
      el.style.display = "none";
      activeFooters.delete(node.id);
    }
  }

  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);
}

// ------------------------------------------------------------------
// Footer display
// ------------------------------------------------------------------

function formatMatchSummary(match) {
  if (!match) return "no keyword match";
  const parts = [];
  if (match.index > 0 && match.keyword) parts.push(`#${match.index} ${match.keyword}`);
  else if (match.index > 0) parts.push(`row ${match.index}`);
  if (match.values) {
    for (const [k, v] of Object.entries(match.values)) {
      if (v != null && v !== "") parts.push(`${k}=${v}`);
    }
  }
  return parts.join("  ");
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
    if (!(otherRight <= selfScreen.x || otherScreen.x >= selfRight ||
          otherBottom <= selfScreen.y || otherScreen.y >= selfBottom)) {
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
  const text = formatMatchSummary(match);
  if (el.__AUN_footerCache !== text) {
    el.__AUN_footerCache = text;
    el.textContent = "";
    if (match && match.index > 0) {
      const b = document.createElement("b");
      b.textContent = match.keyword ? `#${match.index} ${match.keyword}` : `row ${match.index}`;
      el.appendChild(b);
      const detailParts = [];
      if (match.values) {
        for (const [k, v] of Object.entries(match.values)) {
          if (v != null && v !== "") detailParts.push(`${k}=${v}`);
        }
      }
      if (detailParts.length) {
        el.appendChild(document.createTextNode("  " + detailParts.join("  ")));
      }
    } else {
      el.textContent = "no keyword match";
    }
  }
  el.style.opacity = match && match.index > 0 ? "1" : "0.55";
  const y0 = getRailBottomY(node) + FOOTER_PAD;
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
    if (node_being_dragged) node_being_dragged.__AUN_nodeBeingDragged = true;
    return origOnNodeDragStart?.apply(this, arguments);
  };
  const origOnNodeDragEnd = canvas.onNodeDragEnd;
  canvas.onNodeDragEnd = function (event) {
    if (canvas.graph?._nodes) {
      for (const n of canvas.graph._nodes) n.__AUN_nodeBeingDragged = false;
    }
    return origOnNodeDragEnd?.apply(this, arguments);
  };
}

let footerRAF = null;
function startFooterRAF() {
  if (footerRAF) return;
  function rafLoop() {
    footerRAF = null;
    if (!activeFooters.size) return;
    for (const [id, node] of activeFooters) {
      if (!app?.graph?.getNodeById?.(id)) {
        activeFooters.delete(id);
        continue;
      }
      syncAndPositionFooter(node);
    }
    if (activeFooters.size) footerRAF = requestAnimationFrame(rafLoop);
  }
  footerRAF = requestAnimationFrame(rafLoop);
}
function scheduleFooterUpdate() { startFooterRAF(); }

// ------------------------------------------------------------------
// Extension registration
// ------------------------------------------------------------------

app.registerExtension({
  name: "AUN.AutoPopulatePresets",

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

      // Hook visible_rows callback
      const vis = getWidget(this, "visible_rows");
      if (vis && !vis.__aun_hooked) {
        vis.__aun_hooked = true;
        const orig = vis.callback;
        vis.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => updateVisibility(this.node));
        };
      }

      // Hook match_keywords callback
      const mk = getWidget(this, "match_keywords");
      if (mk && !mk.__aun_hooked) {
        mk.__aun_hooked = true;
        const orig = mk.callback;
        mk.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => updateVisibility(this.node));
        };
      }

      // Double-click to toggle compact
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

      requestAnimationFrame(() => updateVisibility(this));
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      // Re-apply widget rename/re-type from saved scan data
      if (this.__aun_widgetDataJSON) {
        try {
          const data = JSON.parse(this.__aun_widgetDataJSON);
          renameAndRetypeWidgets(this, data);
          relabelOutputs(this, data);
        } catch {}
      }
      requestAnimationFrame(() => updateVisibility(this));
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

// ------------------------------------------------------------------
// WebSocket: receive scan results
// ------------------------------------------------------------------

api.addEventListener("AUN_auto_populate_presets_scanned", ({ detail }) => {
  if (!detail || !app?.graph) return;

  let node = app.graph.getNodeById?.(detail.node_id);
  if (!node) {
    const numericId = parseInt(detail.node_id, 10);
    if (!Number.isNaN(numericId)) {
      node = app.graph.getNodeById?.(numericId);
    }
  }
  if (!node) return;
  if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;

  let newWidgetData = [];
  try { newWidgetData = JSON.parse(detail.widget_data || "[]"); } catch {}

  // Reset slot mapping when target changes
  if (detail.target_title && detail.target_title !== node.__aun_targetTitle) {
    node.__aun_slotMapping = {};
  }

  // Merge: preserve previously discovered widgets that disappeared from this scan
  // (e.g. because the user connected an output to the target's input)
  let prevWidgetData = [];
  try { prevWidgetData = JSON.parse(node.__aun_widgetDataJSON || "[]"); } catch {}
  const prevByName = new Map(prevWidgetData.map(w => [w.name, w]));
  for (const w of newWidgetData) prevByName.delete(w.name);
  for (const w of prevByName.values()) newWidgetData.push(w);

  const mergedJSON = JSON.stringify(newWidgetData);
  node.__aun_widgetDataJSON = mergedJSON;
  node.__aun_targetTitle = detail.target_title || "";

  // Rename and re-type generic slot widgets to match scan results
  renameAndRetypeWidgets(node, newWidgetData);

  // Relabel outputs
  relabelOutputs(node, newWidgetData);

  // Refresh
  updateVisibility(node);
});
