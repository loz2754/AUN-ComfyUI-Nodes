import { app } from "../../scripts/app.js";
import { applyWidgetHiddenState, ensureHiddenAware, getWidget, injectStyles, forceRedraw } from "./index.js";

const NODE_CLASS = "AUNKeywordPresetSelector";
const MAX_SLOTS = 20;
const PROP_KEY = "_AUN_compactMode";
const ROW_H = 22;
const ROW_GAP = 2;
const SIDE_PAD = 10;
const TITLE_H = 28;

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
  const count = getVisibleCount(node);
  let visible = 0;
  for (let i = 1; i <= count; i++) {
    const kw = getWidget(node, "keyword" + i);
    const pr = getWidget(node, "preset" + i);
    if (kw?.value || pr?.value) visible++;
  }
  const def = getWidget(node, "preset_default");
  if (def?.value) visible++;
  if (visible === 0) visible = 1;
  return TITLE_H + 4 + visible * ROW_H + Math.max(0, visible - 1) * ROW_GAP + 6;
}

function ensureRowStyles() {
  if (globalThis.__AUN_kps_styles) return;
  globalThis.__AUN_kps_styles = true;
  injectStyles("AUN-kps-row-styles", `
    .AUN-kps-row {
      position: fixed;
      z-index: 12;
      display: grid;
      grid-template-columns: 18px 1fr 1.8fr;
      gap: 5px;
      align-items: center;
      padding: 0;
      border-radius: 0;
      background: transparent;
      border: none;
      box-shadow: none;
      box-sizing: border-box;
      pointer-events: none;
      overflow: visible;
      font: 11px sans-serif;
    }
    .AUN-kps-row .AUN-kps-idx {
      color: #777;
      text-align: right;
      padding-right: 4px;
      font-weight: 500;
      white-space: nowrap;
    }
    .AUN-kps-row .AUN-kps-kw {
      color: #e0e0e0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .AUN-kps-row .AUN-kps-val {
      color: #7ca0b8;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .AUN-kps-row.match {
      background: rgba(80,180,80,0.15);
      border: 1px solid rgba(80,180,80,0.4);
      border-radius: 3px;
      padding: 0 4px;
    }
    .AUN-kps-row.match .AUN-kps-idx { color: #5c5; }
    .AUN-kps-row.match .AUN-kps-kw { color: #8f8; }
    .AUN-kps-row.match .AUN-kps-val { color: #9f9; }
  `);
}

function buildRow(node, i) {
  ensureRowStyles();
  const root = document.createElement("div");
  root.className = "AUN-kps-row";
  root.dataset.slot = String(i);

  const idxEl = document.createElement("span");
  idxEl.className = "AUN-kps-idx";
  idxEl.textContent = i;

  const kwEl = document.createElement("span");
  kwEl.className = "AUN-kps-kw";

  const valEl = document.createElement("span");
  valEl.className = "AUN-kps-val";

  root.append(idxEl, kwEl, valEl);
  document.body.appendChild(root);

  return { root, idxEl, kwEl, valEl };
}

function ensureRows(node) {
  if (Array.isArray(node.__AUN_kpsRows)) return node.__AUN_kpsRows;
  const rows = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    rows.push(buildRow(node, i));
  }
  node.__AUN_kpsRows = rows;
  return rows;
}

function disposeRows(node) {
  const rows = node.__AUN_kpsRows;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row.root?.parentNode) row.root.remove();
    }
    node.__AUN_kpsRows = null;
  }
}

function syncRow(node, row, i) {
  const count = getVisibleCount(node);
  const compact = isCompact(node);
  const show = i <= count && compact;

  if (!show) {
    row.root.style.display = "none";
    return;
  }

  const kw = getWidget(node, "keyword" + i);
  const pr = getWidget(node, "preset" + i);
  const kwVal = String(kw?.value ?? "").trim();
  const prVal = String(pr?.value ?? "").trim();

  if (!kwVal && !prVal) {
    row.root.style.display = "none";
    return;
  }

  row.root.style.display = "grid";
  row.idxEl.textContent = i;
  row.kwEl.textContent = kwVal || "\u2014";
  row.valEl.textContent = prVal || "\u2014";

  // Check match: first keyword that is substring of reference_phrase
  const ref = getWidget(node, "reference_phrase");
  const cs = getWidget(node, "case_sensitive");
  const csVal = !!cs?.value;
  const refVal = String(ref?.value ?? "").trim();
  let match = false;
  if (refVal && kwVal) {
    const search = csVal ? refVal : refVal.toLowerCase();
    const matchKw = csVal ? kwVal : kwVal.toLowerCase();
    if (search.includes(matchKw)) match = true;
  }
  row.root.classList.toggle("match", match);
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
    if (other.flags?.collapsed) continue;

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

function positionRowsCore(node, canvasRect, scale, offsetX, offsetY, occluded) {
  const rows = ensureRows(node);
  const compact = isCompact(node);

  if (!compact || occluded) {
    for (const row of rows) row.root.style.display = "none";
    return;
  }

  const canvasRectLocal = canvasRect;
  const ds = app?.canvas?.ds;
  if (!ds) {
    for (const row of rows) row.root.style.display = "none";
    return;
  }

  const scale = ds.scale || 1;
  const offsetX = ds.offset?.[0] ?? 0;
  const offsetY = ds.offset?.[1] ?? 0;

  const nodeScreen = graphToScreen(canvasRectLocal, node.pos[0], node.pos[1], scale, offsetX, offsetY);
  const nodeW = (node.size?.[0] ?? 300) * scale;
  const nodeH = (node.size?.[1] ?? 100) * scale;
  const padding = 20;
  const nodeOnScreen =
    nodeScreen.x + nodeW + padding > canvasRect.left &&
    nodeScreen.x - padding < canvasRect.right &&
    nodeScreen.y + nodeH + padding > canvasRect.top &&
    nodeScreen.y - padding < canvasRect.bottom;

  if (!nodeOnScreen) {
    for (const row of rows) row.root.style.display = "none";
    return;
  }

  const count = getVisibleCount(node);
  const baseY = TITLE_H + 4;

  let rowIndex = 0;
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const row = ensureRows(node)[i - 1];
    if (i > getVisibleCount(node)) {
      row.root.style.display = "none";
      continue;
    }
    const kw = getWidget(node, "keyword" + i);
    const pr = getWidget(node, "preset" + i);
    const kwVal = String(kw?.value ?? "").trim();
    const prVal = String(pr?.value ?? "").trim();
    if (!kwVal && !prVal) {
      row.root.style.display = "none";
      continue;
    }

    syncRow(node, row, i);
    const localTop = TITLE_H + 4 + rowIndex * (ROW_H + ROW_GAP);
    const graphLeft = node.pos[0] + SIDE_PAD;
    const graphTop = node.pos[1] + localTop;
    const screenPos = graphToScreen(node.__AUN_canvasRect || { left: 0, top: 0 }, graphLeft, graphTop, scale, offsetX, offsetY);
    const graphRight = graphLeft + (node.size[0] - SIDE_PAD * 2);
    const graphBottom = graphTop + ROW_H;
    const screenBR = graphToScreen(node.__AUN_canvasRect || { left: 0, top: 0 }, graphRight, graphBottom, scale, offsetX, offsetY);

    Object.assign(row.root.style, {
      display: "grid",
      left: `${screenPos.x}px`,
      top: `${screenPos.y}px`,
      width: `${Math.max(120, screenBR.x - screenPos.x)}px`,
      height: `${Math.max(ROW_H, screenBR.y - screenPos.y)}px`,
    });
    rowIndex++;
  }
}

function positionRows(node, ctx) {
  if (!ctx?.canvas) return;
  const canvasRect = ctx.canvas.getBoundingClientRect();
  node.__AUN_canvasRect = canvasRect;
  const ds = app?.canvas?.ds;
  if (!ds) return;
  const scale = ds.scale || 1;
  const offsetX = ds.offset?.[0] ?? 0;
  const offsetY = ds.offset?.[1] ?? 0;

  const occluded = isNodeOccluded(node, canvasRect, scale, offsetX, offsetY);
  positionRowsCore(node, canvasRect, scale, offsetX, offsetY, occluded);
}

function positionRowsFromCanvas(node) {
  if (!isCompact(node)) {
    const rows = node.__AUN_kpsRows;
    if (Array.isArray(node.__AUN_kpsRows)) {
      for (const row of rows) row.root.style.display = "none";
    }
    return;
  }
  const canvas = app?.canvas;
  if (!canvas || !canvas.canvas || !canvas.ds) return;
  const canvasRect = canvas.canvas.getBoundingClientRect();
  const scale = canvas.ds.scale || 1;
  const offsetX = canvas.ds.offset?.[0] ?? 0;
  const offsetY = canvas.ds.offset?.[1] ?? 0;
  const occluded = isNodeOccluded(node, canvasRect, scale, offsetX, offsetY);
  positionRowsCore(node, canvasRect, scale, offsetX, offsetY, occluded);
}

let compactRowsRAF = null;
function hasCompactKpsNodes() {
  if (!app?.graph) return false;
  const nodes = app.graph._nodes || app.graph.nodes || [];
  return nodes.some((n) => n?.comfyClass === NODE_CLASS && isCompact(n));
}

function startCompactRowsRAF() {
  if (compactRowsRAF != null) return;
  const tick = () => {
    if (!hasCompactKpsNodes()) {
      compactRowsRAF = null;
      return;
    }
    if (!app?.graph) {
      compactRowsRAF = null;
      return;
    }
    const nodes = app.graph._nodes || app.graph.nodes || [];
    for (const node of nodes) {
      if (node?.comfyClass === NODE_CLASS && isCompact(node)) {
        positionRowsFromCanvas(node);
      }
    }
    compactRowsRAF = requestAnimationFrame(tick);
  };
  compactRowsRAF = requestAnimationFrame(tick);
}

function stopCompactRowsRAF() {
  if (compactRowsRAF != null) {
    cancelAnimationFrame(compactRowsRAF);
    compactRowsRAF = null;
  }
}

function updateVisibility(node) {
  const count = getVisibleCount(node);
  const compact = isCompact(node);

  // Hide/show configuration widgets in compact mode
  applyWidgetHiddenState(getWidget(node, "visible_inputs"), compact);
  applyWidgetHiddenState(getWidget(node, "case_sensitive"), compact);
  applyWidgetHiddenState(getWidget(node, "reference_phrase"), compact);

  // Hide/show keyword/preset pairs based on visible_inputs
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const show = i <= count && !compact;
    applyWidgetHiddenState(getWidget(node, "keyword" + i), !show);
    applyWidgetHiddenState(getWidget(node, "preset" + i), !show);
  }

  // Default preset follows compact mode
  applyWidgetHiddenState(getWidget(node, "preset_default"), compact);

  // Set compact node height
  if (compact) {
    const h = getMinimumCompactHeight(node);
    if (node.size) node.size[1] = h;
  } else {
    resizeNode(node);
  }

  node.setDirtyCanvas?.(true, true);
  forceRedraw(node);

  // Ensure rows exist and trigger RAF
  ensureRows(node);
  if (compact) startCompactRowsRAF();
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

      // Double-click to toggle compact mode
      const originalDblClick = this.onDblClick;
      this.onDblClick = function (event, pos) {
        originalDblClick?.apply(this, arguments);
        if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
        toggleCompactMode(this);
      };

      // onRemoved cleanup
      const originalOnRemoved = this.onRemoved;
      this.onRemoved = function () {
        originalOnRemoved?.apply(this, arguments);
        disposeRows(this);
      };
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
      updateVisibility(this);
    };

    // Chain onDrawForeground for row positioning
    const protoOrigDrawFg = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      protoOrigDrawFg?.apply(this, arguments);
      if (isCompact(this) && !this.__AUN_nodeBeingDragged) {
        positionRows(this, ctx);
      }
    };

    // Right-click menu for compact mode toggle
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