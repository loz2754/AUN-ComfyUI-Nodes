// ── Preset Manager – Setup Dialog ───────────────────────────────────
// Modal editor for AUNPresetManager. Reads the target node's widgets live
// from the graph to build typed fields, and stores preset rows as JSON in
// the node's hidden preset_data widget (persists with the workflow).
// ────────────────────────────────────────────────────────────────────

import { app } from "../../scripts/app.js";
import { findNodeByIdentifier, getWidget } from "./index.js";

const MAX_ROWS = 20;
const STYLE_KEY = "__AUN_pm_setupStyle";
const MODAL_KEY = "__AUN_pm_setupRefs";

// ── Helpers ────────────────────────────────────────────────────────

function getVisibleRows(node) {
  const w = getWidget(node, "visible_rows");
  const val = w?.value;
  return Number.isFinite(val) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(val))) : 5;
}

function findTargetNode(node) {
  const ident = String(getWidget(node, "node_identifier")?.value ?? "").trim();
  if (!ident) return null;
  return findNodeByIdentifier(node.graph || app?.graph, ident, node);
}

function getTargetWidgets(node) {
  const target = findTargetNode(node);
  if (!target) return [];
  const out = [];
  for (const w of target.widgets || []) {
    const name = w?.name;
    if (!name || w.type === "button") continue;
    out.push(w);
  }
  return out;
}

function getPresetData(node) {
  const raw = String(getWidget(node, "preset_data")?.value ?? "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  return { widgets: null, rows: [] };
}

function setPresetData(node, data) {
  const w = getWidget(node, "preset_data");
  if (w) w.value = JSON.stringify(data);
}

function getIncluded(data, schemaNames) {
  if (!Array.isArray(data.widgets)) return schemaNames.slice();
  return data.widgets.filter((n) => schemaNames.includes(n));
}

function rowIsEmpty(row) {
  const kw = String(row?.keyword ?? "").trim();
  if (kw) return false;
  const values = row?.values;
  if (!values || typeof values !== "object") return true;
  return !Object.values(values).some((v) => v !== "" && v != null);
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
    .AUN-pm-setup-open .litegraph.litecanvas { pointer-events: none !important; }
    .AUN-pm-setup-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); font-family: system-ui, sans-serif;
    }
    .AUN-pm-setup-dialog {
      background: #1e1e2e; color: #cdd6f4; border-radius: 10px;
      width: min(96vw, 760px); max-height: 92vh; display: flex;
      flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .AUN-pm-setup-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-pm-setup-title { font-size: 15px; font-weight: 700; margin: 0; }
    .AUN-pm-setup-subtitle { font-size: 11px; color: rgba(205,214,244,0.55); margin-top: 2px; }
    .AUN-pm-setup-close {
      background: none; border: none; color: rgba(205,214,244,0.5);
      font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
    }
    .AUN-pm-setup-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .AUN-pm-setup-toolbar {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      padding: 10px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-pm-setup-toolbar-label { font-size: 12px; color: rgba(205,214,244,0.7); margin-right: 2px; }
    .AUN-pm-setup-stepper { display: inline-flex; align-items: center; gap: 2px; }
    .AUN-pm-setup-stepper input {
      width: 36px; text-align: center; background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
      color: #cdd6f4; font-size: 12px; padding: 2px 0;
    }
    .AUN-pm-setup-action {
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
      color: #cdd6f4; font-size: 11px; padding: 3px 10px; border-radius: 4px;
      cursor: pointer; white-space: nowrap;
    }
    .AUN-pm-setup-action:hover { background: rgba(255,255,255,0.14); }
    .AUN-pm-setup-action--danger { border-color: rgba(243,139,168,0.3); }
    .AUN-pm-setup-action--danger:hover { background: rgba(243,139,168,0.18); color: #f38ba8; }
    .AUN-pm-setup-select {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px; color: #cdd6f4; font-size: 11px; padding: 2px 4px;
      cursor: pointer; max-width: 140px;
    }
    .AUN-pm-setup-status { font-size: 11px; color: rgba(205,214,244,0.5); margin-left: auto; }
    .AUN-pm-setup-chips {
      display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
      padding: 8px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-pm-setup-chips-label { font-size: 11px; color: rgba(205,214,244,0.5); margin-right: 4px; }
    .AUN-pm-setup-chip {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px; color: rgba(205,214,244,0.65); font-size: 10px;
      padding: 1px 8px; cursor: pointer; white-space: nowrap;
    }
    .AUN-pm-setup-chip:hover { background: rgba(255,255,255,0.12); }
    .AUN-pm-setup-chip.off { opacity: 0.35; text-decoration: line-through; }
    .AUN-pm-setup-filter {
      margin-left: auto; background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 4px;
      color: #cdd6f4; font-size: 11px; padding: 3px 8px; width: 150px;
    }
    .AUN-pm-setup-filter::placeholder { color: rgba(205,214,244,0.3); }
    .AUN-pm-setup-body {
      flex: 1; overflow-y: auto; padding: 10px 18px; display: flex;
      flex-direction: column; gap: 8px; min-height: 0;
    }
    .AUN-pm-setup-row {
      background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px; overflow: hidden;
    }
    .AUN-pm-setup-row-head {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px 6px;
    }
    .AUN-pm-setup-row-num {
      font-size: 11px; font-weight: 700; color: rgba(205,214,244,0.45);
      min-width: 22px; text-align: center;
    }
    .AUN-pm-setup-row-kw {
      flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px; color: #cdd6f4; font-size: 12px; padding: 3px 8px;
    }
    .AUN-pm-setup-row-kw::placeholder { color: rgba(205,214,244,0.3); }
    .AUN-pm-setup-row-actions { display: flex; gap: 3px; }
    .AUN-pm-setup-icon-btn {
      background: none; border: 1px solid rgba(255,255,255,0.08); color: rgba(205,214,244,0.5);
      font-size: 13px; width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .AUN-pm-setup-icon-btn:hover { background: rgba(255,255,255,0.1); color: #cdd6f4; }
    .AUN-pm-setup-icon-btn.is-danger:hover { color: #f38ba8; border-color: rgba(243,139,168,0.3); }
    .AUN-pm-setup-fields {
      display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 10px 10px;
    }
    .AUN-pm-setup-field {
      display: flex; flex-direction: column; gap: 2px; min-width: 100px; flex: 1 1 100px; max-width: 200px;
    }
    .AUN-pm-setup-field-label {
      font-size: 10px; color: rgba(205,214,244,0.45); overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .AUN-pm-setup-field input, .AUN-pm-setup-field select, .AUN-pm-setup-field textarea {
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 4px; color: #cdd6f4; font-size: 12px; padding: 2px 6px;
    }
    .AUN-pm-setup-field input[type="checkbox"] {
      width: auto; accent-color: #89b4fa; margin-top: 2px;
    }
    .AUN-pm-setup-footer {
      display: flex; justify-content: flex-end; padding: 10px 18px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .AUN-pm-setup-footer .AUN-pm-setup-action { padding: 5px 20px; font-size: 12px; }
    .AUN-pm-setup-empty {
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
  overlay.className = "AUN-pm-setup-overlay";

  const dialog = document.createElement("div");
  dialog.className = "AUN-pm-setup-dialog";

  // Header
  const header = document.createElement("div");
  header.className = "AUN-pm-setup-header";
  const heading = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "AUN-pm-setup-title";
  title.textContent = "Preset Setup";
  const subtitle = document.createElement("div");
  subtitle.className = "AUN-pm-setup-subtitle";
  heading.append(title, subtitle);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "AUN-pm-setup-close";
  closeButton.textContent = "\u00d7";
  header.append(heading, closeButton);

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "AUN-pm-setup-toolbar";
  const toolbarLabel = document.createElement("span");
  toolbarLabel.className = "AUN-pm-setup-toolbar-label";
  toolbarLabel.textContent = "Rows:";

  const stepper = document.createElement("span");
  stepper.className = "AUN-pm-setup-stepper";
  const numDec = document.createElement("button");
  numDec.type = "button"; numDec.className = "AUN-pm-setup-action"; numDec.textContent = "\u2212";
  const numInput = document.createElement("input");
  numInput.type = "text"; numInput.inputMode = "numeric";
  const numInc = document.createElement("button");
  numInc.type = "button"; numInc.className = "AUN-pm-setup-action"; numInc.textContent = "+";
  stepper.append(numDec, numInput, numInc);

  const captureRowSelect = document.createElement("select");
  captureRowSelect.className = "AUN-pm-setup-select";
  captureRowSelect.title = "Target row for Capture";

  const captureBtn = document.createElement("button");
  captureBtn.type = "button"; captureBtn.className = "AUN-pm-setup-action";
  captureBtn.textContent = "\u2193 Capture"; captureBtn.title = "Capture from target";

  const clearAllBtn = document.createElement("button");
  clearAllBtn.type = "button"; clearAllBtn.className = "AUN-pm-setup-action AUN-pm-setup-action--danger";
  clearAllBtn.textContent = "Clear all";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button"; exportBtn.className = "AUN-pm-setup-action";
  exportBtn.textContent = "Export JSON";

  const importBtn = document.createElement("button");
  importBtn.type = "button"; importBtn.className = "AUN-pm-setup-action";
  importBtn.textContent = "Import JSON";

  const status = document.createElement("span");
  status.className = "AUN-pm-setup-status";

  toolbar.append(toolbarLabel, stepper, captureRowSelect, captureBtn, clearAllBtn, exportBtn, importBtn, status);

  // Widget filter chips
  const chips = document.createElement("div");
  chips.className = "AUN-pm-setup-chips";
  const chipsLabel = document.createElement("span");
  chipsLabel.className = "AUN-pm-setup-chips-label";
  chipsLabel.textContent = "Widgets:";
  chips.appendChild(chipsLabel);

  // Body
  const body = document.createElement("div");
  body.className = "AUN-pm-setup-body";

  // Footer
  const footer = document.createElement("div");
  footer.className = "AUN-pm-setup-footer";
  const doneButton = document.createElement("button");
  doneButton.type = "button"; doneButton.className = "AUN-pm-setup-action";
  doneButton.textContent = "Done";
  footer.appendChild(doneButton);

  dialog.append(header, toolbar, chips, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const refs = {
    overlay, subtitle, numInput, numDec, numInc, captureRowSelect, status,
    chips, body, closeButton, node: null, options: null, numRows: 5,
    clipboard: null, schema: [], included: [], filter: "",
  };

  // Widget search filter (persistent element, re-appended when chips rebuild).
  const filterInput = document.createElement("input");
  filterInput.type = "text";
  filterInput.className = "AUN-pm-setup-filter";
  filterInput.placeholder = "Filter widgets\u2026";
  filterInput.title = "Show only fields whose widget name contains this text.";
  filterInput.addEventListener("input", () => {
    refs.filter = filterInput.value.trim().toLowerCase();
    renderRows(refs);
  });
  refs.filterInput = filterInput;

  function closeModal() {
    refs.overlay.style.display = "none";
    document.body.classList.remove("AUN-pm-setup-open");
    refs.options?.onChanged?.(refs.node);
  }

  closeButton.addEventListener("click", closeModal);
  doneButton.addEventListener("click", closeModal);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && refs.overlay.style.display === "flex") closeModal();
  });

  window[MODAL_KEY] = refs;

  // ── Event wiring ─────────────────────────────────────────────────

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

  captureBtn.addEventListener("click", () => {
    const n = refs.node; if (!n) return;
    const target = findTargetNode(n);
    if (!target) { setStatus(refs, "Target node not found."); return; }
    const chosen = captureRowSelect.value;
    let row = 0;
    if (chosen && chosen !== "next") row = parseInt(chosen, 10);
    if (!row) {
      const data = getPresetData(n);
      for (let i = 1; i <= refs.numRows; i++) {
        if (rowIsEmpty(data.rows?.[i - 1])) { row = i; break; }
      }
      if (!row) {
        const vw = getWidget(n, "visible_rows");
        if (vw && vw.value < MAX_ROWS) { vw.value = Math.min(vw.value + 1, MAX_ROWS); row = vw.value; refs.numRows = vw.value; }
      }
    }
    if (!row) { setStatus(refs, "No empty row available — pick a row to overwrite."); return; }
    captureIntoRow(n, row);
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(n);
    setStatus(refs, `Captured into row ${row}.`);
  });

  clearAllBtn.addEventListener("click", () => {
    const n = refs.node; if (!n) return;
    if (!window.confirm("Clear all preset rows? This cannot be undone.")) return;
    const data = getPresetData(n);
    data.rows = [];
    setPresetData(n, data);
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(n);
    setStatus(refs, "Cleared all rows.");
  });

  exportBtn.addEventListener("click", async () => {
    const n = refs.node; if (!n) return;
    const data = getPresetData(n);
    const payload = {
      target_id: String(getWidget(n, "node_identifier")?.value ?? ""),
      widgets: getIncluded(data, refs.schema.map((w) => w.name)),
      rows: data.rows || [],
    };
    const ok = await copyText(JSON.stringify(payload, null, 2));
    setStatus(refs, ok ? "Exported and copied to clipboard." : "Exported (clipboard unavailable).");
  });

  importBtn.addEventListener("click", async () => {
    const n = refs.node; if (!n) return;
    const raw = await readClipboard();
    if (!raw?.trim()) { setStatus(refs, "Clipboard is empty."); return; }
    let payload;
    try { payload = JSON.parse(raw); } catch { setStatus(refs, "Invalid JSON."); return; }
    if (!Array.isArray(payload?.rows)) { setStatus(refs, "No rows found in JSON."); return; }
    const data = getPresetData(n);
    if (Array.isArray(payload.widgets)) {
      data.widgets = payload.widgets.filter((name) => refs.schema.some((w) => w.name === name));
    }
    data.rows = payload.rows.slice(0, MAX_ROWS);
    setPresetData(n, data);
    const vw = getWidget(n, "visible_rows");
    if (vw && vw.value < data.rows.length) vw.value = data.rows.length;
    refs.numRows = getVisibleRows(n);
    renderRows(refs); renderToolbar(refs);
    refs.options?.onChanged?.(n);
    setStatus(refs, `Imported ${data.rows.length} presets.`);
  });

  return refs;
}

// ── Capture ────────────────────────────────────────────────────────

function captureIntoRow(node, row) {
  const target = findTargetNode(node);
  if (!target) return;
  const data = getPresetData(node);
  const rows = data.rows || (data.rows = []);
  while (rows.length < row) rows.push({ keyword: "", values: {} });
  const entry = rows[row - 1] || (rows[row - 1] = { keyword: "", values: {} });
  entry.values = entry.values || {};
  for (const name of refsIncluded(node, data)) {
    const tw = target.widgets?.find((w) => w.name === name);
    entry.values[name] = tw ? tw.value : (entry.values[name] ?? "");
  }
  setPresetData(node, data);
}

function refsIncluded(node, data) {
  // Included list is kept in modal refs during a session; recompute here.
  const schema = getTargetWidgets(node).map((w) => w.name);
  return getIncluded(data, schema);
}

// ── Export / import of row values ──────────────────────────────────

function deleteRowShift(node, row) {
  const data = getPresetData(node);
  const rows = data.rows || [];
  rows.splice(row - 1, 1);
  setPresetData(node, data);
}

// ── Rendering ──────────────────────────────────────────────────────

function setStatus(refs, text) {
  if (refs.status) refs.status.textContent = text || "";
}

function renderToolbar(refs) {
  refs.numInput.value = String(refs.numRows);
  const node = refs.node;
  const schema = node ? getTargetWidgets(node) : [];
  const data = node ? getPresetData(node) : { widgets: null };
  const included = node ? getIncluded(data, schema.map((w) => w.name)) : [];
  const target = node ? findTargetNode(node) : null;
  const titleText = target?.title || target?.comfyClass || "Preset Manager";
  const filter = refs.filter || "";
  const visible = filter
    ? included.filter((n) => n.toLowerCase().includes(filter)).length
    : included.length;
  const wLabel = schema.length
    ? `${visible} of ${schema.length} widgets${filter ? ` (filter: "${refs.filter}")` : ""} per row`
    : "no widgets scanned";
  refs.subtitle.textContent = `${titleText} \u2014 ${refs.numRows} rows \u00b7 ${wLabel}. Changes apply immediately.`;

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

function renderChips(refs) {
  refs.chips.replaceChildren();
  const chipsLabel = document.createElement("span");
  chipsLabel.className = "AUN-pm-setup-chips-label";
  chipsLabel.textContent = "Widgets:";
  refs.chips.appendChild(chipsLabel);

  const node = refs.node;
  if (!node) return;
  const data = getPresetData(node);
  const includedSet = new Set(refs.included);

  const allBtn = document.createElement("button");
  allBtn.type = "button"; allBtn.className = "AUN-pm-setup-action";
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    const d = getPresetData(node);
    d.widgets = refs.schema.map((w) => w.name);
    setPresetData(node, d);
    refresh(refs);
  });
  const noneBtn = document.createElement("button");
  noneBtn.type = "button"; noneBtn.className = "AUN-pm-setup-action";
  noneBtn.textContent = "None";
  noneBtn.addEventListener("click", () => {
    const d = getPresetData(node);
    d.widgets = [];
    setPresetData(node, d);
    refresh(refs);
  });
  refs.chips.append(allBtn, noneBtn);

  for (const w of refs.schema) {
    const chip = document.createElement("span");
    chip.className = "AUN-pm-setup-chip" + (includedSet.has(w.name) ? "" : " off");
    chip.textContent = w.name;
    chip.title = `Toggle ${w.name}`;
    chip.addEventListener("click", () => {
      const d = getPresetData(node);
      const names = getIncluded(d, refs.schema.map((x) => x.name));
      const set = new Set(names);
      if (set.has(w.name)) set.delete(w.name); else set.add(w.name);
      d.widgets = [...set];
      setPresetData(node, d);
      refresh(refs);
    });
    refs.chips.appendChild(chip);
  }
  if (refs.filterInput) refs.chips.appendChild(refs.filterInput);
}

function buildTypedInput(wd, value) {
  if (wd.type === "combo") {
    const sel = document.createElement("select");
    let options = wd.options?.values;
    if (Array.isArray(options)) {
      for (const opt of options) {
        const o = document.createElement("option");
        const ov = opt && typeof opt === "object" ? (opt.value ?? opt.content ?? "") : opt;
        o.value = String(ov); o.textContent = String(ov);
        if (String(ov) === String(value)) o.selected = true;
        sel.appendChild(o);
      }
    } else {
      const o = document.createElement("option");
      o.value = String(value ?? ""); o.textContent = String(value ?? "");
      o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  }
  if (wd.type === "number" || wd.type === "slider") {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = wd.options?.step != null ? String(wd.options.step) : (wd.options?.precision === 0 ? "1" : "0.05");
    inp.value = value ?? "";
    return inp;
  }
  if (wd.type === "toggle" || wd.type === "boolean") {
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.checked = value === true || value === "true" || value === "True";
    return inp;
  }
  if (wd.options?.multiline) {
    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.value = value ?? "";
    return ta;
  }
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = value ?? "";
  return inp;
}

function inputToValue(input) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number") {
    const raw = input.value;
    if (raw === "") return "";
    const num = Number(raw);
    return Number.isFinite(num) ? num : raw;
  }
  return input.value;
}

function renderRows(refs) {
  refs.body.replaceChildren();
  const node = refs.node;
  if (!node) return;
  if (!refs.schema.length) {
    const empty = document.createElement("div");
    empty.className = "AUN-pm-setup-empty";
    empty.textContent = "Target node not found. Set node_identifier to the target's numeric ID or title (show node IDs from the Manager menu), or move the target into this workflow.";
    refs.body.appendChild(empty);
    return;
  }
  const data = getPresetData(node);
  const rows = data.rows || [];
  for (let i = 1; i <= refs.numRows; i++) {
    const card = buildRowCard(node, i, rows[i - 1] || { keyword: "", values: {} }, refs);
    refs.body.appendChild(card.card);
    refs.rowCards.push(card);
  }
}

function buildRowCard(node, row, entry, refs) {
  const card = document.createElement("div");
  card.className = "AUN-pm-setup-row";
  card.dataset.row = String(row);

  const save = () => {
    const data = getPresetData(node);
    const rows = data.rows || (data.rows = []);
    while (rows.length < row) rows.push({ keyword: "", values: {} });
    rows[row - 1] = entry;
    // Trim trailing empty rows.
    while (rows.length && rowIsEmpty(rows[rows.length - 1])) rows.pop();
    setPresetData(node, data);
    refs.options?.onChanged?.(node);
  };

  // Head
  const head = document.createElement("div");
  head.className = "AUN-pm-setup-row-head";
  const num = document.createElement("span");
  num.className = "AUN-pm-setup-row-num";
  num.textContent = `R${row}`;
  const kwInput = document.createElement("input");
  kwInput.type = "text"; kwInput.className = "AUN-pm-setup-row-kw";
  kwInput.placeholder = "keyword (comma-separated synonyms)";
  kwInput.value = entry.keyword ?? "";
  kwInput.addEventListener("change", () => { entry.keyword = kwInput.value; save(); });
  const actions = document.createElement("span");
  actions.className = "AUN-pm-setup-row-actions";

  // Capture here (overwrite)
  const capBtn = document.createElement("button");
  capBtn.type = "button"; capBtn.className = "AUN-pm-setup-icon-btn";
  capBtn.textContent = "\u2193"; capBtn.title = "Capture target values into this row";
  capBtn.addEventListener("click", () => {
    captureIntoRow(node, row);
    refresh(refs);
    setStatus(refs, `Captured into row ${row}.`);
  });

  // Copy
  const copyBtn = document.createElement("button");
  copyBtn.type = "button"; copyBtn.className = "AUN-pm-setup-icon-btn";
  copyBtn.textContent = "\u29c9"; copyBtn.title = `Copy row ${row}`;
  copyBtn.addEventListener("click", () => {
    refs.clipboard = { keyword: entry.keyword ?? "", values: { ...(entry.values || {}) } };
    setStatus(refs, `Copied row ${row}.`);
  });

  // Paste
  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button"; pasteBtn.className = "AUN-pm-setup-icon-btn";
  pasteBtn.textContent = "\u290d"; pasteBtn.title = `Paste into row ${row}`;
  pasteBtn.addEventListener("click", () => {
    if (!refs.clipboard) { setStatus(refs, "Nothing copied yet."); return; }
    entry.keyword = refs.clipboard.keyword ?? "";
    entry.values = { ...(refs.clipboard.values || {}) };
    save();
    refresh(refs);
    setStatus(refs, `Pasted into row ${row}.`);
  });

  // Delete
  const delBtn = document.createElement("button");
  delBtn.type = "button"; delBtn.className = "AUN-pm-setup-icon-btn is-danger";
  delBtn.textContent = "\u2715"; delBtn.title = `Delete row ${row} (rows below shift up)`;
  delBtn.addEventListener("click", () => {
    if (!window.confirm(`Delete row ${row}?`)) return;
    deleteRowShift(node, row);
    const vw = getWidget(node, "visible_rows");
    if (vw && getVisibleRows(node) > 1) vw.value = Math.max(1, getVisibleRows(node) - 1);
    refs.numRows = getVisibleRows(node);
    refresh(refs);
    setStatus(refs, `Deleted row ${row}.`);
  });

  actions.append(capBtn, copyBtn, pasteBtn, delBtn);
  head.append(num, kwInput, actions);

  // Fields
  const fields = document.createElement("div");
  fields.className = "AUN-pm-setup-fields";
  const values = entry.values || (entry.values = {});
  const includedSet = new Set(refs.included);
  const filter = refs.filter || "";
  for (const wd of refs.schema) {
    if (!includedSet.has(wd.name)) continue;
    if (filter && !wd.name.toLowerCase().includes(filter)) continue;
    const field = document.createElement("div");
    field.className = "AUN-pm-setup-field";
    const label = document.createElement("span");
    label.className = "AUN-pm-setup-field-label";
    label.textContent = wd.name;
    label.title = wd.name;
    const input = buildTypedInput(wd, values[wd.name] ?? "");
    input.addEventListener("change", () => {
      values[wd.name] = inputToValue(input);
      save();
    });
    field.append(label, input);
    fields.appendChild(field);
  }
  if (!fields.childNodes.length) {
    const empty = document.createElement("div");
    empty.className = "AUN-pm-setup-empty";
    empty.style.padding = "10px";
    empty.textContent = filter
      ? "No widgets match the filter."
      : "No widgets included. Toggle widget chips above.";
    fields.appendChild(empty);
  }

  card.append(head, fields);
  return { row, card, kwInput, pasteBtn };
}

function refresh(refs) {
  const node = refs.node;
  if (!node) return;
  refs.schema = getTargetWidgets(node);
  const data = getPresetData(node);
  // Normalize: always keep an explicit widget list so the backend can
  // populate the manual output slots deterministically.
  if (!Array.isArray(data.widgets) && refs.schema.length) {
    data.widgets = refs.schema.map((w) => w.name);
    setPresetData(node, data);
  }
  refs.included = getIncluded(data, refs.schema.map((w) => w.name));
  refs.rowCards = [];
  renderChips(refs);
  renderToolbar(refs);
  renderRows(refs);
  refs.options?.onChanged?.(node);
}

// ── Open ───────────────────────────────────────────────────────────

export function openPresetSetupDialog(node, options = {}) {
  if (!node) return;
  const refs = ensureModal();
  refs.node = node;
  refs.options = options;
  refs.numRows = getVisibleRows(node);
  refs.clipboard = null;
  setStatus(refs, "");
  refresh(refs);
  refs.overlay.style.display = "flex";
  document.body.classList.add("AUN-pm-setup-open");
}

export function refreshPresetSetupDialog(node) {
  const refs = window[MODAL_KEY];
  if (!refs || refs.node !== node) return;
  if (refs.overlay?.style?.display !== "flex") return;
  refresh(refs);
}
