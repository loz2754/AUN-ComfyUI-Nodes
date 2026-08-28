// ── Preset Manager ─────────────────────────────────────────────────
// Companion frontend for AUNPresetManager.py.
// The heavy lifting (schema discovery, preset editing) lives in the Setup
// dialog; this file only handles compact mode, the canvas footer preview,
// the Setup title button and widget visibility.
// ────────────────────────────────────────────────────────────────────

import { app } from "../../scripts/app.js";
import { registerLegacyExtension } from "./aun-compat.js";
import { api } from "../../scripts/api.js";
import { getWidget, applyWidgetHiddenState, isCompact, setCompact, isNodeCollapsed, forceRedraw, findNodeByIdentifier } from "./index.js";
import { openPresetSetupDialog, refreshPresetSetupDialog } from "./AUN_preset_manager_setup_dialog.js";

const NODE_CLASS = "AUNPresetManager";
const MAX_ROWS = 20;
const MANUAL_OUTPUT_OFFSET = 3; // selected_values, matched_keyword, matched_index
const MAX_MANUAL_OUTPUTS = 12;
const TITLE_H = 28;
const FOOTER_H = 76;
const FOOTER_PAD = 6;
const FOOTER_BOTTOM = 6;

function getVisibleRows(node) {
  const w = getWidget(node, "visible_rows");
  const val = w?.value;
  return Number.isFinite(val) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(val))) : 5;
}

function getFooterHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node)) return 0;
  return FOOTER_H;
}

function getMinimumCompactHeight(node) {
  if (!isCompact(node) || isNodeCollapsed(node)) return 0;
  const widgetH = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 22;
  const slotH = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  // Title + manual_preset combo + converged socket dots + footer preview.
  return TITLE_H + widgetH + slotH * 0.6 + FOOTER_PAD + FOOTER_H + FOOTER_BOTTOM;
}

function resizeNode(node) {
  if (typeof node?.computeSize !== "function") return;
  try {
    const newSize = node.computeSize();
    if (node.size && node.size.length >= 2) {
      node.size[1] = newSize[1];
    } else {
      node.size = newSize;
    }
  } catch (err) {
    console.warn("AUNPresetManager: computeSize failed", err);
  }
}

// ------------------------------------------------------------------
// Match preview (stored by the executed event, computed locally when editing)
// ------------------------------------------------------------------

function getLastMatch(node) {
  return node.__AUN_lastMatch ?? null;
}

// Local preview: select the row from preset_data + current widgets without
// executing. Used before the first run and whenever settings change; the
// executed event replaces it with the real match.
function computeLocalPreview(node) {
  const presetDataRaw = String(getWidget(node, "preset_data")?.value ?? "");
  let data = null;
  try { data = JSON.parse(presetDataRaw); } catch { data = null; }
  const rows = data && Array.isArray(data.rows)
    ? data.rows.filter((r) => r && typeof r === "object").slice(0, getVisibleRows(node))
    : [];

  const manualN = Math.max(
    1,
    Math.min(parseInt(String(getWidget(node, "manual_preset")?.value ?? 1), 10) || 1, getVisibleRows(node))
  );

  let index = 0;
  let keyword = "";
  if (getWidget(node, "match_keywords")?.value === "Yes") {
    const caseSensitive = getWidget(node, "case_sensitive")?.value === true;
    const ref = String(getWidget(node, "reference_phrase")?.value ?? "");
    if (ref) {
      const search = caseSensitive ? ref : ref.toLowerCase();
      for (let i = 0; i < rows.length; i++) {
        const raw = String(rows[i].keyword ?? "");
        for (const sub of raw.split(",").map((k) => k.trim()).filter(Boolean)) {
          const kw = caseSensitive ? sub : sub.toLowerCase();
          if (kw && search.includes(kw)) {
            index = i + 1;
            keyword = sub;
            break;
          }
        }
        if (index) break;
      }
    }
  }
  if (!index) index = manualN;

  let values = {};
  if (index >= 1 && index <= rows.length) {
    const vals = rows[index - 1].values;
    if (vals && typeof vals === "object") values = vals;
  }
  return { index, keyword, values };
}

function buildPreviewText(node) {
  const preview = node.__AUN_localPreview || getLastMatch(node);
  if (preview && preview.index > 0) {
    const parts = [];
    parts.push(preview.keyword ? `#${preview.index} ${preview.keyword}` : `preset ${preview.index}`);
    let values = preview.values;
    if (values && typeof values === "string") {
      try { values = JSON.parse(values); } catch { values = null; }
    }
    if (values && typeof values === "object") {
      for (const [k, v] of Object.entries(values)) {
        if (v != null && v !== "") parts.push(`${k}=${v}`);
      }
    }
    return parts.join("  ");
  }
  const mp = getWidget(node, "manual_preset");
  return `preset ${mp?.value ?? 1}`;
}

// ------------------------------------------------------------------
// Auto-title: "<Target> Presets" (never clobbers a user-set title)
// ------------------------------------------------------------------

function getTargetTitle(node) {
  const ident = String(getWidget(node, "node_identifier")?.value ?? "").trim();
  if (!ident) return null;
  const target = findNodeByIdentifier(node.graph || app?.graph, ident, node);
  if (!target) return null;
  return target.title || target.comfyClass || null;
}

function applyAutoTitle(node, targetTitle, defaultTitle) {
  const wanted = targetTitle ? `${targetTitle} Presets` : null;
  if (!wanted) return;
  const prev = node.__AUN_prevAutoTitle;
  const isDefault = !node.title || node.title === defaultTitle || node.title === prev;
  if (isDefault && node.title !== wanted) {
    node.title = wanted;
    node.setDirtyCanvas?.(true, true);
  }
  node.__AUN_prevAutoTitle = wanted;
}

// ------------------------------------------------------------------
// Manual output slots (ANY type) — labels mirror the included widgets
// ------------------------------------------------------------------

function getLiveTargetNames(node) {
  const ident = String(getWidget(node, "node_identifier")?.value ?? "").trim();
  const target = ident ? findNodeByIdentifier(node.graph || app?.graph, ident, node) : null;
  if (!target) return [];
  return (target.widgets || [])
    .map((w) => w?.name)
    .filter((n) => n && n !== "preset_data" && n !== "button");
}

function getOutputLabelNames(node) {
  const presetDataRaw = String(getWidget(node, "preset_data")?.value ?? "");
  let data = null;
  try { data = JSON.parse(presetDataRaw); } catch { data = null; }
  if (data && Array.isArray(data.widgets)) {
    return data.widgets.slice(0, MAX_MANUAL_OUTPUTS);
  }
  // No explicit inclusion list: use all scanned target widgets.
  return getLiveTargetNames(node).slice(0, MAX_MANUAL_OUTPUTS);
}

// When the target changes, re-point preset_data at the new target's widgets.
// Values for same-named widgets survive; everything else is dropped. Only
// runs when the new target was found and the stored list actually differs.
function retargetPresetData(node) {
  const names = getLiveTargetNames(node);
  if (!names.length) return; // target not found — keep existing data untouched

  const w = getWidget(node, "preset_data");
  if (!w) return;
  let data = null;
  try { data = JSON.parse(String(w.value ?? "")); } catch { data = null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return; // legacy format

  const stored = Array.isArray(data.widgets) ? data.widgets : null;
  if (stored && stored.length === names.length && stored.every((n, i) => n === names[i])) return;

  const keep = new Set(names);
  for (const row of Array.isArray(data.rows) ? data.rows : []) {
    if (row && row.values && typeof row.values === "object") {
      for (const k of Object.keys(row.values)) {
        if (!keep.has(k)) delete row.values[k];
      }
    }
  }
  data.widgets = names;
  w.value = JSON.stringify(data);
}

function relabelOutputs(node) {
  const names = getOutputLabelNames(node);
  const outputs = node.outputs || [];
  for (let i = MANUAL_OUTPUT_OFFSET; i < outputs.length; i++) {
    const idx = i - MANUAL_OUTPUT_OFFSET;
    const label = names[idx];
    outputs[i].name = label || `value_${idx + 1}`;
    outputs[i].label = label || `value_${idx + 1}`;
    outputs[i].tooltip = label
      ? `Preset value for widget '${label}' (manual wiring).`
      : `Unused preset value slot ${idx + 1} (manual wiring).`;
  }
}

// ------------------------------------------------------------------
// Visibility
// ------------------------------------------------------------------

function updateVisibility(node) {
  const count = getVisibleRows(node);
  const compact = isCompact(node);

  for (const name of ["visible_rows", "case_sensitive", "match_keywords", "node_identifier"]) {
    applyWidgetHiddenState(getWidget(node, name), compact);
  }
  applyWidgetHiddenState(getWidget(node, "preset_data"), true);

  node.__AUN_localPreview = computeLocalPreview(node);

  relabelOutputs(node);
  applySlotLabels(node, compact);
  applyAutoTitle(node, getTargetTitle(node), "Preset Manager");

  const mpW = getWidget(node, "manual_preset");
  if (mpW) {
    const opts = Array.from({ length: count }, (_, i) => String(i + 1));
    mpW.options = mpW.options || {};
    mpW.options.values = opts;
    if (!opts.includes(String(mpW.value))) mpW.value = opts[opts.length - 1];
  }

  if (compact && !isNodeCollapsed(node)) {
    node.size[1] = getMinimumCompactHeight(node);
  } else if (!compact) {
    resizeNode(node);
  }
  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);
}

// In compact mode the output/input sockets converge to one position (like
// the repo's collapse-connections look) and their labels are hidden.
// Labels are stored/restored exactly (same pattern as the collapse
// connections extension) so expanded mode always brings them back.
function applySlotLabels(node, compact) {
  for (const slot of [...(node.outputs || []), ...(node.inputs || [])]) {
    if (slot.widget) continue; // converted-widget input — leave its label alone
    if (compact) {
      if (slot.label !== " ") {
        slot.__aun_pm_origLabel = slot.label;
      }
      slot.label = " ";
    } else {
      if ("__aun_pm_origLabel" in slot) {
        slot.label = slot.__aun_pm_origLabel;
        delete slot.__aun_pm_origLabel;
      } else if (slot.label === " ") {
        delete slot.label;
      }
    }
  }
}

function toggleCompactMode(node) {
  if (!node) return;
  setCompact(node, !isCompact(node));
  updateVisibility(node);
}

// ------------------------------------------------------------------
// Canvas footer preview (drawn, not DOM — keeps FPS healthy)
// ------------------------------------------------------------------

function drawFooterBox(ctx, node) {
  const footerH = getFooterHeight(node);
  if (footerH <= 0) return;
  const w = node?.size?.[0] ?? 300;
  const h = node?.size?.[1] ?? 0;
  const x0 = 8;
  const x1 = w - 8;
  const y0 = h - FOOTER_H - FOOTER_BOTTOM;
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

  ctx.font = "13px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(225,225,225,0.92)";
  const text = buildPreviewText(node);
  const maxWidth = Math.max(10, x1 - x0 - 14);
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let y = y0 + 8;
  const lineH = 17;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x0 + 6, y);
      y += lineH;
      if (y + lineH > y1 - 4) break;
      line = word;
    } else {
      line = test;
    }
  }
  if (line && y + lineH <= y1 - 2) ctx.fillText(line, x0 + 6, y);
  ctx.restore();
}

// ------------------------------------------------------------------
// Setup title button
// ------------------------------------------------------------------

function installSetupTitleButton(node) {
  if (node.__AUN_pm_setupTitleInstalled) return;
  if (typeof node.addTitleButton !== "function") return;
  node.__AUN_pm_setupTitleInstalled = true;

  const setupW = 54;
  const BTN_H = 18;
  const btn = node.addTitleButton({
    name: "AUN_pm_setup",
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
    const mouse = app?.canvas?.graph_mouse;
    const local = Array.isArray(mouse) && Array.isArray(node.pos)
      ? [mouse[0] - node.pos[0], mouse[1] - node.pos[1]]
      : null;
    const hovered = !!local && local[0] >= x0 - 0.5 && local[0] <= x0 + setupW + 0.5 && local[1] >= y0 - 0.5 && local[1] <= y0 + h + 0.5;
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x0 + 0.5, y0 + 0.5, setupW - 1, h - 1, 4);
    else ctx.rect(x0 + 0.5, y0 + 0.5, setupW - 1, h - 1);
    ctx.fillStyle = hovered ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = hovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = hovered ? "#ffffff" : "#dbe4ff";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2699 Setup", x0 + setupW / 2, y0 + h / 2 + 0.5);
    ctx.restore();
  };
  btn.isPointInside = function isPointInside(x, y) {
    const a = this._last_area;
    if (!a) return false;
    return x >= a[0] && x <= a[0] + a[2] && y >= a[1] && y <= a[1] + a[3];
  };

  const origOnTitleButtonClick = node.onTitleButtonClick?.bind(node);
  node.onTitleButtonClick = function onTitleButtonClick(button, canvas) {
    if (button && button.name === "AUN_pm_setup") {
      openPresetSetupDialog(this, {
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

registerLegacyExtension({
  name: "AUN.PresetManager",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;

    const origComputeSize = nodeType.prototype.computeSize;
    if (typeof origComputeSize === "function") {
      nodeType.prototype.computeSize = function (out) {
        if (isCompact(this) && !isNodeCollapsed(this)) {
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

      const vis = getWidget(this, "visible_rows");
      if (vis && !vis.__aun_pm_hooked) {
        vis.__aun_pm_hooked = true;
        const orig = vis.callback;
        vis.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => updateVisibility(this.node));
        };
      }

      const mpW = getWidget(this, "manual_preset");
      if (mpW && !mpW.__aun_pm_hooked) {
        mpW.__aun_pm_hooked = true;
        const orig = mpW.callback;
        mpW.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => updateVisibility(this.node));
        };
      }

      const identW = getWidget(this, "node_identifier");
      if (identW && !identW.__aun_pm_hooked) {
        identW.__aun_pm_hooked = true;
        const orig = identW.callback;
        identW.callback = function (v) {
          if (orig) orig.call(this, v);
          requestAnimationFrame(() => {
            retargetPresetData(this.node);
            updateVisibility(this.node);
            refreshPresetSetupDialog(this.node);
          });
        };
      }

      const originalDblClick = this.onDblClick;
      this.onDblClick = function (event, pos) {
        originalDblClick?.apply(this, arguments);
        if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
        toggleCompactMode(this);
      };

      // Converge all sockets to one position while compact — same visual
      // language as the repo's collapse-connections mode.
      if (!this.__aun_pm_posHooked) {
        this.__aun_pm_posHooked = true;
        const origGetOutputPos = this.getOutputPos.bind(this);
        const origGetInputPos = this.getInputPos.bind(this);
        this.getOutputPos = function (index) {
          return isCompact(this) ? origGetOutputPos(0) : origGetOutputPos(index);
        };
        this.getInputPos = function (index) {
          return isCompact(this) ? origGetInputPos(0) : origGetInputPos(index);
        };
      }

      installSetupTitleButton(this);
      requestAnimationFrame(() => updateVisibility(this));
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
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
        content: isCompact(this) ? "AUN: Show all widgets" : "AUN: Compact mode",
        callback: () => {
          toggleCompactMode(this);
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
    requestAnimationFrame(() => updateVisibility(node));
  },
});

// ------------------------------------------------------------------
// WebSocket: executed event updates the footer preview
// ------------------------------------------------------------------

api.addEventListener("AUN_preset_manager_executed", ({ detail }) => {
  if (!detail || !app?.graph) return;
  const node = app.graph.getNodeById?.(detail.node_id);
  if (!node) return;
  if (node.comfyClass !== NODE_CLASS && node.type !== NODE_CLASS) return;

  node.__AUN_localPreview = null; // the real run result takes over
  node.__AUN_lastMatch = {
    index: Number(detail.matched_index ?? 0),
    keyword: detail.matched_keyword ?? "",
    values: detail.selected_values ?? "{}",
  };
  forceRedraw(node);
});
