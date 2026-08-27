import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyWidgetHiddenState, getWidget, injectStyles, forceRedraw, isNodeCollapsed } from "./index.js";
import { openPresetSetupDialog } from "./AUN_auto_populate_presets_setup_dialog.js";
import { openWidgetsModal } from "./AUN_auto_populate_presets_widgets_modal.js";

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
         "node_identifier"].includes(name)) return false;
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

function getPendingOutputLinks(node) {
  if (Array.isArray(node?.__aun_pendingOutputLinks)) {
    return node.__aun_pendingOutputLinks;
  }
  try {
    const saved = JSON.parse(node?.properties?._AUN_pendingOutputLinks || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function setPendingOutputLinks(node, links) {
  const safeLinks = Array.isArray(links) ? links : [];
  node.__aun_pendingOutputLinks = safeLinks;
  node.properties = node.properties || {};
  node.properties._AUN_pendingOutputLinks = JSON.stringify(safeLinks);
}

function getActiveSet(node) {
  const raw = node?.properties?.["_AUN_activeWidgets"];
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr);
  } catch {}
  return null;
}

function filterByActiveSet(node, values) {
  const activeSet = getActiveSet(node);
  if (!activeSet) return values;
  if (activeSet.size === 0) return {};
  const filtered = {};
  for (const [k, v] of Object.entries(values)) {
    if (activeSet.has(k)) filtered[k] = v;
  }
  return filtered;
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

// ------------------------------------------------------------------
// Dynamic output slot management
// ------------------------------------------------------------------

function syncOutputs(node) {
  if (!node) return;
  const widgetData = getWidgetData(node);

  // Build desired output names from active widgets
  let names;
  if (!widgetData.length) {
    // No scan data yet: on a fresh load without persisted scan results,
    // preserve whatever outputs/links were restored from the workflow.
    if (!node.__aun_widgetDataJSON && (node.outputs?.length)) return;
    names = [];
  } else {
    const activeData = getActiveWidgetData(node);
    names = activeData.map(w => w.name);
  }

  const needed = names.length;
  const current = node.outputs || [];

  // Compare current layout with desired (by name)
  let changed = current.length !== needed;
  if (!changed) {
    for (let i = 0; i < needed; i++) {
      if (current[i]?.name !== names[i]) { changed = true; break; }
    }
  }

  if (changed) {
    applyLayout(node, names);
  }

  // Set labels, tooltips, names
  for (let i = 0; i < needed; i++) {
    if (node.outputs[i]) {
      node.outputs[i].label = names[i];
      node.outputs[i].name = names[i] || `value_${i + 1}`;
      node.outputs[i].tooltip = `Widget: ${names[i]}`;
    }
  }

  // Apply compact label blanking after setting labels
  applyCompactSlotLabels(node);

  // Sync hidden active_widgets widget for Python backend (as [name, slot] pairs)
  const aw = getWidget(node, "active_widgets");
  if (aw) {
    const rowMap = node.__aun_slotMapping?.row1 || {};
    const pairs = names.map((n, idx) => [n, rowMap[n] ?? (idx + 1)]);
    const val = names.length ? JSON.stringify(pairs) : "";
    aw.value = val;
  }

  // Self-heal links: correct origin_slot indices for restored/corrupted workflows
  healOutputLinks(node);
}

function applyLayout(node, desiredNames) {
  const current = node.outputs || [];
  const originalOutputs = current.slice();
  const byName = new Map(originalOutputs.map((slot) => [slot.name, slot]));
  const desiredSet = new Set(desiredNames);
  const graph = node.graph || app.graph;
  const getLink = (linkId) =>
    graph?.links?.get ? graph.links.get(linkId) : graph?.links?.[linkId];
  const getTargetName = (link) => {
    if (!link || link.origin_id !== node.id) return null;
    const target = graph?.getNodeById?.(link.target_id);
    return target?.inputs?.[link.target_slot]?.name || null;
  };
  const getPreviewAnyName = (link, sourceIndex) => {
    if (!link || link.origin_id !== node.id) return null;
    const target = graph?.getNodeById?.(link.target_id);
    const targetType = target?.comfyClass || target?.type;
    if (
      targetType !== "AUNShowAnyMulti" &&
      targetType !== "AUNPassthroughAnyMulti"
    ) {
      return null;
    }
    const targetInputName = getTargetName(link);
    const match = /^input_(\d+)$/.exec(targetInputName || "");
    const outputIndex = match ? Number(match[1]) - 1 : sourceIndex;
    return Number.isInteger(outputIndex) && outputIndex >= 0
      ? desiredNames[outputIndex] || null
      : null;
  };

  const linksByName = new Map();
  const unresolvedLinks = [];
  const detachedLinks = [];
  const activeSet = getActiveSet(node);
  const scannedNames = new Set(getWidgetData(node).map((widget) => widget.name));
  const isHiddenByManage = (slot) =>
    !!activeSet && scannedNames.has(slot.name) && !desiredSet.has(slot.name);
  for (const slot of originalOutputs) {
    for (const linkId of [...(slot.links || [])]) {
      const link = getLink(linkId);
      const targetName = getTargetName(link);
      const sourceIndex = originalOutputs.indexOf(slot);
      if (isHiddenByManage(slot)) {
        detachedLinks.push({
          kind: "detached",
          outputName: slot.name,
          targetId: link?.target_id,
          targetSlot: link?.target_slot,
          targetName,
          sourceIndex,
        });
        if (link && Number.isInteger(link.target_slot)) {
          graph.removeLink?.(linkId);
        }
        continue;
      }
      const previewName = getPreviewAnyName(link, sourceIndex);
      const outputName =
        targetName && desiredSet.has(targetName) ? targetName : previewName;
      const record = { id: linkId, targetName, sourceIndex };
      if (outputName && desiredSet.has(outputName)) {
        const links = linksByName.get(outputName) || [];
        links.push(record);
        linksByName.set(outputName, links);
      } else if (!desiredSet.has(slot.name)) {
        const detachedRecord = {
          kind: "detached",
          outputName: slot.name,
          targetId: link?.target_id,
          targetSlot: link?.target_slot,
          targetName,
          sourceIndex,
        };
        detachedLinks.push(detachedRecord);
        if (link && Number.isInteger(link.target_slot)) {
          graph.removeLink?.(linkId);
        }
      } else {
        const detachedRecord = {
          kind: "detached",
          outputName: slot.name,
          targetId: link?.target_id,
          targetSlot: link?.target_slot,
          targetName,
          sourceIndex,
        };
        unresolvedLinks.push(detachedRecord);
        if (link && Number.isInteger(link.target_slot)) {
          graph.removeLink?.(linkId);
        }
      }
    }
    slot.links = [];
  }

  const pending = getPendingOutputLinks(node);
  const pendingByKey = new Map();
  for (const record of [...pending, ...detachedLinks, ...unresolvedLinks]) {
    const key = record?.kind === "detached"
      ? `detached:${record.outputName}:${record.targetId}:${record.targetSlot}`
      : `live:${record.id}`;
    pendingByKey.set(key, record);
  }
  setPendingOutputLinks(node, [...pendingByKey.values()]);

  const reusableByName = new Map(byName);
  const newOutputs = [];
  for (const name of desiredNames) {
    const output = reusableByName.get(name) || node.addOutput(name, "*");
    reusableByName.delete(name);
    output.name = name;
    output.links = linksByName.get(name)?.map((record) => record.id) || [];
    newOutputs.push(output);
  }

  // Replace array contents in place so graph references remain valid.
  current.splice(0, current.length, ...newOutputs);
  restorePendingOutputLinks(node, desiredNames);
}

function restorePendingOutputLinks(
  node,
  desiredNames = getActiveWidgetData(node).map((widget) => widget.name),
) {
  const pending = getPendingOutputLinks(node);
  const outputs = node?.outputs || [];
  const graph = node?.graph || app.graph;
  if (!node || !graph || !Array.isArray(pending) || !outputs.length) return;

  const desiredSet = new Set(desiredNames);
  const remaining = [];
  const getLink = (linkId) =>
    graph?.links?.get ? graph.links.get(linkId) : graph?.links?.[linkId];
  const getPreviewAnyIndex = (link) => {
    const target = graph.getNodeById?.(link?.target_id);
    const targetType = target?.comfyClass || target?.type;
    if (
      targetType !== "AUNShowAnyMulti" &&
      targetType !== "AUNPassthroughAnyMulti"
    ) {
      return -1;
    }
    const targetName = target?.inputs?.[link.target_slot]?.name;
    const match = /^input_(\d+)$/.exec(targetName || "");
    return match ? Number(match[1]) - 1 : -1;
  };
  const ensurePreviewAnyInput = (target, targetSlot) => {
    const targetType = target?.comfyClass || target?.type;
    if (
      (targetType !== "AUNShowAnyMulti" &&
        targetType !== "AUNPassthroughAnyMulti") ||
      !Number.isInteger(targetSlot)
    ) {
      return;
    }
    while (
      typeof target.addInput === "function" &&
      Array.isArray(target.inputs) &&
      target.inputs.length <= targetSlot
    ) {
      target.addInput(`input_${target.inputs.length + 1}`, "*");
    }
  };

  for (const record of pending) {
    if (record?.kind === "detached") {
      const outputIndex = outputs.findIndex(
        (output) => output?.name === record.outputName,
      );
      const target = graph.getNodeById?.(record.targetId);
      const targetSlot = record.targetSlot;
      ensurePreviewAnyInput(target, targetSlot);
      const targetInput = target?.inputs?.[targetSlot];
      if (
        outputIndex < 0 ||
        !target ||
        !Number.isInteger(targetSlot) ||
        !targetInput
      ) {
        remaining.push(record);
        continue;
      }
      const existingLink = target.getInputLink?.(targetSlot) || targetInput.link;
      if (existingLink != null) {
        remaining.push(record);
        continue;
      }
      const connected = node.connect?.(outputIndex, target, targetSlot);
      const restoredLink =
        connected || target.getInputLink?.(targetSlot) || targetInput.link;
      if (restoredLink != null || targetInput.link != null) continue;
      remaining.push(record);
      continue;
    }
    const link = getLink(record.id);
    if (!link || link.origin_id !== node.id) continue;
    const target = graph.getNodeById?.(link.target_id);
    const targetName = target?.inputs?.[link.target_slot]?.name;
    const previewIndex = getPreviewAnyIndex(link);
    const outputIndex = targetName && desiredSet.has(targetName)
      ? outputs.findIndex((output) => output?.name === targetName)
      : previewIndex >= 0 && previewIndex < outputs.length
        ? previewIndex
        : -1;

    if (outputIndex < 0) {
      if (!targetName || previewIndex < 0) {
        // Keep the record only while the target node/input is still restoring.
        // The live link must not remain attached to an absent output slot.
        const target = graph.getNodeById?.(link.target_id);
        if (!target || !target.inputs?.[link.target_slot]) {
          remaining.push(record);
        } else {
          graph.removeLink?.(record.id);
        }
      } else {
        graph.removeLink?.(record.id);
      }
      continue;
    }

    const output = outputs[outputIndex];
    output.links = output.links || [];
    if (!output.links.includes(record.id)) output.links.push(record.id);
    link.origin_slot = outputIndex;
  }

  setPendingOutputLinks(node, remaining);
}

function healOutputLinks(node) {
  const g = node.graph || app.graph;
  if (!g) return;
  const outputs = node.outputs || [];
  restorePendingOutputLinks(node);

  for (let i = 0; i < outputs.length; i++) {
    const linkIds = [...(outputs[i].links || [])];
    for (const lid of linkIds) {
      const link = g.links?.get ? g.links.get(lid) : g.links?.[lid];
      if (!link || link.origin_id !== node.id) continue;

      // Look up the target input's name
      const target = g.getNodeById?.(link.target_id);
      const targetInput = target?.inputs?.[link.target_slot];
      const targetName = targetInput?.name;
      const targetType = target?.comfyClass || target?.type;
      const previewMatch = /^input_(\d+)$/.exec(targetName || "");
      const isPreviewAny =
        targetType === "AUNShowAnyMulti" ||
        targetType === "AUNPassthroughAnyMulti";
      if (isPreviewAny && previewMatch) {
        const previewIndex = Number(previewMatch[1]) - 1;
        if (previewIndex >= 0 && previewIndex < outputs.length && previewIndex !== i) {
          const oldSlot = outputs[i];
          const newSlot = outputs[previewIndex];
          oldSlot?.links && (oldSlot.links = oldSlot.links.filter((id) => id !== lid));
          newSlot.links = newSlot.links || [];
          if (!newSlot.links.includes(lid)) newSlot.links.push(lid);
          link.origin_slot = previewIndex;
        }
        continue;
      }
      if (!targetName) continue;

      // Find the correct output slot by name (or by widgetName metadata)
      const correctIdx = outputs.findIndex(
        (s) => s?.name === targetName || s?.label === targetName
      );
      if (correctIdx < 0 || correctIdx === i) continue;

      // Move the link to the correct slot
      const oldSlot = outputs[i];
      const newSlot = outputs[correctIdx];
      if (oldSlot?.links) oldSlot.links = oldSlot.links.filter((id) => id !== lid);
      if (!newSlot.links) newSlot.links = [];
      newSlot.links.push(lid);
      link.origin_slot = correctIdx;
    }
  }
}

function getActiveWidgetData(node) {
  const all = getWidgetData(node);
  const activeSet = getActiveSet(node);
  if (!activeSet) return all;
  if (activeSet.size === 0) return [];
  return all.filter((w) => activeSet.has(w.name));
}

// ------------------------------------------------------------------
// Visibility
// ------------------------------------------------------------------

function updateVisibility(node) {
  const count = getVisibleRows(node);
  const compact = isCompact(node);
  const widgetData = getWidgetData(node);

  // Re-apply rename/re-type from saved scan data when present
  if (widgetData.length) {
    renameAndRetypeWidgets(node, widgetData);
  }

  // Rebuild output slots to match active widgets
  syncOutputs(node);

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
  for (const name of ["visible_rows", "case_sensitive", "match_keywords", "node_identifier"]) {
    applyWidgetHiddenState(getWidget(node, name), compact);
  }
  // Always hide active_widgets (managed by syncOutputs, not user-editable)
  applyWidgetHiddenState(getWidget(node, "active_widgets"), true);
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

function formatMatchSummary(node, match) {
  if (!match) return "no keyword match";
  const parts = [];
  if (match.index > 0 && match.keyword) parts.push(`#${match.index} ${match.keyword}`);
  else if (match.index > 0) parts.push(`preset ${match.index}`);
  if (match.values) {
    const filtered = filterByActiveSet(node, match.values);
    for (const [k, v] of Object.entries(filtered)) {
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
  const text = formatMatchSummary(node, match);
  if (el.__AUN_footerCache !== text) {
    el.__AUN_footerCache = text;
    el.textContent = "";
    if (match && match.index > 0) {
      const b = document.createElement("b");
      b.textContent = match.keyword ? `#${match.index} ${match.keyword}` : `preset ${match.index}`;
      el.appendChild(b);
      const detailParts = [];
      if (match.values) {
        const filtered = filterByActiveSet(node, match.values);
        for (const [k, v] of Object.entries(filtered)) {
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
let footerLastRun = 0;
const FOOTER_THROTTLE_MS = 66;
function startFooterRAF() {
  if (footerRAF) return;
  function rafLoop(ts) {
    footerRAF = null;
    if (!activeFooters.size) return;
    if (ts - footerLastRun < FOOTER_THROTTLE_MS) {
      footerRAF = requestAnimationFrame(rafLoop);
      return;
    }
    footerLastRun = ts;
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

function applyAutoTitle(node, targetTitle) {
  const wanted = targetTitle ? `${targetTitle} Presets` : null;
  if (!wanted) return;
  const prev = node.__AUN_prevAutoTitle;
  const isDefault = !node.title || node.title === "Auto-Populate Presets" || node.title === prev;
  if (isDefault && node.title !== wanted) {
    node.title = wanted;
  }
  node.__AUN_prevAutoTitle = wanted;
}

function canvasMouseLocalOf(node) {
  const g = app?.canvas?.graph_mouse;
  if (Array.isArray(g) && g.length >= 2 && Array.isArray(node?.pos)) {
    return [g[0] - node.pos[0], g[1] - node.pos[1]];
  }
  return null;
}

function installSetupTitleButton(node) {
  if (node.__AUN_autopop_setupTitleInstalled) return;
  if (typeof node.addTitleButton !== "function") return;
  node.__AUN_autopop_setupTitleInstalled = true;
  const BTN_H = 18;

  // ── Setup button ──
  const setupW = 54;
  const btn = node.addTitleButton({
    name: "AUN_autopop_setup",
    text: "Setup",
    fontSize: 11,
    height: BTN_H,
    cornerRadius: 4,
  });
  btn.getWidth = function getWidth() { return this.visible ? setupW : 0; };
  btn.draw = function draw(ctx, x, y) {
    if (!this.visible) return;
    const x0 = x + (this.xOffset || 0);
    const y0 = y + (this.yOffset || 0);
    const h = this.height || BTN_H;
    this._last_area = [x0, y0, setupW, h];
    const mouse = canvasMouseLocalOf(node);
    const hovered = !!(mouse && mouse[0] >= x0 - 0.5 && mouse[0] <= x0 + setupW + 0.5 && mouse[1] >= y0 - 0.5 && mouse[1] <= y0 + h + 0.5);
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x0 + 0.5, y0 + 0.5, setupW - 1, h - 1, 4);
    else ctx.rect(x0 + 0.5, y0 + 0.5, setupW - 1, h - 1);
    ctx.fillStyle = hovered ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = hovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = hovered ? "#ffffff" : "#dbe4ff";
    ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("\u2699 Setup", x0 + setupW / 2, y0 + h / 2 + 0.5);
    ctx.restore();
  };
  btn.isPointInside = function isPointInside(x, y) {
    const a = this._last_area;
    if (!a) return false;
    return x >= a[0] && x <= a[0] + a[2] && y >= a[1] && y <= a[1] + a[3];
  };

  // ── Widgets button ──
  const widgetsW = 68;
  const wbtn = node.addTitleButton({
    name: "AUN_autopop_widgets",
    text: "Widgets",
    fontSize: 11,
    height: BTN_H,
    cornerRadius: 4,
  });
  wbtn.getWidth = function getWidth() { return this.visible ? widgetsW : 0; };
  wbtn.draw = function draw(ctx, x, y) {
    if (!this.visible) return;
    const x0 = x + (this.xOffset || 0);
    const y0 = y + (this.yOffset || 0);
    const h = this.height || BTN_H;
    this._last_area = [x0, y0, widgetsW, h];
    const mouse = canvasMouseLocalOf(node);
    const hovered = !!(mouse && mouse[0] >= x0 - 0.5 && mouse[0] <= x0 + widgetsW + 0.5 && mouse[1] >= y0 - 0.5 && mouse[1] <= y0 + h + 0.5);
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x0 + 0.5, y0 + 0.5, widgetsW - 1, h - 1, 4);
    else ctx.rect(x0 + 0.5, y0 + 0.5, widgetsW - 1, h - 1);
    ctx.fillStyle = hovered ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = hovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = hovered ? "#ffffff" : "#dbe4ff";
    ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("\u25a3 Widgets", x0 + widgetsW / 2, y0 + h / 2 + 0.5);
    ctx.restore();
  };
  wbtn.isPointInside = function isPointInside(x, y) {
    const a = this._last_area;
    if (!a) return false;
    return x >= a[0] && x <= a[0] + a[2] && y >= a[1] && y <= a[1] + a[3];
  };

  // ── Click handler ──
  const origOnTitleButtonClick = node.onTitleButtonClick?.bind(node);
  node.onTitleButtonClick = function onTitleButtonClick(button, canvas) {
    if (button && button.name === "AUN_autopop_setup") {
      openPresetSetupDialog(this, {
        onChanged: (n) => { updateVisibility(n); forceRedraw(n); },
      });
      return;
    }
    if (button && button.name === "AUN_autopop_widgets") {
      openWidgetsModal(this, {
        onChanged: (n) => { updateVisibility(n); forceRedraw(n); },
      });
      return;
    }
    if (origOnTitleButtonClick) origOnTitleButtonClick(button, canvas);
  };
}

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
          requestAnimationFrame(() => {
            this.node.__AUN_lastMatch = null;
            updateVisibility(this.node);
          });
        };
      }

      // Hook manual_preset callback — clear lastMatch so footer previews live
      const mpW = getWidget(this, "manual_preset");
      if (mpW && !mpW.__aun_hooked) {
        mpW.__aun_hooked = true;
        const orig = mpW.callback;
        mpW.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => {
            this.node.__AUN_lastMatch = null;
            const n = this.node;
            if (isCompact(n)) syncAndPositionFooter(n);
          });
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

      installSetupTitleButton(this);
      requestAnimationFrame(() => updateVisibility(this));
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      // Restore scan data from persisted property (survives F5 / workflow import)
      if (!this.__aun_widgetDataJSON && this.properties?._AUN_widgetDataJSON) {
        this.__aun_widgetDataJSON = this.properties._AUN_widgetDataJSON;
      }
      // Re-apply widget rename/re-type from saved scan data
      if (this.__aun_widgetDataJSON) {
        try {
          const data = JSON.parse(this.__aun_widgetDataJSON);
          renameAndRetypeWidgets(this, data);
        } catch {}
      }
      // Restore auto-title from persisted property
      applyAutoTitle(this, this.properties?._AUN_targetTitle || "");
      requestAnimationFrame(() => updateVisibility(this));
    };

    const protoOrigDrawFg = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      protoOrigDrawFg?.apply(this, arguments);
      drawFooterBox(ctx, this);
      if (!isCompact(this)) {
        const node = this;
        const rows = getVisibleRows(node);
        for (let i = 1; i <= rows; i++) {
          const kwW = getWidget(node, "keyword" + i);
          if (!kwW) continue;
          const wType = kwW.type || "text";
          let wy;
          if (wType === "combo" || wType === "number" || wType === "toggle" || wType === "boolean") {
            wy = kwW.y + 10;
          } else {
            wy = kwW.y - 1;
          }
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.32)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(4, wy);
          ctx.lineTo(node.size[0] - 4, wy);
          ctx.stroke();
          ctx.restore();
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
      options.push({
        content: showBox(this) ? "AUN: Hide match box" : "AUN: Show match box",
        callback: () => {
          setShowBox(this, !showBox(this));
          updateVisibility(this);
        },
      });
      options.push({
        content: "AUN: Setup presets...",
        callback: () => {
          openPresetSetupDialog(this, {
            onChanged: (n) => { updateVisibility(n); forceRedraw(n); },
          });
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
    requestAnimationFrame(() => {
      updateVisibility(node);
      // Second pass after ComfyUI finishes restoring links
      requestAnimationFrame(() => healOutputLinks(node));
      // Preview Any nodes may create their input sockets after the first pass.
      [50, 150, 300].forEach((delay) => {
        setTimeout(() => {
          if (app?.graph?.getNodeById?.(node.id) === node) {
            healOutputLinks(node);
          }
        }, delay);
      });
    });
  },
});

// ------------------------------------------------------------------
// WebSocket: receive scan results
// ------------------------------------------------------------------

api.addEventListener("AUN_auto_populate_presets_scanned", ({ detail }) => {
  if (!detail || !app?.graph) return;

  let node = app.graph.getNodeById?.(detail.node_id);
  if (!node) return;
  if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;

  let newWidgetData = [];
  try { newWidgetData = JSON.parse(detail.widget_data || "[]"); } catch {}

  // Reset slot mapping when target changes
  if (detail.target_title && detail.target_title !== node.__aun_targetTitle) {
    node.__aun_slotMapping = {};
  }

  // Merge: preserve previously discovered widgets that disappeared from this scan
  // (e.g. because the user connected an output to the target's input).
  // Re-insert at previous positions to keep layout stable across runs.
  let prevWidgetData = [];
  try { prevWidgetData = JSON.parse(node.__aun_widgetDataJSON || "[]"); } catch {}
  const prevByName = new Map(prevWidgetData.map((w, i) => [w.name, i]));
  const used = new Set();
  const merged = [];
  for (const w of newWidgetData) { merged.push(w); used.add(w.name); }
  for (const [name, prevIdx] of prevByName) {
    if (used.has(name)) continue;
    const pos = Math.min(prevIdx, merged.length);
    merged.splice(pos, 0, prevWidgetData[prevIdx]);
    used.add(name);
  }
  newWidgetData = merged;

  const mergedJSON = JSON.stringify(newWidgetData);
  node.__aun_widgetDataJSON = mergedJSON;
  node.properties._AUN_widgetDataJSON = mergedJSON;
  node.__aun_targetTitle = detail.target_title || "";
  node.properties._AUN_targetTitle = detail.target_title || "";

  // Apply auto-title: "<Target> Presets"
  applyAutoTitle(node, detail.target_title || "");

  // Rename and re-type generic slot widgets to match scan results
  renameAndRetypeWidgets(node, newWidgetData);

  // Refresh
  updateVisibility(node);
});

api.addEventListener("AUN_auto_populate_presets_executed", ({ detail }) => {
  if (!detail || !app?.graph) return;
  let node = app.graph.getNodeById?.(detail.node_id);
  if (!node) return;
  if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;

  node.__AUN_lastMatch = {
    index: Number(detail.matched_index ?? 0),
    keyword: detail.matched_keyword ?? "",
    values: getRowValues(node, Number(detail.matched_index ?? 0), getWidgetData(node)),
  };
  if (isCompact(node)) {
    syncAndPositionFooter(node);
  }
});
