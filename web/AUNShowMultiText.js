import { app } from "../../scripts/app.js";

const NODE_TYPE = "AUNShowMultiText";
const MAX_INPUTS = 20;
const INPUT_PREFIX = "input_";
const COLLAPSE_KEY = "collapse_connections";

// ── Socket visibility / num_inputs management ─────────────────────────

function clampInputCount(value) {
  if (Number.isFinite(value)) {
    return Math.min(MAX_INPUTS, Math.max(1, Math.floor(value)));
  }
  return 1;
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
            input.label = outSlot.label || outSlot.name || input.name;
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

function applyVisibleInputs(node, desired) {
  const target = clampInputCount(desired);
  const inputs = node.inputs || [];
  let changed = false;

  for (let i = inputs.length - 1; i >= 0; i--) {
    const input = inputs[i];
    if (!input?.name?.startsWith(INPUT_PREFIX)) continue;
    const num = parseInt(input.name.substring(INPUT_PREFIX.length), 10);
    if (Number.isFinite(num) && num > target) {
      if (input.link) {
        const graph = node.graph || app.graph;
        graph?.removeLink?.(input.link);
      }
      node.removeInput(i);
      changed = true;
    }
  }

  for (let i = 1; i <= target; i++) {
    const name = INPUT_PREFIX + i;
    if (!node.inputs?.some((input) => input?.name === name)) {
      node.addInput(name, "STRING");
      changed = true;
    }
  }

  if (changed) {
    updateInputLabels(node);
    const graph = node.graph ?? app.graph;
    if (graph) graph.setDirtyCanvas(true, true);
  }
}

function recalcNumInputs(node) {
  let highestConnected = 0;
  for (const input of node.inputs || []) {
    const match = input?.name?.match(/^input_(\d+)$/);
    if (match && input.link != null) {
      const num = parseInt(match[1], 10);
      if (num > highestConnected) highestConnected = num;
    }
  }
  const target = Math.max(1, Math.min(MAX_INPUTS, highestConnected + 1));
  applyVisibleInputs(node, target);
}

function setupNode(node) {
  if (node.__aun_hooked) return;
  node.__aun_hooked = true;
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

function buildOverlayCards(container, entries) {
  container.innerHTML = "";
  for (const entry of entries) {
    const card = document.createElement("div");
    card.style.cssText = `
      background: rgba(30, 30, 30, 0.95);
      border-radius: 4px;
      border-left: 3px solid #5a7a9a;
      padding: 4px 10px;
      margin: 2px 0;
    `;

    const capEl = document.createElement("div");
    capEl.style.cssText = `
      font: 13px sans-serif;
      color: #b0c4de;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    capEl.textContent = entry.caption || "";

    const valEl = document.createElement("div");
    valEl.style.cssText = `
      font: 12px sans-serif;
      color: #d0d0d0;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
    `;
    valEl.textContent = entry.value || "";

    card.appendChild(capEl);
    card.appendChild(valEl);
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

  // Don't position if not on graph yet
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

  // Hide if another node is stacked on top (higher z-order)
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
        // Orphaned overlay – clean up
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
      } else {
        delete slot.label;
      }
    }
  };

  function toggleCollapse() {
    const on = !this.properties[COLLAPSE_KEY];
    this.properties[COLLAPSE_KEY] = on;
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

// ── Extension Registration ──────────────────────────────────────────

app.registerExtension({
  name: "AUNNodes.ShowMultiText",

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== NODE_TYPE) return;

    // onConnectionsChange – autogrow when connections change
    const baseOnConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (slotType, slot, isConnected, link_info, output) {
      baseOnConnectionsChange?.apply(this, arguments);
      // Skip during graph loading – RAF from nodeCreated/onConfigure handles it
      if (this.comfyClass === NODE_TYPE && this.__aun_recalc_done) {
        recalcNumInputs(this);
        updateInputLabels(this);
      }
    };

    // onExecuted
    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      onExecuted?.apply(this, arguments);
      if (message?.entries) {
        this._aunEntries = message.entries;
        this.properties = this.properties || {};
        this.properties.aun_entries = JSON.stringify(message.entries);

        const state = getOverlayState(this);
        buildOverlayCards(state.container, message.entries);
        positionOverlay(this);
      }
    };

    // onConfigure – restore from saved workflow
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      onConfigure?.apply(this, arguments);

      // Defer recalc until graph loading is complete (all links restored)
      requestAnimationFrame(() => {
        if (!this.__aun_recalc_done) {
          this.__aun_recalc_done = true;
          recalcNumInputs(this);
          updateInputLabels(this);
        }
      });

      if (this.properties?.aun_entries) {
        try {
          const entries = JSON.parse(this.properties.aun_entries);
          if (entries?.length) {
            this._aunEntries = entries;
            requestAnimationFrame(() => {
              const state = getOverlayState(this);
              buildOverlayCards(state.container, entries);
              positionOverlay(this);
            });
          }
        } catch (e) {}
      }
    };

    // Clean up overlay on node removal
    const origOnRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      removeOverlayState(this);
      return origOnRemoved?.apply(this, arguments);
    };
  },

  nodeCreated(node) {
    if (node.comfyClass === NODE_TYPE) {
      setupNode(node);
      setupCollapseConnections(node);
      // Defer initial autogrow to next frame:
      //   - new nodes: RAF fires after node creation, sets count to 1
      //   - loaded nodes: RAF fires after graph loading (all links restored)
      requestAnimationFrame(() => {
        if (!node.__aun_recalc_done) {
          node.__aun_recalc_done = true;
          recalcNumInputs(node);
          updateInputLabels(node);
        }
      });
    }
  },

  loadedGraphNode(node) {
    if (node.comfyClass === NODE_TYPE) {
      setupNode(node);
      setupCollapseConnections(node);
    }
  },

});

// ── Poll for connected node title changes ───────────────────────────

let lastTitles = {};
function pollForTitleChanges() {
  if (app?.graph?._nodes) {
    for (const node of app.graph._nodes) {
      if (node.title !== lastTitles[node.id]) {
        lastTitles[node.id] = node.title;
        app.graph._nodes.forEach((n) => {
          if (n.comfyClass === NODE_TYPE) updateInputLabels(n);
        });
        if (app.canvas) {
          app.canvas.setDirty(true, true);
          app.canvas.draw(true, true);
        }
      }
    }
  }
  requestAnimationFrame(pollForTitleChanges);
}
pollForTitleChanges();
