// ── Auto-Populate Presets – Widgets Modal ────────────────────────────
// Modeled on AUN_scan_and_show_widgets.js (widget picker overlay)
// ────────────────────────────────────────────────────────────────────

import { findNodeByIdentifier } from "./index.js";

const STYLE_KEY = "__AUN_autopop_widgetsModalStyle";
const PROP_KEY = "_AUN_activeWidgets";

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

// ── Helpers ────────────────────────────────────────────────────────

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function getWidgetData(node) {
  try { return JSON.parse(node.__aun_widgetDataJSON || "[]"); } catch { return []; }
}

function findTargetNode(node) {
  const ident = String(getWidget(node, "node_identifier")?.value ?? "").trim();
  if (!ident) return null;
  return findNodeByIdentifier(node.graph || window.app?.graph, ident, node);
}

// ── Active set ─────────────────────────────────────────────────────

export function getActiveSet(node) {
  const raw = node?.properties?.[PROP_KEY];
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length) return new Set(arr);
  } catch {}
  return null;
}

export function getActiveWidgetData(node) {
  const all = getWidgetData(node);
  const activeSet = getActiveSet(node);
  if (!activeSet) return all;
  return all.filter((w) => activeSet.has(w.name));
}

export function getTargetWidgetValue(node, widgetName) {
  const target = findTargetNode(node);
  if (!target) return null;
  const tw = target.widgets?.find((w) => w.name === widgetName);
  return tw?.value ?? null;
}

// ── Styles ─────────────────────────────────────────────────────────

function ensureStyles() {
  if (window[STYLE_KEY]) return;
  window[STYLE_KEY] = true;
  const style = document.createElement("style");
  style.textContent = `
    .AUN-autopop-wm-open .litegraph.litecanvas { pointer-events: none !important; }
    .AUN-autopop-wm-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); font-family: system-ui, sans-serif;
    }
    .AUN-autopop-wm-dialog {
      background: #1e1e2e; color: #cdd6f4; border-radius: 10px;
      width: min(96vw, 580px); max-height: 88vh; display: flex;
      flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .AUN-autopop-wm-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-autopop-wm-title { font-size: 15px; font-weight: 700; margin: 0; }
    .AUN-autopop-wm-subtitle { font-size: 11px; color: rgba(205,214,244,0.55); margin-top: 2px; }
    .AUN-autopop-wm-close {
      background: none; border: none; color: rgba(205,214,244,0.5);
      font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
    }
    .AUN-autopop-wm-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .AUN-autopop-wm-toolbar {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-autopop-wm-action {
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
      color: #cdd6f4; font-size: 11px; padding: 3px 10px; border-radius: 4px;
      cursor: pointer; white-space: nowrap;
    }
    .AUN-autopop-wm-action:hover { background: rgba(255,255,255,0.14); }
    .AUN-autopop-wm-search {
      flex: 1; min-width: 120px; background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
      color: #cdd6f4; font-size: 12px; padding: 3px 8px;
    }
    .AUN-autopop-wm-body {
      flex: 1; overflow-y: auto; padding: 6px 18px 10px; min-height: 0;
    }
    .AUN-autopop-wm-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 5px; cursor: pointer;
      border: 1px solid transparent; transition: background 0.1s;
    }
    .AUN-autopop-wm-item:hover { background: rgba(255,255,255,0.06); }
    .AUN-autopop-wm-item.active { background: rgba(137,180,250,0.1); border-color: rgba(137,180,250,0.25); }
    .AUN-autopop-wm-cb { width: 14px; height: 14px; accent-color: #89b4fa; flex-shrink: 0; }
    .AUN-autopop-wm-badge {
      font: bold 9px sans-serif; color: #fff; border-radius: 3px;
      padding: 1px 5px; white-space: nowrap; flex-shrink: 0;
    }
    .AUN-autopop-wm-name {
      flex: 1; font-size: 12px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .AUN-autopop-wm-val {
      font: 11px monospace; color: rgba(205,214,244,0.45);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      max-width: 180px; flex-shrink: 0;
    }
    .AUN-autopop-wm-empty {
      text-align: center; padding: 30px; color: rgba(205,214,244,0.35); font-size: 13px;
    }
    .AUN-autopop-wm-footer {
      display: flex; justify-content: flex-end; padding: 10px 18px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-autopop-wm-footer .AUN-autopop-wm-action { padding: 5px 20px; font-size: 12px; }
  `;
  document.head.appendChild(style);
}

// ── Modal ──────────────────────────────────────────────────────────

export function openWidgetsModal(node, options = {}) {
  if (!node) return;
  ensureStyles();

  // Remove existing
  const existing = document.querySelector(".AUN-autopop-wm-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "AUN-autopop-wm-overlay";

  const dialog = document.createElement("div");
  dialog.className = "AUN-autopop-wm-dialog";

  // Header
  const header = document.createElement("div");
  header.className = "AUN-autopop-wm-header";
  const headingGroup = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "AUN-autopop-wm-title";
  title.textContent = "Target Widgets";
  const subtitle = document.createElement("div");
  subtitle.className = "AUN-autopop-wm-subtitle";
  headingGroup.append(title, subtitle);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "AUN-autopop-wm-close";
  closeButton.textContent = "\u00d7";
  header.append(headingGroup, closeButton);

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "AUN-autopop-wm-toolbar";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "AUN-autopop-wm-search";
  searchInput.placeholder = "Filter widgets\u2026";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button"; refreshBtn.className = "AUN-autopop-wm-action";
  refreshBtn.textContent = "\u21bb Refresh";

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button"; selectAllBtn.className = "AUN-autopop-wm-action";
  selectAllBtn.textContent = "Select all";

  const selectNoneBtn = document.createElement("button");
  selectNoneBtn.type = "button"; selectNoneBtn.className = "AUN-autopop-wm-action";
  selectNoneBtn.textContent = "None";

  toolbar.append(searchInput, refreshBtn, selectAllBtn, selectNoneBtn);

  // Body
  const body = document.createElement("div");
  body.className = "AUN-autopop-wm-body";

  // Footer
  const footer = document.createElement("div");
  footer.className = "AUN-autopop-wm-footer";
  const doneButton = document.createElement("button");
  doneButton.type = "button"; doneButton.className = "AUN-autopop-wm-action";
  doneButton.textContent = "Done";
  footer.appendChild(doneButton);

  dialog.append(header, toolbar, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add("AUN-autopop-wm-open");

  // ── State ──────────────────────────────────────────────────────

  function getActiveSet() {
    const raw = node?.properties?.[PROP_KEY];
    if (!raw) return null;
    try { const a = JSON.parse(raw); if (Array.isArray(a)) return new Set(a); } catch {}
    return null;
  }

  function setActiveSet(s) {
    node.properties = node.properties || {};
    if (!s) {
      delete node.properties[PROP_KEY];
    } else {
      node.properties[PROP_KEY] = JSON.stringify([...s]);
    }
  }

  let activeSet = getActiveSet(); // null = all active
  const allData = getWidgetData(node);

  // ── Render ─────────────────────────────────────────────────────

  function renderList() {
    body.replaceChildren();
    const filter = (searchInput.value || "").toLowerCase();
    const shown = allData.filter((w) => !filter || w.name.toLowerCase().includes(filter));
    if (!shown.length) {
      const empty = document.createElement("div");
      empty.className = "AUN-autopop-wm-empty";
      empty.textContent = allData.length ? "No matching widgets" : "Run the node once to scan a target.";
      body.appendChild(empty);
      updateSubtitle();
      return;
    }
    for (const w of shown) {
      const isActive = !activeSet || activeSet.has(w.name);
      const item = document.createElement("div");
      item.className = "AUN-autopop-wm-item" + (isActive ? " active" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.className = "AUN-autopop-wm-cb"; cb.checked = isActive;

      const badge = document.createElement("span");
      badge.className = "AUN-autopop-wm-badge";
      const color = getTypeColor(w.type);
      badge.style.background = color;
      badge.textContent = w.type || "?";

      const nameEl = document.createElement("span");
      nameEl.className = "AUN-autopop-wm-name";
      nameEl.textContent = w.name;
      nameEl.title = w.name;

      const valEl = document.createElement("span");
      valEl.className = "AUN-autopop-wm-val";
      const tv = getTargetWidgetValue(node, w.name);
      valEl.textContent = tv != null ? String(tv) : "\u2014";
      if (tv != null) valEl.title = String(tv);

      item.append(cb, badge, nameEl, valEl);
      item.addEventListener("click", (e) => {
        if (e.target === cb) return;
        toggleWidget(w.name);
      });
      cb.addEventListener("change", () => toggleWidget(w.name));
      body.appendChild(item);
    }
    updateSubtitle();
  }

  function toggleWidget(name) {
    if (!activeSet) {
      // First edit: initialize from allData (all selected)
      activeSet = new Set(allData.map((w) => w.name));
    }
    if (activeSet.has(name)) activeSet.delete(name); else activeSet.add(name);
    // If all selected, normalize to null (all active)
    if (activeSet.size === allData.length) activeSet = null;
    setActiveSet(activeSet);
    renderList();
    options.onChanged?.(node);
  }

  function updateSubtitle() {
    const total = allData.length;
    const activeCount = activeSet ? activeSet.size : total;
    const targetTitle = findTargetNode(node)?.title || node?.properties?._AUN_targetTitle || "";
    const targetPart = targetTitle ? `${targetTitle} \u2014 ` : "";
    const hint = total > 0 ? ". Inactive widgets have no outputs." : "";
    subtitle.textContent = `${targetPart}${activeCount} / ${total} widgets active${hint}`;
  }

  // ── Events ─────────────────────────────────────────────────────

  searchInput.addEventListener("input", renderList);
  refreshBtn.addEventListener("click", () => { renderList(); });
  selectAllBtn.addEventListener("click", () => {
    activeSet = null;
    setActiveSet(null);
    renderList();
    options.onChanged?.(node);
  });
  selectNoneBtn.addEventListener("click", () => {
    activeSet = new Set();
    setActiveSet(new Set());
    renderList();
    options.onChanged?.(node);
  });

  let closed = false;
  const escHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", escHandler);
  closeButton.addEventListener("click", closeModal);
  doneButton.addEventListener("click", closeModal);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeModal();
  });

  function closeModal() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", escHandler);
    overlay.remove();
    document.body.classList.remove("AUN-autopop-wm-open");
    options.onChanged?.(node);
  }

  renderList();
  searchInput.focus();
}
