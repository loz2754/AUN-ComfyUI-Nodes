import { app } from "../../scripts/app.js";

const NODE_TYPE = "AUNPassthroughAnyMulti";
const MAX_INPUTS = 20;
const INPUT_PREFIX = "input_";
const COLLAPSE_KEY = "collapse_connections";
const SHOW_TYPES_KEY = "show_types";
const MAX_VALUE_LEN_KEY = "max_value_len";


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
  UNKNOWN: "#AAA",
};

function getTypeColor(typeName) {
  if (!typeName) return TYPE_COLORS.UNKNOWN;
  const upper = typeName.toUpperCase();
  return TYPE_COLORS[upper] || TYPE_COLORS.UNKNOWN;
}

// ── Socket visibility / num_inputs management ─────────────────────────

const PASSTHROUGH_CLASS = "AUNPassthroughAnyMulti";

function getSlotLabel(outSlot) {
  if (!outSlot) return "";
  const raw = outSlot.label;
  if (raw && raw.trim()) return raw.trim();
  return outSlot.name || "";
}

function resolveLinkInput(node, input) {
  if (input?.link == null) return getSlotLabel(input);
  const graph = node.graph || app.graph;
  const links = graph?.links;
  const link = links?.get ? links.get(input.link) : links?.[input.link];
  if (!link) return getSlotLabel(input);
  const src = graph?.getNodeById
    ? graph?.getNodeById(link.origin_id)
    : null;
  const outSlot = src?.outputs?.[link.origin_slot];
  if (!outSlot) return getSlotLabel(input);
  if (src && src.comfyClass === PASSTHROUGH_CLASS) {
    const outIdx = src.outputs.indexOf(outSlot);
    const mirrored = src.inputs?.[outIdx];
    if (mirrored) {
      const resolved = resolveGraphInput(src, mirrored);
      if (resolved) return resolved;
    }
  }
  return getSlotLabel(outSlot);
}

function resolveGraphInput(node, input) {
  const label = resolveLinkInput(node, input);
  return label || input?.name || "";
}

function updateInputLabels(node) {
  const graph = node.graph || app.graph;
  if (!graph || !node.inputs) return;

  for (const input of node.inputs) {
    if (!input?.name?.startsWith(INPUT_PREFIX)) continue;
    if (input.link != null) {
      const links = graph.links;
      const link = links?.get
        ? links.get(input.link)
        : links?.[input.link];
      if (link) {
        const srcNode = graph.getNodeById
          ? graph.getNodeById(link.origin_id)
          : null;
        if (srcNode && srcNode.outputs) {
          const outSlot = srcNode.outputs[link.origin_slot];
          if (outSlot) {
            input.label = resolveLinkInput(node, input) || input.name;
            continue;
          }
        }
      }
    }
    input.label = input.name;
  }
  if (app.canvas) {
    app.canvas.setDirty(true);
    app.canvas.draw(true, true);
  }
}

function updateOutputLabels(node) {
  const graph = node.graph || app.graph;
  if (!graph || !node.inputs || !node.outputs) return;

  for (const input of node.inputs) {
    if (!input?.name?.startsWith(INPUT_PREFIX)) continue;
    const num = parseInt(input.name.substring(INPUT_PREFIX.length), 10);
    if (!Number.isFinite(num) || num < 1) continue;

    const outIdx = num - 1;
    if (outIdx >= node.outputs.length) continue;
    const output = node.outputs[outIdx];
    if (!output) continue;

    if (input.link != null) {
      const links = graph.links;
      const link = links?.get
        ? links.get(input.link)
        : links?.[input.link];
      if (link) {
        const srcNode = graph.getNodeById
          ? graph.getNodeById(link.origin_id)
          : null;
        if (srcNode && srcNode.outputs) {
          const outSlot = srcNode.outputs[link.origin_slot];
          if (outSlot) {
            const resolved = resolveLinkInput(node, input) || `output_${num}`;
            output.label = resolved;
            output.name = resolved;
            continue;
          }
        }
      }
    }
    output.label = `output_${num}`;
    output.name = `output_${num}`;
  }
  if (app.canvas) {
    app.canvas.setDirty(true);
    app.canvas.draw(true, true);
  }
}

function applyVisibleInputs(node) {
  const inputs = node.inputs || [];
  let changed = false;

  const target = inputs.filter(
    (i) => i?.name?.startsWith(INPUT_PREFIX) && i.link != null,
  ).length;
  const targetCount = Math.max(1, Math.min(MAX_INPUTS, target + 1));

  for (let i = inputs.length - 1; i >= 0; i--) {
    const input = inputs[i];
    if (!input?.name?.startsWith(INPUT_PREFIX)) continue;
    const num = parseInt(input.name.substring(INPUT_PREFIX.length), 10);
    if (Number.isFinite(num) && num > targetCount) {
      if (input.link) {
        const graph = node.graph || app.graph;
        graph?.removeLink?.(input.link);
      }
      node.removeInput(i);
      changed = true;
    }
  }

  for (let i = 1; i <= targetCount; i++) {
    const name = INPUT_PREFIX + i;
    if (!node.inputs?.some((input) => input?.name === name)) {
      node.addInput(name, "*");
      changed = true;
    }
  }

  const outputTarget = Math.max(1, targetCount);
  while (node.outputs.length > outputTarget) {
    node.removeOutput(node.outputs.length - 1);
  }
  while (node.outputs.length < outputTarget) {
    node.addOutput(`output_${node.outputs.length + 1}`, "STRING");
  }

  if (changed) {
    updateInputLabels(node);
    resizeNode(node);
  }
  updateOutputLabels(node);
}

function recalcNumInputs(node) {
  applyVisibleInputs(node);
}

function resizeNode(node) {
  if (typeof node?.computeSize === "function") {
    const newSize = node.computeSize();
    if (node.size && newSize && newSize.length >= 2) {
      node.size[1] = Math.max(node.size[1] || 0, newSize[1]);
    }
  }
  const graph = node.graph ?? app.graph;
  if (graph) graph.setDirtyCanvas(true, true);
}

// ── Shared helpers ──────────────────────────────────────────────────

function getContentYOffset(node, ignoreCollapse) {
  let bottomY = 6;
  for (const w of node.widgets || []) {
    if (w.hidden) continue;
    const wY = w.last_y != null ? w.last_y : 30;
    const wSize = w.computeSize?.(node.size?.[0]) || [200, 24];
    bottomY = Math.max(bottomY, wY + wSize[1]);
  }
  const slotStartY = node.constructor?.slot_start_y ?? 0;
  const nInputs = (node.inputs || []).filter(
    (i) => !(node.widgets?.length && i.widget),
  ).length;
  const nOutputs = (node.outputs || []).length;
  const maxSockets = Math.max(nInputs, nOutputs);
  const isCollapsed = !ignoreCollapse && !!node.properties?.[COLLAPSE_KEY];
  const socketRows = isCollapsed ? Math.min(maxSockets, 1) : maxSockets;
  const socketBlockEnd = slotStartY + socketRows * LiteGraph.NODE_SLOT_HEIGHT;
  return Math.max(bottomY, socketBlockEnd) + 4;
}

// ── HTML Overlay Display ─────────────────────────────────────────────

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

function buildOverlayCards(container, entries, showTypes = true) {
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

    if (entry.preview) {
      const img = document.createElement("img");
      img.src = `data:image/png;base64,${entry.preview}`;
      img.style.cssText = `
        display: block;
        max-width: 100%;
        max-height: 300px;
        border-radius: 3px;
        margin-top: 4px;
      `;
      card.appendChild(img);

      if (entry.value) {
        const valEl = document.createElement("div");
        valEl.style.cssText = `
          font: 11px sans-serif;
          color: #ddd;
          text-align: center;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.3;
          margin-top: 3px;
        `;
        valEl.textContent = entry.value;
        if (entry.full_value) valEl.title = entry.full_value;
        card.appendChild(valEl);
      }
    } else if (entry.value) {
      const valEl = document.createElement("div");
      valEl.style.cssText = `
        font: 12px sans-serif;
        color: #d0d0d0;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.4;
      `;
      valEl.textContent = entry.value;
      if (entry.full_value) valEl.title = entry.full_value;
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

function positionOverlay(node) {
  const id = Number(node.id);
  const state = overlayRegistry.get(id);
  if (!state) return;

  if (!node.graph) {
    state.overlay.style.display = "none";
    return;
  }

  const canvas = app.canvas;
  if (!canvas?.canvas || node.flags?.collapsed) {
    state.overlay.style.display = "none";
    return;
  }

  const ds = canvas.ds;
  if (!ds) {
    state.overlay.style.display = "none";
    return;
  }

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

  if (maxW <= 0 || availableH < 20) {
    state.overlay.style.display = "none";
    return;
  }

  state.overlay.style.display = "block";
  state.overlay.style.left = `${screenX + pad}px`;
  state.overlay.style.top = `${screenY + yOffset}px`;
  state.overlay.style.width = `${maxW}px`;
  state.overlay.style.maxHeight = `${availableH}px`;
  state.overlay.style.overflowY = "auto";
}

// RAF overlay position loop
function startOverlayLoop() {
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
}
startOverlayLoop();

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

  const origGetInputPos = node.getInputPos.bind(node);
  node.getInputPos = function (index) {
    if (this.properties?.[COLLAPSE_KEY]) return origGetInputPos(0);
    return origGetInputPos(index);
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    if (origDrawFg) origDrawFg.apply(this, arguments);
    const c = !!this.properties?.[COLLAPSE_KEY];
    for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
      if (this.widgets?.length && slot.widget) continue;
      if (c) {
        slot.label = " ";
      }
    }
  };

  function toggleCollapse() {
    const on = !this.properties[COLLAPSE_KEY];
    this.properties[COLLAPSE_KEY] = on;
    if (!on) {
      updateInputLabels(this);
      updateOutputLabels(this);
    }
    this.graph?.setDirtyCanvas(true, true);
  }

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);
    if (
      Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0
    ) return;
    if (app?.canvas?.interacting_widget || app?.canvas?.active_widget) return;
    const el = document.activeElement;
    if (
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.classList?.contains("litegraph") ||
        el.id?.includes("widget"))
    ) return;
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
        buildOverlayCards(state.container, this._aunEntries, this.properties[SHOW_TYPES_KEY]);
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
        },
      });
    }
  };
}

// ── Extension Registration ──────────────────────────────────────────

app.registerExtension({
  name: "AUNNodes.PassthroughAnyMulti",

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== NODE_TYPE) return;

    const baseOnConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (slotType, slot, isConnected, link_info, output) {
      baseOnConnectionsChange?.apply(this, arguments);
      if (this.comfyClass === NODE_TYPE && this.__aun_recalc_done) {
        recalcNumInputs(this);
        updateInputLabels(this);
        updateOutputLabels(this);
        resizeNode(this);
      }

    };

    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      onExecuted?.apply(this, arguments);
      if (message?.entries) {
        this._aunEntries = message.entries;
        this.properties = this.properties || {};
        this.properties.aun_entries = JSON.stringify(message.entries);

        const state = getOverlayState(this);
        buildOverlayCards(state.container, message.entries, this.properties?.show_types !== false);
        positionOverlay(this);
      }
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);
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

      if (this.properties?.aun_entries) {
        try {
          const entries = JSON.parse(this.properties.aun_entries);
          if (entries?.length) {
            this._aunEntries = entries;
            requestAnimationFrame(() => {
              const state = getOverlayState(this);
              buildOverlayCards(state.container, entries, this.properties?.show_types !== false);
              positionOverlay(this);
            });
          }
        } catch (e) {}
      }
    };

    const origOnRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      removeOverlayState(this);
      return origOnRemoved?.apply(this, arguments);
    };
  },

  nodeCreated(node) {
    if (node.comfyClass === NODE_TYPE) {
      setupCollapseConnections(node);
      setupShowTypes(node);
      setupMaxValueLen(node);
      requestAnimationFrame(() => {
        if (!node.__aun_recalc_done) {
          node.__aun_recalc_done = true;
          recalcNumInputs(node);
          updateInputLabels(node);
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
            resizeNode(node);
          }
        }
      });
    }
  },

  loadedGraphNode(node) {
    if (node.comfyClass === NODE_TYPE) {
      setupCollapseConnections(node);
      setupShowTypes(node);
      setupMaxValueLen(node);
    }
  },

});

// ── Poll for connected node title / label changes ──────────────────

let lastTitles = {};
function rawSourceLabel(node, input) {
  if (input?.link == null) return "";
  const graph = node.graph || app.graph;
  const links = graph?.links;
  const link = links?.get ? links.get(input.link) : links?.[input.link];
  if (!link) return "";
  const src = graph?.getNodeById ? graph?.getNodeById(link.origin_id) : null;
  const outSlot = src?.outputs?.[link.origin_slot];
  return getSlotLabel(outSlot || {});
}

function labelsSig(node) {
  return (node.inputs || [])
    .filter((i) => i?.name?.startsWith(INPUT_PREFIX))
    .map((i) => inputDisplayLabel(node, i))
    .join("\u0001");
}

function inputDisplayLabel(node, input) {
  return (resolveGraphInput(node, input) || `output_${parseInt(input.name.substring(INPUT_PREFIX.length), 10)}`).replace(/\s+/g, " ").trim();
}

function pollForTitleChanges() {
  if (app?.graph?._nodes) {
    for (const node of app.graph._nodes) {
      node.__aun_sig = node.__aun_sig || {};
      const changedTitle = node.title !== lastTitles[node.id];
      if (changedTitle) lastTitles[node.id] = node.title;
      if (node.comfyClass === NODE_TYPE) {
        const sig = labelsSig(node);
        if (changedTitle || sig !== node.__aun_lastSig) {
          node.__aun_lastSig = sig;
          updateInputLabels(node);
          updateOutputLabels(node);
        }
      }
    }
    app.graph._nodes.forEach((n) => {
      if (n.comfyClass === NODE_TYPE) {
        const sig = labelsSig(n);
        if (sig !== n.__aun_lastSig) {
          n.__aun_lastSig = sig;
          updateInputLabels(n);
          updateOutputLabels(n);
        }
      }
    });
    if (app.canvas) {
      app.canvas.setDirty(true, true);
      app.canvas.draw(true, true);
    }
  }
  requestAnimationFrame(pollForTitleChanges);
}
pollForTitleChanges();