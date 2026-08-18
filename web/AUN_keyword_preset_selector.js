import { app } from "../../scripts/app.js";
import { applyWidgetHiddenState, ensureHiddenAware, getWidget, injectStyles, forceRedraw, isNodeCollapsed } from "./index.js";

const NODE_CLASS = "AUNKeywordPresetSelector";
const MAX_SLOTS = 20;
const PROP_KEY = "_AUN_compactMode";
const TITLE_H = 28;
const SIDE_PAD = 10;
const BOX_H = 22;

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

function getMinimumCompactHeight(node) {
  return TITLE_H + 8;
}

function ensureBoxStyles() {
  if (globalThis.__AUN_kps_box_styles) return;
  globalThis.__AUN_kps_box_styles = true;
  injectStyles("AUN-kps-box-styles", `
    .AUN-kps-box {
      position: fixed;
      z-index: 12;
      height: ${BOX_H}px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: center;
      padding: 0 8px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 4px;
      background: rgba(30,30,30,0.95);
      color: #e0e0e0;
      box-sizing: border-box;
      font: 11px sans-serif;
      font-weight: 500;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      pointer-events: none;
    }
  `);
}

function ensureBox(node) {
  if (node.__AUN_kpsBox) return node.__AUN_kpsBox;
  ensureBoxStyles();
  const box = document.createElement("div");
  box.className = "AUN-kps-box";
  document.body.appendChild(box);
  node.__AUN_kpsBox = box;
  return box;
}

function disposeBox(node) {
  if (node.__AUN_kpsBox?.parentNode) {
    node.__AUN_kpsBox.remove();
  }
  node.__AUN_kpsBox = null;
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
    const hasInputLinks = n.inputs?.some(inp => inp.link);
    if (!hasInputLinks) return textWidget.value;
  }
  const srcInput = n.inputs?.[link.origin_slot];
  if (srcInput?.link) return traceLinkValue(srcInput.link, visited, depth + 1);
  return undefined;
}

function getReferencePhrase(node) {
  const refWidget = getWidget(node, "reference_phrase");
  if (!refWidget) return "";
  if (refWidget.input?.link != null) {
    const traced = traceLinkValue(refWidget.input.link, new Set());
    if (traced != null) return traced;
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

function syncAndPositionBox(node) {
  const box = ensureBox(node);
  const compact = isCompact(node);

  if (!compact) {
    box.style.display = "none";
    return;
  }

  const canvas = app?.canvas;
  if (!canvas || !canvas.canvas || !canvas.ds) {
    box.style.display = "none";
    return;
  }
  const canvasRect = canvas.canvas.getBoundingClientRect();
  const scale = canvas.ds.scale || 1;
  const offsetX = canvas.ds.offset?.[0] ?? 0;
  const offsetY = canvas.ds.offset?.[1] ?? 0;

  if (isNodeCollapsed(node) || isNodeOccluded(node, canvasRect, scale, offsetX, offsetY)) {
    box.style.display = "none";
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
    box.style.display = "none";
    return;
  }

  const match = findMatch(node);
  if (!match) {
    box.style.display = "none";
    return;
  }

  box.textContent = `${match.index} ${match.keyword}: ${match.value}`;
  box.style.display = "grid";

  const graphLeft = node.pos[0] + SIDE_PAD;
  const graphTop = node.pos[1] + TITLE_H + 4;
  const screenPos = graphToScreen(canvasRect, graphLeft, graphTop, scale, offsetX, offsetY);
  const graphRight = graphLeft + (node.size[0] - SIDE_PAD * 2);
  const graphBottom = graphTop + BOX_H;
  const screenBR = graphToScreen(canvasRect, graphRight, graphBottom, scale, offsetX, offsetY);

  Object.assign(box.style, {
    left: `${screenPos.x}px`,
    top: `${screenPos.y}px`,
    width: `${Math.max(120, screenBR.x - screenPos.x)}px`,
    height: `${Math.max(BOX_H, screenBR.y - screenPos.y)}px`,
  });
}

let compactBoxRAF = null;
function hasCompactKpsNodes() {
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  return nodes.some((n) => n?.comfyClass === NODE_CLASS && isCompact(n));
}

function startCompactBoxRAF() {
  if (compactBoxRAF != null) return;
  const tick = () => {
    if (!hasCompactKpsNodes()) {
      compactBoxRAF = null;
      return;
    }
    if (!app?.graph) {
      compactBoxRAF = null;
      return;
    }
    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const node of nodes) {
      if (node?.comfyClass === NODE_CLASS && isCompact(node)) {
        syncAndPositionBox(node);
      }
    }
    compactBoxRAF = requestAnimationFrame(tick);
  };
  compactBoxRAF = requestAnimationFrame(tick);
}

function stopCompactBoxRAF() {
  if (compactBoxRAF != null) {
    cancelAnimationFrame(compactBoxRAF);
    compactBoxRAF = null;
  }
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
    const h = getMinimumCompactHeight(node);
    if (node.size) node.size[1] = h;
  } else {
    resizeNode(node);
  }

  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);

  ensureBox(node);
  if (compact) startCompactBoxRAF();
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

      const originalOnRemoved = this.onRemoved;
      this.onRemoved = function () {
        originalOnRemoved?.apply(this, arguments);
        disposeBox(this);
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
        syncAndPositionBox(this);
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