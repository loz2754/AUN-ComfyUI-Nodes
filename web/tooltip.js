let __AUN_tooltip_styles_loaded = false;
let __AUN_tooltip_element = null;
let __AUN_tooltip_timer = null;
let __AUN_current_target = null;

function ensureTooltipStyles() {
  if (__AUN_tooltip_styles_loaded) return;
  __AUN_tooltip_styles_loaded = true;

  const style = document.createElement("style");
  style.textContent = `
    .AUN-tooltip {
      position: fixed;
      z-index: 10000;
      max-width: 400px;
      padding: 8px 12px;
      background: #1e1e1e;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      font: 11px/1.4 sans-serif;
      color: #e0e0e0;
      pointer-events: none;
      opacity: 0;
      transition: opacity 120ms ease;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .AUN-tooltip.visible {
      opacity: 1;
    }
    .AUN-tooltip .AUN-tooltip-path {
      color: #a0c8ff;
      font-family: monospace;
      font-size: 10px;
      margin-bottom: 4px;
    }
    .AUN-tooltip .AUN-tooltip-name {
      color: #e0e0e0;
      font-weight: 500;
    }
  `;
  document.head.appendChild(style);
}

function createTooltipElement() {
  ensureTooltipStyles();
  const el = document.createElement("div");
  el.className = "AUN-tooltip";
  document.body.appendChild(el);
  return el;
}

function getTooltipElement() {
  if (!__AUN_tooltip_element) {
    __AUN_tooltip_element = createTooltipElement();
  }
  return __AUN_tooltip_element;
}

function positionTooltip(el, targetRect, offsetX = 8, offsetY = 8) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipRect = el.getBoundingClientRect();

  let left = targetRect.left + targetRect.width + offsetX;
  let top = targetRect.top + offsetY;

  if (left + tooltipRect.width > vw - 4) {
    left = targetRect.left - tooltipRect.width - offsetX;
    if (left < 4) left = 4;
  }
  if (top + tooltipRect.height > vh - 4) {
    top = targetRect.bottom - tooltipRect.height - offsetY;
    if (top < 4) top = 4;
  }

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function showTooltip(targetElement, content, options = {}) {
  const { delay = 300, offsetX = 8, offsetY = 8 } = options;

  if (__AUN_tooltip_timer) {
    clearTimeout(__AUN_tooltip_timer);
    __AUN_tooltip_timer = null;
  }

  const show = () => {
    const tooltip = getTooltipElement();
    tooltip.innerHTML = content;
    const targetRect = targetElement.getBoundingClientRect();
    positionTooltip(tooltip, targetRect, offsetX, offsetY);
    requestAnimationFrame(() => tooltip.classList.add("visible"));
  };

  __AUN_tooltip_timer = setTimeout(show, delay);
  __AUN_current_target = targetElement;
}

export function showTooltipAtPos(clientX, clientY, content, options = {}) {
  const { delay = 150, offsetX = 12, offsetY = 12 } = options;

  if (__AUN_tooltip_timer) {
    clearTimeout(__AUN_tooltip_timer);
    __AUN_tooltip_timer = null;
  }

  const show = () => {
    const tooltip = getTooltipElement();
    tooltip.innerHTML = content;
    // Position at client coordinates with offset
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = clientX + offsetX;
    let top = clientY + offsetY;
    if (left + tooltipRect.width > vw - 4) left = clientX - tooltipRect.width - offsetX;
    if (top + tooltipRect.height > vh - 4) top = clientY - tooltipRect.height - offsetY;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    requestAnimationFrame(() => tooltip.classList.add("visible"));
  };

  __AUN_tooltip_timer = setTimeout(show, delay);
}

export function hideTooltip() {
  if (__AUN_tooltip_timer) {
    clearTimeout(__AUN_tooltip_timer);
    __AUN_tooltip_timer = null;
  }
  if (__AUN_tooltip_element) {
    __AUN_tooltip_element.classList.remove("visible");
  }
  __AUN_current_target = null;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function formatLoraTooltip(fullPath) {
  if (!fullPath || fullPath === "None") return "None";

  const stripped = fullPath.replace(/\\/g, "/");
  const basename = stripped.split("/").pop() || fullPath;
  const name = basename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

  return `
    <span class="AUN-tooltip-path">${escapeHtml(fullPath)}</span>
    <span class="AUN-tooltip-name">${escapeHtml(name)}</span>
  `.trim();
}

export function formatComboTooltip(value) {
  if (!value || value === "None") return "None";

  return `
    <span class="AUN-tooltip-name">${escapeHtml(String(value))}</span>
  `.trim();
}

const __AUN_comboTooltipCleanup = [];

/**
 * Set up tooltip for ComfyUI combo widgets.
 * Works with both old frontend (<select>) and new frontend (button[role="combobox"] ReKa UI Combobox).
 * Uses aggressive polling + MutationObserver + app.registerExtension to cover all loading scenarios.
 */
export function setupComboWidgetTooltips() {
  if (__AUN_comboTooltipCleanup.length > 0) return;

  let isEnabled = true;

  const tryInit = () => {
    const app = window.app;
    if (!app?.graph?._nodes || !app.positionConversion?.clientPosToCanvasPos) {
      return setTimeout(tryInit, 500);
    }

    const comboWidgets = new Map();

    app.registerExtension({
      name: "AUN.ComboTooltip",
      nodeCreated(node) {
        if (!node.widgets) return;
        const combos = node.widgets.filter(w => w.type === "combo" || w.options?.values);
        if (combos.length) comboWidgets.set(node, combos);
      },
    });

    // Add toggle setting in ComfyUI Settings
    const setting = app.ui.settings.addSetting({
      id: "AUN.ComboTooltip.Enabled",
      name: "Show combo widget value tooltips",
      tooltip: "Shows the full selected value when hovering over dropdown widgets on nodes",
      type: "boolean",
      defaultValue: true,
      onChange: (value) => {
        isEnabled = value;
        if (!value) hideTooltip();
      },
    });
    isEnabled = setting.value;

    // Also sync for any existing nodes
    for (const node of app.graph._nodes) {
      if (!node.widgets) continue;
      const combos = node.widgets.filter(w => w.type === "combo" || w.options?.values);
      if (combos.length) comboWidgets.set(node, combos);
    }

    const canvas = app.canvasElRef?._value || document.querySelector("canvas.lgraphcanvas");
    if (!canvas) return setTimeout(tryInit, 500);

    let activeWidget = null;
    let isShowing = false;
    let clickSuppress = false;

    const getCanvasPos = (e) => {
      const gm = app.canvas?.graph_mouse;
      if (gm && !isNaN(gm[0]) && !isNaN(gm[1])) return gm;

      const m = app.canvas?.mouse;
      const el = app.canvasElRef?.value || app.canvasElRef?._value || document.querySelector("canvas.lgraphcanvas");
      if (m && el && !isNaN(m[0])) {
        const r = el.getBoundingClientRect();
        const ds = app.canvas?.ds;
        const scale = ds?.scale || 1;
        const offset = ds?.offset || [0, 0];
        const ox = Array.isArray(offset) ? offset[0] : (offset.x || 0);
        const oy = Array.isArray(offset) ? offset[1] : (offset.y || 0);
        return [(m[0] - r.left) / scale - ox, (m[1] - r.top) / scale - oy];
      }

      if (el) {
        const r = el.getBoundingClientRect();
        const ds = app.canvas?.ds;
        const scale = ds?.scale || 1;
        const offset = ds?.offset || [0, 0];
        const ox = Array.isArray(offset) ? offset[0] : (offset.x || 0);
        const oy = Array.isArray(offset) ? offset[1] : (offset.y || 0);
        return [(e.clientX - r.left) / scale - ox, (e.clientY - r.top) / scale - oy];
      }

      return null;
    };

    const onMouseMove = (e) => {
      if (!isEnabled || clickSuppress) return;

      // Suppress tooltip while a LoRA dropdown popup is open (would obscure it)
      if (document.querySelector(".AUN-lora-dropdown-popup")) {
        if (isShowing) { hideTooltip(); isShowing = false; activeWidget = null; }
        return;
      }

      const cp = getCanvasPos(e);
      if (!cp || isNaN(cp[0]) || isNaN(cp[1])) return;

      let found = false;
      for (const [node, widgets] of comboWidgets) {
        // Skip and clean up stale entries (deleted nodes)
        if (!app.graph?._nodes?.includes?.(node)) {
          comboWidgets.delete(node);
          continue;
        }
        const nx = node.pos[0], ny = node.pos[1];
        const nw = node.size[0], nh = node.size[1];
        const mx = cp[0], my = cp[1];
        if (mx < nx || mx > nx + nw || my < ny || my > ny + nh) continue;

        const titleH = Math.min(node.title_height || 30, 40);
        if (my < ny + titleH) continue;

        for (const w of widgets) {
          const wy = ny + (w.y || 0);
          const wh = w.height || 20;
          if (my < wy || my > wy + wh) continue;

          if (activeWidget !== w) {
            hideTooltip();
            isShowing = false;
            activeWidget = w;
            const value = String(w.value || "");
            if (value && value !== "None" && value !== "choose") {
              showTooltipAtPos(e.clientX, e.clientY, formatComboTooltip(value));
              isShowing = true;
            }
          }
          found = true;
          break;
        }
        if (found) break;
      }

      if (!found && isShowing) {
        hideTooltip();
        isShowing = false;
        activeWidget = null;
      }
    };
    canvas.addEventListener("mousemove", onMouseMove, false);
    __AUN_comboTooltipCleanup.push(() => canvas.removeEventListener("mousemove", onMouseMove));

    // Hide tooltip and suppress on ANY click (uses pointerdown because LiteGraph calls preventDefault on pointerdown,
    // which suppresses the synthesized mousedown event for canvas-rendered widgets)
    const onPointerDown = () => {
      if (isShowing) { hideTooltip(); isShowing = false; activeWidget = null; }
      clickSuppress = true;
      setTimeout(() => { clickSuppress = false; }, 400);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    __AUN_comboTooltipCleanup.push(() => document.removeEventListener("pointerdown", onPointerDown, true));

    // Re-sync when graph structure changes (rebuild from scratch to remove stale entries)
    const sync = () => {
      comboWidgets.clear();
      if (!app.graph?._nodes) return;
      for (const node of app.graph._nodes) {
        if (!node.widgets) continue;
        const combos = node.widgets.filter(w => w.type === "combo" || w.options?.values);
        if (combos.length) comboWidgets.set(node, combos);
      }
    };
    if (app.graph) {
      app.graph.addEventListener?.("change", sync);
    }
    __AUN_comboTooltipCleanup.push(sync);
  };

  setTimeout(tryInit, 100);
}

/**
 * Remove combo widget tooltip handlers.
 */
export function teardownComboWidgetTooltips() {
  for (const fn of __AUN_comboTooltipCleanup) fn();
  __AUN_comboTooltipCleanup.length = 0;
}

// Auto-setup combo widget tooltips on import
if (document.readyState === "complete" || document.readyState === "interactive") {
  setupComboWidgetTooltips();
} else {
  document.addEventListener("DOMContentLoaded", setupComboWidgetTooltips);
}