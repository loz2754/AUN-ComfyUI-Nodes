// ── Auto-Populate Presets – Setup Modal ─────────────────────────────
// Modeled on AUN_random_lora_multi_setup_dialog.js
// ────────────────────────────────────────────────────────────────────

import { app } from "../../scripts/app.js";
import { findNodeByIdentifier } from "./index.js";

const MAX_ROWS = 20;
const MAX_WIDGETS = 25;
const STYLE_KEY = "__AUN_autopop_setupStyle";
const MODAL_KEY = "__AUN_autopop_setupRefs";

// ── Helpers ────────────────────────────────────────────────────────

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function getVisibleRows(node) {
  const w = getWidget(node, "visible_rows");
  const val = w?.value;
  return Number.isFinite(val) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(val))) : 5;
}

function getWidgetData(node) {
  try { return JSON.parse(node.__aun_widgetDataJSON || "[]"); } catch { return []; }
}

const ACTIVE_WIDGETS_KEY = "_AUN_activeWidgets";

function getActiveSet(node) {
  const raw = node?.properties?.[ACTIVE_WIDGETS_KEY];
  if (!raw) return null;
  try { const a = JSON.parse(raw); if (Array.isArray(a)) return new Set(a); } catch {}
  return null;
}

function getActiveWidgetData(node) {
  const all = getWidgetData(node);
  const activeSet = getActiveSet(node);
  if (!activeSet) return all;
  if (activeSet.size === 0) return [];
  return all.filter((w) => activeSet.has(w.name));
}

function readRowValues(node, row, widgetData) {
  const rowKey = "row" + row;
  const rowMap = node?.__aun_slotMapping?.[rowKey] || {};
  const values = {};
  for (const wd of widgetData) {
    const slotIndex = rowMap[wd.name];
    if (slotIndex != null) {
      const w = getWidget(node, "slot" + row + "_" + slotIndex);
      if (w) values[wd.name] = w.value;
    }
  }
  return values;
}

function writeRowValues(node, row, widgetData, values) {
  const rowKey = "row" + row;
  const rowMap = node?.__aun_slotMapping?.[rowKey] || {};
  for (const wd of widgetData) {
    const slotIndex = rowMap[wd.name];
    if (slotIndex == null) continue;
    const w = getWidget(node, "slot" + row + "_" + slotIndex);
    if (w && values[wd.name] !== undefined) w.value = String(values[wd.name]);
  }
}

function findTargetNode(node) {
  const ident = String(getWidget(node, "node_identifier")?.value ?? "").trim();
  if (!ident) return null;
  return findNodeByIdentifier(node.graph || app?.graph, ident, node);
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) return false;
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

async function readClipboard() {
  try { return await navigator.clipboard.readText(); }
  catch { return null; }
}

// ── Styles ─────────────────────────────────────────────────────────

function ensureStyles() {
  if (window[STYLE_KEY]) return;
  window[STYLE_KEY] = true;
  const style = document.createElement("style");
  style.textContent = `
    .AUN-autopop-setup-open .litegraph.litecanvas { pointer-events: none !important; }
    .AUN-autopop-setup-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); font-family: system-ui, sans-serif;
    }
    .AUN-autopop-setup-dialog {
      background: #1e1e2e; color: #cdd6f4; border-radius: 10px;
      width: min(96vw, 720px); max-height: 92vh; display: flex;
      flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .AUN-autopop-setup-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-autopop-setup-title { font-size: 15px; font-weight: 700; margin: 0; }
    .AUN-autopop-setup-subtitle { font-size: 11px; color: rgba(205,214,244,0.55); margin-top: 2px; }
    .AUN-autopop-setup-close {
      background: none; border: none; color: rgba(205,214,244,0.5);
      font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
    }
    .AUN-autopop-setup-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .AUN-autopop-setup-toolbar {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-autopop-setup-toolbar-label { font-size: 12px; color: rgba(205,214,244,0.7); margin-right: 2px; }
    .AUN-autopop-setup-stepper {
      display: inline-flex; align-items: center; gap: 2px;
    }
    .AUN-autopop-setup-stepper input {
      width: 36px; text-align: center; background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
      color: #cdd6f4; font-size: 12px; padding: 2px 0;
    }
    .AUN-autopop-setup-action {
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
      color: #cdd6f4; font-size: 11px; padding: 3px 10px; border-radius: 4px;
      cursor: pointer; white-space: nowrap;
    }
    .AUN-autopop-setup-action:hover { background: rgba(255,255,255,0.14); }
    .AUN-autopop-setup-action--danger { border-color: rgba(243,139,168,0.3); }
    .AUN-autopop-setup-action--danger:hover { background: rgba(243,139,168,0.18); color: #f38ba8; }
    .AUN-autopop-setup-select {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px; color: #cdd6f4; font-size: 11px; padding: 2px 4px;
      cursor: pointer; max-width: 140px;
    }
    .AUN-autopop-setup-status { font-size: 11px; color: rgba(205,214,244,0.5); margin-left: auto; }
    .AUN-autopop-setup-body {
      flex: 1; overflow-y: auto; padding: 10px 18px; display: flex;
      flex-direction: column; gap: 8px; min-height: 0;
    }
    .AUN-autopop-setup-row {
      background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px; overflow: hidden;
    }
    .AUN-autopop-setup-row-head {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px 6px;
    }
    .AUN-autopop-setup-row-num {
      font-size: 11px; font-weight: 700; color: rgba(205,214,244,0.45);
      min-width: 22px; text-align: center;
    }
    .AUN-autopop-setup-row-kw {
      flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px; color: #cdd6f4; font-size: 12px; padding: 3px 8px;
    }
    .AUN-autopop-setup-row-kw::placeholder { color: rgba(205,214,244,0.3); }
    .AUN-autopop-setup-row-actions { display: flex; gap: 3px; }
    .AUN-autopop-setup-icon-btn {
      background: none; border: 1px solid rgba(255,255,255,0.08); color: rgba(205,214,244,0.5);
      font-size: 13px; width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .AUN-autopop-setup-icon-btn:hover { background: rgba(255,255,255,0.1); color: #cdd6f4; }
    .AUN-autopop-setup-icon-btn.is-danger:hover { color: #f38ba8; border-color: rgba(243,139,168,0.3); }
    .AUN-autopop-setup-fields {
      display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 10px 10px;
    }
    .AUN-autopop-setup-field {
      display: flex; flex-direction: column; gap: 2px; min-width: 100px; flex: 1 1 100px; max-width: 200px;
    }
    .AUN-autopop-setup-field-label {
      font-size: 10px; color: rgba(205,214,244,0.45); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .AUN-autopop-setup-field input, .AUN-autopop-setup-field select {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px; color: #cdd6f4; font-size: 12px; padding: 2px 6px;
    }
    .AUN-autopop-setup-field input[type="checkbox"] {
      width: auto; accent-color: #89b4fa; margin-top: 2px;
    }
    .AUN-autopop-setup-footer {
      display: flex; justify-content: flex-end; padding: 10px 18px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-autopop-setup-footer .AUN-autopop-setup-action { padding: 5px 20px; font-size: 12px; }
    .AUN-autopop-setup-empty {
      text-align: center; padding: 40px; color: rgba(205,214,244,0.4); font-size: 13px;
    }
  `;
  document.head.appendChild(style);
}

// ── Modal ──────────────────────────────────────────────────────────

function ensureModal() {
  ensureStyles();
  if (window[MODAL_KEY]) return window[MODAL_KEY];

  const overlay = document.createElement("div");
  overlay.className = "AUN-autopop-setup-overlay";

  const dialog = document.createElement("div");
  dialog.className = "AUN-autopop-setup-dialog";

  // Header
  const header = document.createElement("div");
  header.className = "AUN-autopop-setup-header";
  const heading = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "AUN-autopop-setup-title";
  title.textContent = "Preset Setup";
  const subtitle = document.createElement("div");
  subtitle.className = "AUN-autopop-setup-subtitle";
  heading.append(title, subtitle);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "AUN-autopop-setup-close";
  closeButton.textContent = "\u00d7";
  header.append(heading, closeButton);

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "AUN-autopop-setup-toolbar";
  const toolbarLabel = document.createElement("span");
  toolbarLabel.className = "AUN-autopop-setup-toolbar-label";
  toolbarLabel.textContent = "Rows:";

  const stepper = document.createElement("span");
  stepper.className = "AUN-autopop-setup-stepper";
  const numDec = document.createElement("button");
  numDec.type = "button"; numDec.className = "AUN-autopop-setup-action"; numDec.textContent = "\u2212";
  const numInput = document.createElement("input");
  numInput.type = "text"; numInput.inputMode = "numeric";
  const numInc = document.createElement("button");
  numInc.type = "button"; numInc.className = "AUN-autopop-setup-action"; numInc.textContent = "+";

  const setVisibleRows = (value) => {
    const n = refs.node; if (!n) return;
    const next = Math.max(1, Math.min(MAX_ROWS, Math.floor(Number(value) || 5)));
    refs.numRows = next;
    numInput.value = String(next);
    const w = getWidget(n, "visible_rows");
    if (w) w.value = next;
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(n);
  };
  numDec.addEventListener("click", () => setVisibleRows(refs.numRows - 1));
  numInc.addEventListener("click", () => setVisibleRows(refs.numRows + 1));
  numInput.addEventListener("change", () => setVisibleRows(numInput.value));
  stepper.append(numDec, numInput, numInc);

  const captureRowSelect = document.createElement("select");
  captureRowSelect.className = "AUN-autopop-setup-select";
  captureRowSelect.title = "Target row for Capture";

  const captureBtn = document.createElement("button");
  captureBtn.type = "button"; captureBtn.className = "AUN-autopop-setup-action";
  captureBtn.textContent = "\u2193 Capture"; captureBtn.title = "Capture from target";
  captureBtn.addEventListener("click", () => {
    const n = refs.node; if (!n) return;
    const wd = getWidgetData(n);
    const target = findTargetNode(n);
    if (!target) { setStatus(refs, "Target node not found."); return; }
    const count = getVisibleRows(n);
    const chosen = captureRowSelect.value;
    let row = 0;
    if (chosen && chosen !== "next") {
      row = parseInt(chosen, 10);
    }
    if (!row) {
      for (let i = 1; i <= count; i++) {
        const kw = getWidget(n, "keyword" + i);
        if (!kw?.value || !String(kw.value).trim()) { row = i; break; }
      }
      if (!row) {
        const vw = getWidget(n, "visible_rows");
        if (vw && vw.value < MAX_ROWS) { vw.value = Math.min(vw.value + 1, MAX_ROWS); row = vw.value; }
      }
    }
    if (!row) { setStatus(refs, "No empty row available — pick a row to overwrite."); return; }
    captureIntoRow(n, row, wd, target);
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(n);
    setStatus(refs, `Captured into row ${row}.`);
  });

  const clearAllBtn = document.createElement("button");
  clearAllBtn.type = "button"; clearAllBtn.className = "AUN-autopop-setup-action AUN-autopop-setup-action--danger";
  clearAllBtn.textContent = "Clear all";
  clearAllBtn.addEventListener("click", () => {
    const n = refs.node; if (!n) return;
    if (!window.confirm("Clear all preset rows? This cannot be undone.")) return;
    const count = getVisibleRows(n);
    for (let i = 1; i <= count; i++) {
      const kw = getWidget(n, "keyword" + i);
      if (kw) kw.value = "";
      for (let s = 1; s <= MAX_WIDGETS; s++) {
        const sw = getWidget(n, "slot" + i + "_" + s);
        if (sw) sw.value = "";
      }
    }
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(n);
    setStatus(refs, `Cleared all ${count} rows.`);
  });

  const exportBtn = document.createElement("button");
  exportBtn.type = "button"; exportBtn.className = "AUN-autopop-setup-action";
  exportBtn.textContent = "Export JSON";
  exportBtn.addEventListener("click", async () => {
    const n = refs.node; if (!n) return;
    const json = buildExportJSON(n);
    const ok = await copyText(json);
    setStatus(refs, ok ? "Exported and copied to clipboard." : "Exported (clipboard unavailable).");
  });

  const importBtn = document.createElement("button");
  importBtn.type = "button"; importBtn.className = "AUN-autopop-setup-action";
  importBtn.textContent = "Import JSON";
  importBtn.addEventListener("click", async () => {
    const n = refs.node; if (!n) return;
    const raw = await readClipboard();
    if (!raw?.trim()) { setStatus(refs, "Clipboard is empty."); return; }
    const msg = applyImportJSON(n, raw);
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(n);
    setStatus(refs, msg);
  });

  const status = document.createElement("span");
  status.className = "AUN-autopop-setup-status";

  toolbar.append(toolbarLabel, stepper, captureRowSelect, captureBtn, clearAllBtn, exportBtn, importBtn, status);

  // Body
  const body = document.createElement("div");
  body.className = "AUN-autopop-setup-body";

  // Footer
  const footer = document.createElement("div");
  footer.className = "AUN-autopop-setup-footer";
  const doneButton = document.createElement("button");
  doneButton.type = "button"; doneButton.className = "AUN-autopop-setup-action";
  doneButton.textContent = "Done";
  footer.appendChild(doneButton);

  dialog.append(header, toolbar, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const refs = {
    overlay, subtitle, numInput, numDec, numInc, captureRowSelect, status, body, closeButton,
    node: null, options: null, numRows: 5, clipboard: null, rowCards: [],
  };

  function closeModal() {
    refs.overlay.style.display = "none";
    document.body.classList.remove("AUN-autopop-setup-open");
    refs.options?.onChanged?.(refs.node);
  }

  closeButton.addEventListener("click", closeModal);
  doneButton.addEventListener("click", closeModal);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && refs.overlay.style.display === "flex") closeModal();
  });

  window[MODAL_KEY] = refs;
  return refs;
}

// ── Capture / Overwrite ────────────────────────────────────────────

function captureIntoRow(node, row, widgetData, target) {
  for (let s = 0; s < widgetData.length; s++) {
    const wd = widgetData[s];
    const tw = target.widgets?.find(w => w.name === wd.name);
    const rowKey = "row" + row;
    const rowMap = node?.__aun_slotMapping?.[rowKey] || {};
    const slotIndex = rowMap[wd.name];
    if (slotIndex != null && tw) {
      const sw = getWidget(node, "slot" + row + "_" + slotIndex);
      if (sw) sw.value = String(tw.value ?? "");
    }
  }
}

function captureOverwriteRow(node, row, widgetData) {
  const target = findTargetNode(node);
  if (!target) return false;
  captureIntoRow(node, row, widgetData, target);
  return true;
}

function deleteRowShift(node, row) {
  const count = getVisibleRows(node);
  if (row < 1 || row > count) return;
  for (let i = row; i < count; i++) {
    const kw = getWidget(node, "keyword" + i);
    const kwNext = getWidget(node, "keyword" + (i + 1));
    if (kw && kwNext) kw.value = kwNext.value;
    for (let s = 1; s <= MAX_WIDGETS; s++) {
      const w = getWidget(node, "slot" + i + "_" + s);
      const wNext = getWidget(node, "slot" + (i + 1) + "_" + s);
      if (w && wNext) w.value = wNext.value;
    }
  }
  const kwL = getWidget(node, "keyword" + count);
  if (kwL) kwL.value = "";
  for (let s = 1; s <= MAX_WIDGETS; s++) {
    const wL = getWidget(node, "slot" + count + "_" + s);
    if (wL) wL.value = "";
  }
}

// ── Export / Import ────────────────────────────────────────────────

function buildExportJSON(node) {
  const widgetData = getActiveWidgetData(node);
  const count = getVisibleRows(node);
  const rows = [];
  for (let i = 1; i <= count; i++) {
    const kwW = getWidget(node, "keyword" + i);
    const kw = kwW?.value ? String(kwW.value).trim() : "";
    const values = readRowValues(node, i, widgetData);
    const hasAny = kw || Object.values(values).some(v => v && String(v).trim());
    if (!hasAny) continue;
    rows.push({ keyword: kw, values });
  }
  const payload = {
    target_id: String(getWidget(node, "node_identifier")?.value ?? ""),
    widget_data: widgetData,
    presets: rows,
  };
  return JSON.stringify(payload, null, 2);
}

function applyImportJSON(node, raw) {
  let payload;
  try { payload = JSON.parse(raw); } catch { return "Invalid JSON."; }
  if (!payload?.presets?.length) return "No presets found in JSON.";
  if (payload.widget_data?.length) {
    node.__aun_widgetDataJSON = JSON.stringify(payload.widget_data);
  }
  const wd = payload.widget_data || getWidgetData(node);
  let row = 1;
  for (const preset of payload.presets) {
    if (row > MAX_ROWS) break;
    const kwW = getWidget(node, "keyword" + row);
    if (kwW) kwW.value = preset.keyword || "";
    const values = preset.values || {};
    const rowKey = "row" + row;
    const rowMap = node?.__aun_slotMapping?.[rowKey] || {};
    for (const wdEntry of wd) {
      const slotIndex = rowMap[wdEntry.name];
      if (slotIndex == null) continue;
      const sw = getWidget(node, "slot" + row + "_" + slotIndex);
      const val = values[wdEntry.name];
      if (sw && val !== undefined) sw.value = String(val);
    }
    row++;
  }
  const vw = getWidget(node, "visible_rows");
  if (vw && vw.value < row - 1) vw.value = row - 1;
  return `Imported ${Math.min(payload.presets.length, MAX_ROWS)} presets.`;
}

// ── Render ─────────────────────────────────────────────────────────

function setStatus(refs, text) {
  if (refs.status) refs.status.textContent = text || "";
}

function renderToolbar(refs) {
  refs.numInput.value = String(refs.numRows);
  const node = refs.node;
  const wd = node ? getActiveWidgetData(node) : [];
  const allWd = node ? getWidgetData(node) : [];
  const titleText = node?.title || node?.comfyClass || "Auto-Populate Presets";
  const wLabel = wd.length === allWd.length
    ? `${wd.length} widgets per row`
    : `${wd.length} of ${allWd.length} widgets per row`;
  refs.subtitle.textContent = `${titleText} \u2014 ${refs.numRows} rows \u00b7 ${wLabel}. Changes apply immediately.`;
  // Rebuild capture-target select
  const prev = refs.captureRowSelect.value || "next";
  refs.captureRowSelect.replaceChildren();
  const optNext = document.createElement("option");
  optNext.value = "next"; optNext.textContent = "(next empty row)";
  refs.captureRowSelect.appendChild(optNext);
  for (let i = 1; i <= refs.numRows; i++) {
    const opt = document.createElement("option");
    opt.value = String(i); opt.textContent = `Row ${i}`;
    refs.captureRowSelect.appendChild(opt);
  }
  const validValues = ["next", ...Array.from({ length: refs.numRows }, (_, i) => String(i + 1))];
  refs.captureRowSelect.value = validValues.includes(prev) ? prev : "next";
}

function buildTypedInput(wd, value) {
  if (wd.options && Array.isArray(wd.options) && wd.options.length > 0) {
    const sel = document.createElement("select");
    for (const opt of wd.options) {
      const o = document.createElement("option");
      o.value = String(opt); o.textContent = String(opt);
      if (String(opt) === String(value)) o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  }
  if (wd.type === "INT") {
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "1";
    inp.value = value ?? "";
    return inp;
  }
  if (wd.type === "FLOAT") {
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "0.05";
    inp.value = value ?? "";
    return inp;
  }
  if (wd.type === "BOOLEAN") {
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.checked = value === true || value === "true" || value === "True";
    return inp;
  }
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = value ?? "";
  return inp;
}

function renderRows(refs) {
  refs.body.replaceChildren();
  refs.rowCards = [];
  const node = refs.node;
  if (!node) return;
  const widgetData = getActiveWidgetData(node);
  if (!widgetData.length) {
    const empty = document.createElement("div");
    empty.className = "AUN-autopop-setup-empty";
    const allData = getWidgetData(node);
    if (allData.length > 0) {
      empty.textContent = "No widgets active. Open the Widgets dialog to select widgets.";
    } else {
      empty.textContent = "Run the node once to scan a target.";
    }
    refs.body.appendChild(empty);
    return;
  }
  const count = getVisibleRows(node);
  for (let i = 1; i <= count; i++) {
    const card = buildRowCard(node, i, widgetData, refs);
    refs.body.appendChild(card.card);
    refs.rowCards.push(card);
  }
}

function buildRowCard(node, row, widgetData, refs) {
  const card = document.createElement("div");
  card.className = "AUN-autopop-setup-row";
  card.dataset.row = String(row);

  // Head
  const head = document.createElement("div");
  head.className = "AUN-autopop-setup-row-head";
  const num = document.createElement("span");
  num.className = "AUN-autopop-setup-row-num";
  num.textContent = `R${row}`;
  const kwInput = document.createElement("input");
  kwInput.type = "text"; kwInput.className = "AUN-autopop-setup-row-kw";
  kwInput.placeholder = "keyword";
  const kwW = getWidget(node, "keyword" + row);
  kwInput.value = kwW?.value ? String(kwW.value) : "";
  kwInput.addEventListener("change", () => {
    if (kwW) kwW.value = kwInput.value;
    refs.options?.onChanged?.(node);
  });
  const actions = document.createElement("span");
  actions.className = "AUN-autopop-setup-row-actions";

  // Capture here (overwrite)
  const capBtn = document.createElement("button");
  capBtn.type = "button"; capBtn.className = "AUN-autopop-setup-icon-btn";
  capBtn.textContent = "\u2193"; capBtn.title = "Capture target values into this row";
  capBtn.addEventListener("click", () => {
    captureOverwriteRow(node, row, widgetData);
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(node);
    setStatus(refs, `Captured into row ${row}.`);
  });

  // Copy
  const copyBtn = document.createElement("button");
  copyBtn.type = "button"; copyBtn.className = "AUN-autopop-setup-icon-btn";
  copyBtn.textContent = "\u29c9"; copyBtn.title = `Copy row ${row}`;
  copyBtn.addEventListener("click", () => {
    refs.clipboard = readRowValues(node, row, widgetData);
    refs.clipboard._keyword = kwInput.value;
    for (const c of refs.rowCards) c.pasteBtn.classList.remove("is-disabled");
    setStatus(refs, `Copied row ${row}.`);
  });

  // Paste
  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button"; pasteBtn.className = "AUN-autopop-setup-icon-btn";
  pasteBtn.textContent = "\u290d"; pasteBtn.title = `Paste into row ${row}`;
  pasteBtn.addEventListener("click", () => {
    if (!refs.clipboard) { setStatus(refs, "Nothing copied yet."); return; }
    const vals = { ...refs.clipboard };
    delete vals._keyword;
    writeRowValues(node, row, widgetData, vals);
    if (kwW) kwW.value = refs.clipboard._keyword || "";
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(node);
    setStatus(refs, `Pasted into row ${row}.`);
  });

  // Delete
  const delBtn = document.createElement("button");
  delBtn.type = "button"; delBtn.className = "AUN-autopop-setup-icon-btn is-danger";
  delBtn.textContent = "\u2715"; delBtn.title = `Delete row ${row}`;
  delBtn.addEventListener("click", () => {
    if (!window.confirm(`Delete row ${row}? All rows below will shift up.`)) return;
    deleteRowShift(node, row);
    const vw = getWidget(node, "visible_rows");
    if (vw && getVisibleRows(node) > 1) {
      vw.value = Math.max(1, getVisibleRows(node) - 1);
    }
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(node);
    setStatus(refs, `Deleted row ${row}.`);
  });

  actions.append(capBtn, copyBtn, pasteBtn, delBtn);
  head.append(num, kwInput, actions);

  // Fields
  const fields = document.createElement("div");
  fields.className = "AUN-autopop-setup-fields";
  for (const wd of widgetData) {
    const slotKey = "row" + row;
    const rowMap = node?.__aun_slotMapping?.[slotKey] || {};
    const slotIndex = rowMap[wd.name];
    const sw = slotIndex != null ? getWidget(node, "slot" + row + "_" + slotIndex) : null;
    const val = sw?.value ?? "";

    const field = document.createElement("div");
    field.className = "AUN-autopop-setup-field";
    const label = document.createElement("span");
    label.className = "AUN-autopop-setup-field-label";
    label.textContent = wd.name;
    label.title = wd.name;
    const input = buildTypedInput(wd, val);
    input.addEventListener("change", () => {
      const newVal = input.type === "checkbox" ? String(input.checked) : input.value;
      if (sw) sw.value = newVal;
      refs.options?.onChanged?.(node);
    });
    if (input.tagName === "SELECT") {
      input.addEventListener("change", () => {
        if (sw) sw.value = input.value;
        refs.options?.onChanged?.(node);
      });
    }
    field.append(label, input);
    fields.appendChild(field);
  }

  card.append(head, fields);
  return { row, card, kwInput, pasteBtn };
}

// ── Open ───────────────────────────────────────────────────────────

export function openPresetSetupDialog(node, options = {}) {
  if (!node) return;
  const refs = ensureModal();
  refs.node = node;
  refs.options = options;
  refs.numRows = getVisibleRows(node);
  renderToolbar(refs);
  renderRows(refs);
  setStatus(refs, "");
  refs.overlay.style.display = "flex";
  document.body.classList.add("AUN-autopop-setup-open");
}
