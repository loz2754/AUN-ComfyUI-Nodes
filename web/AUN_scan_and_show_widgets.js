import { app } from "../../scripts/app.js";

const NODE_TYPE = "AUNScanAndShowWidgets";
const MAX_SLOTS = 350;
const COLLAPSE_KEY = "collapse_connections";
const SHOW_TYPES_KEY = "show_types";
const MAX_VALUE_LEN_KEY = "max_value_len";
const FILTER_INCLUDE_KEY = "filter_include";
const FILTER_EXCLUDE_PATTERNS_KEY = "filter_exclude_patterns";

const TYPE_COLORS = {
  IMAGE: "#64B5F6",
  LATENT: "#FF9CF9",
  MODEL: "#B39DDB",
  CLIP: "#FFD500",
  CLIP_VISION: "#A8DADC",
  CLIP_VISION_OUTPUT: "#ad7452",
  CONDITIONING: "#FFA931",
  CONTROL_NET: "#6EE7B7",
  MASK: "#81C784",
  VAE: "#FF6E6E",
  STYLE_MODEL: "#C2FFAE",
  NOISE: "#B0B0B0",
  GUIDER: "#66FFFF",
  SAMPLER: "#ECB4B4",
  SIGMAS: "#CDFFCD",
  TAESD: "#DCC274",
  STRING: "#AAA",
  INT: "#AAA",
  FLOAT: "#AAA",
  BOOLEAN: "#AAA",
  DICT: "#AAA",
  LIST: "#AAA",
  UNKNOWN: "#AAA",
};

function getTypeColor(typeName) {
  if (!typeName) return TYPE_COLORS.UNKNOWN;
  const upper = typeName.toUpperCase();
  return TYPE_COLORS[upper] || TYPE_COLORS.UNKNOWN;
}

// ── Pattern Filter ─────────────────────────────────────────────────

function parsePatterns(text) {
  return (text || "").split("\n").map(l => l.trim()).filter(Boolean);
}

function nameMatchesAny(name, patterns) {
  return patterns.some(line => {
    const re = new RegExp("^" + line.replace(/([.+?^${}()|[\]\\])/g, "\\$1").replace(/\*/g, ".*") + "$", "i");
    return re.test(name);
  });
}

function matchesFilter(node, name) {
  const include = parsePatterns(node.properties?.[FILTER_INCLUDE_KEY]);
  const exclude = parsePatterns(node.properties?.[FILTER_EXCLUDE_PATTERNS_KEY]);
  if (include.length && !nameMatchesAny(name, include)) return false;
  if (exclude.length && nameMatchesAny(name, exclude)) return false;
  return true;
}

function filterNamesByPattern(node, widgetNames) {
  return widgetNames.filter(name => matchesFilter(node, name));
}

function filterEntriesByPattern(node, entries) {
  if (!entries) return [];
  return entries.filter(e => matchesFilter(node, e.caption));
}

function isFilterActive(node) {
  return !!(node.properties?.[FILTER_INCLUDE_KEY] || "").trim()
      || !!(node.properties?.[FILTER_EXCLUDE_PATTERNS_KEY] || "").trim();
}

function refreshNodeFilter(node) {
  const names = getWidgetNames(node);
  if (names.length) syncOutputs(node, names, node._aunEntries);
  if (node._aunEntries) {
    const state = overlayRegistry.get(Number(node.id));
    if (state) {
      const filtered = filterEntriesByPattern(node, node._aunEntries);
      buildOverlayCards(state.container, filtered, node.properties?.show_types !== false, node.properties?.max_value_len ?? 500);
    }
  }
  node.setDirtyCanvas(true, true);
}

// ── Filter Button (title bar) ──────────────────────────────────────

function installFilterTitleButton(node) {
  if (node.__aun_filter_btn_installed) return;
  if (typeof node.addTitleButton !== "function") return;
  node.__aun_filter_btn_installed = true;

  const BTN_W = 22;
  const BTN_H = 18;

  const btn = node.addTitleButton({
    name: "AUN_scan_filter",
    text: "F",
    fontSize: 11,
    height: BTN_H,
    cornerRadius: 4,
  });

  btn.getWidth = function () {
    return this.visible ? BTN_W : 0;
  };

  btn.draw = function (ctx, x, y) {
    if (!this.visible) return;
    const x0 = x + (this.xOffset || 0);
    const y0 = y + (this.yOffset || 0);
    const h = this.height || BTN_H;
    this._last_area = [x0, y0, BTN_W, h];
    const active = isFilterActive(node);
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x0 + 0.5, y0 + 0.5, BTN_W - 1, h - 1, 4);
    } else {
      ctx.rect(x0 + 0.5, y0 + 0.5, BTN_W - 1, h - 1);
    }
    ctx.fillStyle = active ? "#4a9eff" : "rgba(255,255,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = active ? "#4a9eff" : "rgba(255,255,255,0.32)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = active ? "#fff" : "#dbe4ff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("F", x0 + BTN_W / 2, y0 + h / 2 + 0.5);
    ctx.restore();
  };

  btn.isPointInside = function (x, y) {
    const a = this._last_area;
    if (!a) return false;
    return x >= a[0] && x <= a[0] + a[2] && y >= a[1] && y <= a[1] + a[3];
  };

  const origOnTitleButtonClick = node.onTitleButtonClick?.bind(node);
  node.onTitleButtonClick = function (button, canvas) {
    if (button && button.name === "AUN_scan_filter") {
      openFilterModal(this);
      return;
    }
    if (origOnTitleButtonClick) origOnTitleButtonClick(button, canvas);
  };
}

// ── Filter Modal ───────────────────────────────────────────────────

let activeModal = null;

function openFilterModal(node) {
  if (activeModal) { activeModal.remove(); activeModal = null; }

  const currentInclude = node.properties?.[FILTER_INCLUDE_KEY] || "";
  const currentExclude = node.properties?.[FILTER_EXCLUDE_PATTERNS_KEY] || "";

  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    font-family: sans-serif;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    background: #1e1e1e; color: #ddd; border-radius: 8px;
    border: 1px solid #555; padding: 20px; min-width: 400px; max-width: 520px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  `;

  modal.innerHTML = `
    <div style="font-size:15px;font-weight:bold;margin-bottom:14px;color:#eee;">Widget Filter</div>
    <div style="margin-bottom:12px;">
      <label style="display:block;margin-bottom:6px;color:#aaa;font-size:12px;">Include (show matching, one per line, * = wildcard):</label>
      <textarea id="aun-filter-include" style="
        width:100%; height:80px; background:#2a2a2a; color:#ddd; border:1px solid #555;
        border-radius:4px; padding:8px; font-family:monospace; font-size:13px; resize:vertical;
        box-sizing:border-box;
      ">${currentInclude.replace(/</g, "&lt;")}</textarea>
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;margin-bottom:6px;color:#aaa;font-size:12px;">Exclude (hide matching, one per line, * = wildcard):</label>
      <textarea id="aun-filter-exclude" style="
        width:100%; height:80px; background:#2a2a2a; color:#ddd; border:1px solid #555;
        border-radius:4px; padding:8px; font-family:monospace; font-size:13px; resize:vertical;
        box-sizing:border-box;
      ">${currentExclude.replace(/</g, "&lt;")}</textarea>
    </div>
    <div style="color:#888;font-size:11px;margin-bottom:14px;">Examples: lora_* &nbsp; strength_* &nbsp; trigger_* &nbsp; enabled_*</div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button id="aun-filter-cancel" style="
        padding:6px 16px; border-radius:4px; border:1px solid #555; background:#333;
        color:#ccc; cursor:pointer; font-size:13px;
      ">Cancel</button>
      <button id="aun-filter-apply" style="
        padding:6px 16px; border-radius:4px; border:1px solid #4a9eff; background:#4a9eff;
        color:#fff; cursor:pointer; font-size:13px;
      ">Apply</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  activeModal = backdrop;

  const textarea = modal.querySelector("#aun-filter-include");
  textarea.focus();
  textarea.select();

  function closeModal() {
    backdrop.remove();
    activeModal = null;
  }

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  modal.querySelector("#aun-filter-cancel").addEventListener("click", closeModal);
  modal.querySelector("#aun-filter-apply").addEventListener("click", () => {
    node.properties[FILTER_INCLUDE_KEY] = modal.querySelector("#aun-filter-include").value;
    node.properties[FILTER_EXCLUDE_PATTERNS_KEY] = modal.querySelector("#aun-filter-exclude").value;
    closeModal();
    refreshNodeFilter(node);
  });

  backdrop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && e.ctrlKey) modal.querySelector("#aun-filter-apply").click();
  });
}

// ── Output slot management ──────────────────────────────────────────

function syncOutputs(node, widgetNames, entries) {
  if (!node) return;
  const filtered = filterNamesByPattern(node, widgetNames);
  const needed = Math.min(filtered.length, MAX_SLOTS);

  while (node.outputs && node.outputs.length > needed) {
    node.removeOutput(node.outputs.length - 1);
  }

  while (!node.outputs || node.outputs.length < needed) {
    const idx = node.outputs ? node.outputs.length : 0;
    node.addOutput(filtered[idx] || `value_${idx + 1}`, "*");
  }

  for (let i = 0; i < needed; i++) {
    if (node.outputs[i]) {
      node.outputs[i].label = filtered[i];
      node.outputs[i].tooltip = `Widget: ${filtered[i]}`;
    }
  }
}

function growToContentSize(node) {
  if (!node || typeof node.computeSize !== "function") return;
  const cs = node.computeSize();
  if (!cs || cs.length < 2) return;
  const oldW = node.size?.[0] ?? cs[0];
  node.size = [oldW, Math.max(node.size?.[1] ?? 0, cs[1])];
  node.setDirtyCanvas(true, true);
}

// ── Overlay display ─────────────────────────────────────────────────

const overlayRegistry = new Map();

function getOverlayState(node) {
  const id = Number(node.id);
  let state = overlayRegistry.get(id);
  if (!state) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      z-index: 11;
      pointer-events: auto;
      display: none;
      font-family: sans-serif;
    `;
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px;
    `;
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    state = { overlay, container };
    overlayRegistry.set(id, state);
  }
  return state;
}

function removeOverlayState(node) {
  const id = Number(node.id);
  const state = overlayRegistry.get(id);
  if (state) {
    state.overlay.remove();
    overlayRegistry.delete(id);
  }
}

function buildOverlayCards(container, entries, showTypes = true, maxLen = 500) {
  container.innerHTML = "";
  for (const entry of entries) {
    const card = document.createElement("div");
    card.style.cssText = `
      background: rgba(30, 30, 30, 0.95);
      border-radius: 4px;
      border-left: 3px solid ${getTypeColor(entry.type)};
      padding: 4px 10px;
      margin: 2px 0;
      overflow: hidden;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 2px;
    `;

    if (showTypes && entry.type) {
      const badge = document.createElement("span");
      badge.style.cssText = `
        font: bold 10px sans-serif;
        color: #fff;
        background: ${getTypeColor(entry.type)};
        border-radius: 3px;
        padding: 1px 5px;
        white-space: nowrap;
        flex-shrink: 0;
      `;
      badge.textContent = entry.type;
      header.appendChild(badge);
    }

    const capEl = document.createElement("span");
    capEl.style.cssText = `
      font: 13px sans-serif;
      color: #b0c4de;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    capEl.textContent = entry.caption || "";
    header.appendChild(capEl);

    card.appendChild(header);

    if (entry.value) {
      const valEl = document.createElement("div");
      valEl.style.cssText = `
        font: 12px sans-serif;
        color: #d0d0d0;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.4;
      `;
      let displayText = entry.value;
      if (maxLen > 0 && displayText.length > maxLen) {
        displayText = displayText.substring(0, maxLen) + "...";
      }
      valEl.textContent = displayText;
      if (entry.value.length > maxLen || maxLen === 0) valEl.title = entry.value;
      card.appendChild(valEl);
    }

    container.appendChild(card);
  }
}

// ── Occlusion check ─────────────────────────────────────────────────

function graphToScreen(canvasRect, gx, gy, scale, offsetX, offsetY) {
  return {
    x: canvasRect.left + (gx + offsetX) * scale,
    y: canvasRect.top + (gy + offsetY) * scale,
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

function getContentYOffset(node, ignoreCollapse) {
  let bottomY = 6;
  for (const w of node.widgets || []) {
    if (w.hidden) continue;
    const wY = w.last_y != null ? w.last_y : 30;
    const wSize = w.computeSize?.(node.size?.[0]) || [200, 24];
    bottomY = Math.max(bottomY, wY + wSize[1]);
  }
  const slotStartY = node.constructor?.slot_start_y ?? 0;
  const nOutputs = (node.outputs || []).length;
  const isCollapsed = !ignoreCollapse && !!node.properties?.[COLLAPSE_KEY];
  const socketRows = isCollapsed ? Math.min(nOutputs, 1) : nOutputs;
  const socketBlockEnd = slotStartY + socketRows * LiteGraph.NODE_SLOT_HEIGHT;
  return Math.max(bottomY, socketBlockEnd) + 4;
}

function positionOverlay(node) {
  const id = Number(node.id);
  const state = overlayRegistry.get(id);
  if (!state) return;
  if (!node.graph) { state.overlay.style.display = "none"; return; }

  const canvas = app.canvas;
  if (!canvas?.canvas || node.flags?.collapsed) { state.overlay.style.display = "none"; return; }

  const ds = canvas.ds;
  if (!ds) { state.overlay.style.display = "none"; return; }

  const canvasRect = canvas.canvas.getBoundingClientRect();
  const scale = ds.scale;
  const panX = ds.offset[0];
  const panY = ds.offset[1];

  if (isNodeOccluded(node, canvasRect, scale, panX, panY)) {
    state.overlay.style.display = "none";
    return;
  }

  const screenX = canvasRect.left + (node.pos[0] + panX) * scale;
  const screenY = canvasRect.top + (node.pos[1] + panY) * scale;
  const nodeW = (node.size?.[0] || 300) * scale;
  const nodeH = (node.size?.[1] || 100) * scale;
  const yOffset = getContentYOffset(node) * scale;
  const pad = 4 * scale;
  const maxW = nodeW - pad * 2;
  const bottomPad = 6 * scale;
  const availableH = Math.max(0, nodeH - yOffset - bottomPad);

  if (maxW <= 0 || availableH < 20) { state.overlay.style.display = "none"; return; }

  state.overlay.style.display = "block";
  state.overlay.style.left = `${screenX + pad}px`;
  state.overlay.style.top = `${screenY + yOffset}px`;
  state.overlay.style.width = `${maxW}px`;
  state.overlay.style.maxHeight = `${availableH}px`;
  state.overlay.style.overflowY = "auto";
}

// RAF overlay position loop
(function startOverlayLoop() {
  function tick() {
    for (const [id, state] of overlayRegistry) {
      const node = app.graph?.getNodeById(id);
      if (node) {
        positionOverlay(node);
      } else {
        state.overlay.remove();
        overlayRegistry.delete(id);
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// ── Collapse Connections ─────────────────────────────────────────────

function setupCollapseConnections(node) {
  if (node.__aun_collapse_hooked) return;
  node.__aun_collapse_hooked = true;
  node.properties = node.properties || {};

  const origGetOutputPos = node.getOutputPos.bind(node);
  node.getOutputPos = function (index) {
    if (this.properties?.[COLLAPSE_KEY]) return origGetOutputPos(0);
    return origGetOutputPos(index);
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    if (origDrawFg) origDrawFg.apply(this, arguments);
    const c = !!this.properties?.[COLLAPSE_KEY];
    for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
      if (this.widgets?.length && slot.widget) continue;
      if (c) slot.label = " ";
    }
  };

  function toggleCollapse() {
    const on = !this.properties[COLLAPSE_KEY];
    this.properties[COLLAPSE_KEY] = on;
    if (!on) {
      const names = getWidgetNames(this);
      syncOutputs(this, names, this._aunEntries);
    }
    this.graph?.setDirtyCanvas(true, true);
  }

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);
    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
    if (app?.canvas?.interacting_widget || app?.canvas?.active_widget) return;
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.classList?.contains("litegraph") || el.id?.includes("widget"))) return;
    toggleCollapse.call(this);
  };

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    if (origMenu) origMenu.apply(this, [canvas, options]);
    const on = !!this.properties?.[COLLAPSE_KEY];
    options.push(null, {
      content: on ? "Show Connections" : "Collapse Connections",
      callback: () => toggleCollapse.call(this),
    });
  };
}

// ── Show / Hide Data Types ──────────────────────────────────────────

function setupShowTypes(node) {
  if (node.__aun_show_types_hooked) return;
  node.__aun_show_types_hooked = true;
  node.properties = node.properties || {};
  if (typeof node.properties[SHOW_TYPES_KEY] !== "boolean") {
    node.properties[SHOW_TYPES_KEY] = true;
  }

  function toggleShowTypes() {
    const cur = !!this.properties[SHOW_TYPES_KEY];
    this.properties[SHOW_TYPES_KEY] = !cur;
    if (this._aunEntries) {
      const state = overlayRegistry.get(Number(this.id));
      if (state) {
        const filtered = filterEntriesByPattern(this, this._aunEntries);
        buildOverlayCards(state.container, filtered, this.properties[SHOW_TYPES_KEY], this.properties[MAX_VALUE_LEN_KEY] ?? 500);
      }
    }
  }

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    if (origMenu) origMenu.apply(this, [canvas, options]);
    const on = !!this.properties?.[SHOW_TYPES_KEY];
    options.push({
      content: on ? "Hide Data Types" : "Show Data Types",
      callback: () => toggleShowTypes.call(this),
    });
  };
}

// ── Max Value Len (right-click menu) ────────────────────────────────

const MAX_VALUE_LEN_PRESETS = [
  { label: "200", value: 200 },
  { label: "500 (default)", value: 500 },
  { label: "1000", value: 1000 },
  { label: "2000", value: 2000 },
  { label: "Unlimited", value: 0 },
];

function setupMaxValueLen(node) {
  if (node.__aun_max_value_len_hooked) return;
  node.__aun_max_value_len_hooked = true;
  node.properties = node.properties || {};
  if (typeof node.properties[MAX_VALUE_LEN_KEY] !== "number") {
    node.properties[MAX_VALUE_LEN_KEY] = 500;
  }

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    if (origMenu) origMenu.apply(this, [canvas, options]);
    options.push(null, {
      content: "Max Value Len",
      disabled: true,
    });
    for (const p of MAX_VALUE_LEN_PRESETS) {
      const current = this.properties?.[MAX_VALUE_LEN_KEY] === p.value;
      options.push({
        content: (current ? "✓ " : "   ") + p.label,
        callback: () => {
          this.properties[MAX_VALUE_LEN_KEY] = p.value;
          if (this._aunEntries) {
            const state = overlayRegistry.get(Number(this.id));
            if (state) {
              const filtered = filterEntriesByPattern(this, this._aunEntries);
              buildOverlayCards(state.container, filtered, this.properties[SHOW_TYPES_KEY] !== false, p.value);
            }
          }
        },
      });
    }
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function matchesNodeType(node) {
  return node?.comfyClass === NODE_TYPE || node?.type === NODE_TYPE;
}

function getWidgetNames(node) {
  return node?.properties?.widget_names || [];
}

function setWidgetNames(node, names) {
  if (!node.properties) node.properties = {};
  node.properties.widget_names = names;
}

// ── Poll loop ───────────────────────────────────────────────────────

const trackedNodes = new Set();

let pollActive = false;
function startPollLoop() {
  if (pollActive) return;
  pollActive = true;
  function tick() {
    for (const node of trackedNodes) {
      if (node?.outputs) {
        const names = getWidgetNames(node);
        if (names.length) {
          const firstLabel = node.outputs[0]?.label;
          if (!firstLabel || firstLabel === "value_1" || !names.includes(firstLabel)) {
            syncOutputs(node, names, node._aunEntries);
          }
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ── Extension Registration ──────────────────────────────────────────

app.registerExtension({
  name: "AUNNodes.ScanAndShowWidgets",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const origOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      origOnExecuted?.apply(this, arguments);

      if (message?.widget_names) {
        setWidgetNames(this, message.widget_names);
        syncOutputs(this, message.widget_names, message.entries);
      }

      if (message?.entries) {
        this._aunEntries = message.entries;
        this.properties = this.properties || {};
        this.properties.aun_entries = JSON.stringify(message.entries);

        const state = getOverlayState(this);
        const filtered = filterEntriesByPattern(this, message.entries);
        buildOverlayCards(state.container, filtered, this.properties?.show_types !== false, this.properties?.max_value_len ?? 500);
        positionOverlay(this);
      }
    };

    const origOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      origOnConfigure?.apply(this, arguments);
      this._aunFromWorkflow = true;

      this._aunSavedHeight = this.size?.[1] ?? 0;
      const savedH = this._aunSavedHeight;
      this._aunOrigComputeSize = this.computeSize.bind(this);
      const origCS = this._aunOrigComputeSize;
      this.computeSize = function () {
        const s = origCS();
        if (s && s.length >= 2 && savedH > 0) {
          s[1] = Math.max(s[1], savedH);
        }
        return s;
      };

      const names = getWidgetNames(this);
      if (names.length) {
        syncOutputs(this, names, this._aunEntries);
      }

      if (this.properties?.aun_entries) {
        try {
          const entries = JSON.parse(this.properties.aun_entries);
          if (entries?.length) {
            this._aunEntries = entries;
            requestAnimationFrame(() => {
              const state = getOverlayState(this);
              const filtered = filterEntriesByPattern(this, entries);
              buildOverlayCards(state.container, filtered, this.properties?.show_types !== false, this.properties?.max_value_len ?? 500);
              positionOverlay(this);
            });
          }
        } catch (e) {}
      }
    };

    const origOnAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = function () {
      origOnAdded?.apply(this, arguments);
      trackedNodes.add(this);
    };

    const origOnRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      trackedNodes.delete(this);
      removeOverlayState(this);
      return origOnRemoved?.apply(this, arguments);
    };
  },

  nodeCreated(node) {
    if (!matchesNodeType(node)) return;
    setWidgetNames(node, []);
    node.properties = node.properties || {};
    if (typeof node.properties[FILTER_INCLUDE_KEY] !== "string") node.properties[FILTER_INCLUDE_KEY] = "";
    if (typeof node.properties[FILTER_EXCLUDE_PATTERNS_KEY] !== "string") node.properties[FILTER_EXCLUDE_PATTERNS_KEY] = "";
    trackedNodes.add(node);
    setupCollapseConnections(node);
    setupShowTypes(node);
    setupMaxValueLen(node);
    installFilterTitleButton(node);

    requestAnimationFrame(() => {
      if (!node.__aun_recalc_done) {
        node.__aun_recalc_done = true;
        if (node._aunFromWorkflow) {
          if (node._aunSavedHeight > 0) {
            node.size[1] = node._aunSavedHeight;
          }
          delete node._aunSavedHeight;
          delete node._aunFromWorkflow;
          if (node._aunOrigComputeSize) {
            node.computeSize = node._aunOrigComputeSize;
            delete node._aunOrigComputeSize;
          }
          const graph = node.graph ?? app.graph;
          if (graph) graph.setDirtyCanvas(true, true);
        } else {
          growToContentSize(node);
        }
      }
    });

    startPollLoop();
  },

  loadedGraphNode(node) {
    if (!matchesNodeType(node)) return;
    node.properties = node.properties || {};
    if (typeof node.properties[FILTER_INCLUDE_KEY] !== "string") node.properties[FILTER_INCLUDE_KEY] = "";
    if (typeof node.properties[FILTER_EXCLUDE_PATTERNS_KEY] !== "string") node.properties[FILTER_EXCLUDE_PATTERNS_KEY] = "";
    trackedNodes.add(node);
    setupCollapseConnections(node);
    setupShowTypes(node);
    setupMaxValueLen(node);
    installFilterTitleButton(node);
    startPollLoop();
  },
});
