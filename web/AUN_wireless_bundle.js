/**
 * AUN Wireless Bundle — browser side.
 *
 * Packs named values into one bundle. A field is either wired into one of
 * the node's `in_N` inputs, or picked from another node's output in the
 * Sources… dialog and injected into a free `in_N` slot when the prompt is
 * built — so the canvas has no wire for it.
 *
 * The server only ever sees ordinary linked inputs:
 *
 *  - `names` (hidden widget): the field names, in bundle order;
 *  - `plan` (hidden widget): the slot feeding each name, or null when the
 *    field is switched off;
 *  - `in_N`: the values themselves.
 *
 * That one slot pool serves both kinds. Wired fields use the low slots
 * (kept contiguous, one spare socket always waiting), wireless fields use
 * the top slots, and the plan maps names to slots so reordering never has
 * to move a wire.
 *
 * Sources are limited to this graph: a node inside a subgraph cannot reach
 * an output from its parent without a subgraph input.
 */

import { app } from "../../scripts/app.js";
import {
  applyWidgetHiddenState,
  chainWidgetCallback,
  fitNodeSize,
  forceRedraw,
  getWidget,
} from "./index.js";
import {
  BUNDLE_TYPE,
  ConstantRefusal,
  applyGeneratedTitle,
  eachGraphLink,
  isNodeType,
  isOff,
  registerPromptPass,
  sourceOf,
  titleOf,
  walkPromptNodes,
} from "./aun_bundle_constants.js";
import {
  createDialog,
  dialogButton,
  dragGrip,
  emptyHint,
  enableDragReorder,
  sectionLabel,
} from "./aun_dialog_shared.js";

const NODE_TYPE = "AUNWirelessBundle";
const FIELDS_PROP = "aun_bundle_fields";
const TITLE_PROP = "aun_bundle_title";   // the title to put back
const NAMES_WIDGET = "names";
const PLAN_WIDGET = "plan";
const SET_WIDGET = "set";
const BUTTON_WIDGET = "__aun_sources_button";
const DIALOG_CLASS = "AUN-wireless-bundle-dialog";
const MAX_FIELDS = 32;                   // mirrors AUNWirelessBundle.MAX_FIELDS
const INPUT_RE = /^in_(\d+)$/;

let NODE_DISPLAY = "Wireless Bundle";

// ── The saved field list ──────────────────────────────────────────────

/** The field rows, cleaned up: one object per field. */
function rawFields(node) {
  const saved = node?.properties?.[FIELDS_PROP];
  if (!Array.isArray(saved)) return [];
  const rows = [];
  for (const row of saved) {
    if (!row || typeof row !== "object") continue;
    rows.push({
      kind: row.kind === "wired" ? "wired" : "wireless",
      name: String(row.name ?? "").trim() || "field",
      enabled: row.enabled !== false,
      socket: Number.isInteger(row.socket) ? row.socket : null,
      sourceId: Number.isFinite(Number(row.sourceId))
        ? Number(row.sourceId) : null,
      sourceTitle: String(row.sourceTitle ?? ""),
      outputName: String(row.outputName ?? ""),
      outputIndex: Number.isInteger(row.outputIndex) ? row.outputIndex : 0,
    });
  }
  return rows;
}

function saveFields(node, rows) {
  (node.properties ??= {})[FIELDS_PROP] = rows.map((row) => ({
    kind: row.kind,
    name: row.name,
    enabled: row.enabled !== false,
    socket: row.kind === "wired" ? row.socket : undefined,
    sourceId: row.kind === "wireless" ? row.sourceId : undefined,
    sourceTitle: row.kind === "wireless" ? row.sourceTitle : undefined,
    outputName: row.kind === "wireless" ? row.outputName : undefined,
    outputIndex: row.kind === "wireless" ? row.outputIndex : undefined,
  }));
}

/** `base`, or `base_2`, `base_3`… — bundle names must be unique. */
function uniqueName(rows, base) {
  const clean = String(base ?? "").trim() || "field";
  const taken = new Set(rows.map((row) => row.name));
  if (!taken.has(clean)) return clean;
  let n = 2;
  while (taken.has(`${clean}_${n}`)) n += 1;
  return `${clean}_${n}`;
}

/** Force every name to be non-empty and unique. */
function normalizeNames(rows) {
  const seen = new Set();
  for (const row of rows) {
    const base = String(row.name ?? "").trim() || "field";
    let name = base;
    let n = 2;
    while (seen.has(name)) {
      name = `${base}_${n}`;
      n += 1;
    }
    seen.add(name);
    row.name = name;
  }
}

// ── Sockets ───────────────────────────────────────────────────────────

function wiredInputs(node) {
  return (node?.inputs ?? [])
    .map((input, index) => ({
      input,
      index,
      n: Number(INPUT_RE.exec(String(input?.name ?? ""))?.[1] ?? 0),
    }))
    .filter((entry) => entry.n > 0)
    .sort((a, b) => a.n - b.n);
}

function renameSockets(node) {
  wiredInputs(node).forEach((entry, index) => {
    const wanted = `in_${index + 1}`;
    if (entry.input.name !== wanted) entry.input.name = wanted;
  });
}

function ensureSockets(node, count) {
  let sockets = wiredInputs(node);
  while (sockets.length < count) {
    try {
      node.addInput(`in_${sockets.length + 1}`, "*");
    } catch (err) {
      break;
    }
    const next = wiredInputs(node);
    if (next.length <= sockets.length) break;
    sockets = next;
  }
}

/**
 * Make the wired rows match the sockets: a row exists exactly while its
 * socket carries a link, one empty spare socket is kept at the end, and
 * socket numbers are contiguous so the prompt keys stay predictable.
 *
 * Called after any connection change and when a dialog is opened or
 * committed. `socket` is kept on the row itself, so reordering rows never
 * changes which value a field gets.
 */
function reconcileWired(node) {
  if (!node || node.__aunWbSyncing) return rawFields(node);
  node.__aunWbSyncing = true;
  try {
    let rows = rawFields(node);
    let sockets = wiredInputs(node);

    // Drop empty sockets (all but one spare), highest first so the lower
    // indices stay valid. removeInput() shifts the links after it.
    for (let i = sockets.length - 1; i >= 0; i--) {
      const entry = sockets[i];
      if (entry.input.link != null) continue;
      if (i === sockets.length - 1) continue;      // the spare
      const socketNo = i + 1;
      try {
        node.removeInput(entry.index);
      } catch (err) {
        node.inputs?.splice?.(entry.index, 1);
      }
      sockets.splice(i, 1);
      for (const row of rows) {
        if (row.kind === "wired" && row.socket != null && row.socket > socketNo) {
          row.socket -= 1;
        }
      }
    }

    sockets = wiredInputs(node);
    const linked = new Set();
    sockets.forEach((entry, index) => {
      if (entry.input.link != null) linked.add(index + 1);
    });

    // A row whose wire is gone leaves; a new wire appends a row.
    rows = rows.filter((row) => row.kind !== "wired" || linked.has(row.socket));

    const covered = new Set(
      rows.filter((row) => row.kind === "wired").map((row) => row.socket),
    );
    for (const socketNo of [...linked].sort((a, b) => a - b)) {
      if (covered.has(socketNo)) continue;
      const entry = sockets[socketNo - 1];
      const source = sourceOf(node, entry.input);
      const output = source?.node?.outputs?.[source.slot];
      rows.push({
        kind: "wired",
        socket: socketNo,
        name: uniqueName(rows, output?.name || `value_${socketNo}`),
        enabled: true,
        sourceId: null,
        sourceTitle: "",
        outputName: "",
        outputIndex: 0,
      });
    }

    ensureSockets(node, linked.size + 1);
    renameSockets(node);

    // Label the wired sockets with their field names; the socket name
    // itself must stay `in_N` because that is the prompt key.
    const inputs = wiredInputs(node);
    for (const row of rows) {
      if (row.kind !== "wired") continue;
      const input = inputs[row.socket - 1]?.input;
      if (input) input.label = row.name;
    }
    const spare = inputs[linked.size]?.input;
    if (spare && spare.link == null) spare.label = "wire…";

    saveFields(node, rows);
    return rows;
  } finally {
    node.__aunWbSyncing = false;
  }
}

// ── Sources ───────────────────────────────────────────────────────────

function outputIndexFor(source, row) {
  const outs = source?.outputs ?? [];
  const byName = outs.findIndex(
    (out) => String(out?.name ?? "") === row.outputName,
  );
  if (byName >= 0) return byName;
  if (row.outputIndex >= 0 && row.outputIndex < outs.length) {
    return row.outputIndex;
  }
  return -1;
}

/** The node a wireless row points at: id first, then a unique title. */
function findSourceNode(node, row) {
  const graph = node?.graph;
  const direct = graph?.getNodeById?.(row.sourceId);
  if (direct) return direct;

  const title = String(row.sourceTitle ?? "");
  if (!title) return null;
  const matches = (graph?._nodes ?? []).filter(
    (other) => other !== node && titleOf(other) === title,
  );
  if (matches.length === 1) return matches[0];
  const narrowed = matches.filter(
    (other) => outputIndexFor(other, row) >= 0,
  );
  return narrowed.length === 1 ? narrowed[0] : null;
}

/** The node + slot that really supplies a wireless row, or null. */
function resolveRowSource(node, row) {
  const source = findSourceNode(node, row);
  if (!source) return null;
  let slot = outputIndexFor(source, row);
  if (slot < 0) return null;

  try {
    if (source.isVirtualNode) {
      const virtual = source.resolveVirtualOutput?.(slot);
      if (!virtual?.node) return null;
      return { node: virtual.node, slot: virtual.slot ?? 0 };
    }
  } catch (err) {
    return null;
  }
  return { node: source, slot };
}

/** One short line for the dialog: who feeds this row. */
function sourceLabel(node, row) {
  if (row.kind === "wired") {
    const input = wiredInputs(node)[row.socket - 1]?.input;
    const source = input ? sourceOf(node, input) : null;
    if (!source) return "wired (empty)";
    const output = source.node?.outputs?.[source.slot];
    return `wired · ${titleOf(source.node)} · ${output?.name ?? `out ${source.slot + 1}`}`;
  }
  const source = resolveRowSource(node, row);
  if (!source) return "missing source";
  const output = source.node?.outputs?.[source.slot];
  return `${titleOf(source.node)} · ${output?.name ?? `out ${source.slot + 1}`}`;
}

// ── Cycle checks ──────────────────────────────────────────────────────
//
// A wireless field is an implied dependency, so it can close a loop the
// canvas never shows: pick a node that this bundle feeds and the prompt
// would depend on itself. Wires make this visible while editing; `get`
// readers and other wireless bundles only show it in the prompt.

/** Nodes this node's outputs feed, in this graph. */
function downstreamNodes(start) {
  const graph = start?.graph ?? app.graph;
  const found = [];
  eachGraphLink(graph, (link) => {
    if (!link || link.origin_id !== start?.id) return;
    const next = graph?.getNodeById?.(link.target_id);
    if (next) found.push(next);
  });
  return found;
}

/** Whether `target` is reachable downstream of `start` through wires. */
function dependsOn(start, target, seen = new Set()) {
  if (!start || !target) return false;
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return downstreamNodes(start).some((next) => dependsOn(next, target, seen));
}

/** Split Bundles / Unbundles reading this bundle by its `set` name. */
function readersOf(node) {
  const name = setName(node);
  if (!name) return [];
  const readers = [];
  for (const other of node.graph?._nodes ?? []) {
    if (!other || other === node) continue;
    const type = String(other.comfyClass ?? other.type ?? "");
    if (type !== "AUNSplitBundle" && type !== "Unbundle (obvpm)") continue;
    const raw = getWidget(other, "get")?.value;
    const on = raw === true || raw === 1 || raw === "true";
    const used = String(getWidget(other, "constant")?.value ?? "").trim();
    if (on && used === name) readers.push(other);
  }
  return readers;
}

/**
 * Would collecting `sourceNode` close a loop? True when the bundle feeds
 * it directly, or when a reader of this bundle (wired or by name) does.
 */
function sourceWouldLoop(node, sourceNode) {
  if (!sourceNode) return false;
  if (dependsOn(node, sourceNode)) return true;
  return readersOf(node).some((reader) => dependsOn(reader, sourceNode));
}

/** Prompt inputs that point at another node. */
function promptDeps(entry) {
  const deps = [];
  for (const value of Object.values(entry?.inputs ?? {})) {
    if (Array.isArray(value) && value.length === 2
        && typeof value[0] === "string") {
      deps.push(String(value[0]));
    }
  }
  return deps;
}

/** The node ids in one dependency cycle of the prompt, or null. */
function findPromptCycle(output) {
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    const seen = state.get(id);
    if (seen === 2) return null;
    if (seen === 1) {
      const at = stack.indexOf(id);
      return stack.slice(at < 0 ? 0 : at);
    }
    state.set(id, 1);
    stack.push(id);
    for (const dep of promptDeps(output[id])) {
      if (!output[dep]) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of Object.keys(output ?? {})) {
    if (state.get(id) === 2) continue;
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

// ── Names / plan channel to the server ────────────────────────────────

/**
 * The slot each field reads. Wired fields keep the slot their wire is in;
 * wireless fields take the top block, so the two can never collide.
 */
function planSlots(rows) {
  const wireless = rows.filter((row) => row.kind === "wireless").length;
  const wired = rows.filter((row) => row.kind === "wired").length;
  const firstWireless = Math.max(MAX_FIELDS - wireless + 1, wired + 1);
  let nextWireless = firstWireless;

  return rows.map((row) => {
    if (!row.enabled) return null;
    if (row.kind === "wired") return row.socket ?? null;
    return nextWireless++;
  });
}

function writeListWidget(node, name, value) {
  const widget = getWidget(node, name);
  if (!widget || widget.value === value) return;
  widget.value = value;
  const element = widget.element ?? widget.inputEl;
  if (element && "value" in element) element.value = value;
}

// ── Title ─────────────────────────────────────────────────────────────

function setName(node) {
  return String(getWidget(node, SET_WIDGET)?.value ?? "").trim();
}

function applyTitle(node) {
  applyGeneratedTitle(node, {
    prop: TITLE_PROP,
    prefix: "Set",
    name: setName(node),
    display: NODE_DISPLAY,
  });
}

// ── The node's button and sync ────────────────────────────────────────

function updateButtonLabel(node, count = null) {
  const button = getWidget(node, BUTTON_WIDGET);
  if (!button) return;
  const total = count == null ? rawFields(node).length : count;
  const label = total ? `Sources… (${total})` : "Sources…";
  if (button.label === label && button.value === label) return;
  button.label = label;
  button.value = label;
  node.setDirtyCanvas?.(true, true);
}

function installSourcesUi(node) {
  if (getWidget(node, BUTTON_WIDGET)) {
    updateButtonLabel(node);
    return;
  }
  if (node.__aunWbNoButton) return;
  try {
    const button = node.addWidget(
      "button", BUTTON_WIDGET, "Sources…",
      () => openSourcesDialog(node),
    );
    if (button) {
      button.serialize = false;
      button.options ??= {};
    }
  } catch (err) {
    node.__aunWbNoButton = true;
    console.warn(
      "[AUN] Wireless Bundle: could not add the sources button:", err,
    );
  }
  updateButtonLabel(node);
}

function hideListWidgets(node) {
  applyWidgetHiddenState(getWidget(node, NAMES_WIDGET), true);
  applyWidgetHiddenState(getWidget(node, PLAN_WIDGET), true);
}

/** Reconcile the rows with the canvas, then push names/plan to the widgets. */
function syncAll(node) {
  if (!node) return;
  const rows = reconcileWired(node);
  writeListWidget(node, NAMES_WIDGET, rows.map((row) => row.name).join("\n"));
  writeListWidget(node, PLAN_WIDGET, JSON.stringify(planSlots(rows)));
  updateButtonLabel(node, rows.length);
  applyTitle(node);

  // Sockets grow and shrink with the wired fields; keep the height in
  // step. Width is only grown here — a fresh node takes its exact width
  // once, in nodeCreated.
  const sockets = wiredInputs(node).length;
  const previous = node.__aunWbSockets;
  node.__aunWbSockets = sockets;
  if (previous != null && sockets !== previous) {
    requestAnimationFrame(() => {
      if (node.__aunWbReady) fitNodeSize(node);
    });
  }

  node.setDirtyCanvas?.(true, true);
}

// ── Sources dialog ────────────────────────────────────────────────────

/** Every output of every node in this graph (this node excluded). */
function availableOutputs(node) {
  const items = [];
  for (const other of node?.graph?._nodes ?? []) {
    if (!other || other === node) continue;
    (other.outputs ?? []).forEach((slot, index) => {
      items.push({
        node: other,
        index,
        name: String(slot?.name ?? "") || `out ${index + 1}`,
        type: String(slot?.type ?? "*"),
        title: titleOf(other),
      });
    });
  }
  return items.sort((a, b) => a.title.localeCompare(b.title)
    || a.index - b.index);
}

function openSourcesDialog(node) {
  const rows = reconcileWired(node).map((row) => ({ ...row }));
  const outputs = availableOutputs(node);

  const { overlay, panel, foot, close } = createDialog(
    DIALOG_CLASS, "Wireless Bundle — fields", { width: 620 },
  );

  const list = document.createElement("div");
  list.style.cssText = [
    "overflow:auto", "max-height:38vh", "min-height:54px", "padding:2px 0 6px",
  ].join(";");

  const count = document.createElement("div");
  count.style.cssText = "padding:0 14px 6px;color:#999;font-size:12px";

  const filter = document.createElement("input");
  filter.type = "text";
  filter.placeholder = "Filter nodes and outputs…";
  filter.style.cssText = [
    "margin:4px 14px 6px", "padding:6px 8px", "border-radius:5px",
    "border:1px solid #444", "background:#2a2a2a", "color:#eee",
    "font:inherit", "outline:none",
  ].join(";");

  const available = document.createElement("div");
  available.style.cssText = [
    "overflow:auto", "max-height:32vh", "min-height:70px", "padding:2px 0 8px",
  ].join(";");

  const note = document.createElement("div");
  note.style.cssText = [
    "padding:0 14px 8px", "color:#e88", "font-size:12px", "display:none",
  ].join(";");
  const showNote = (text) => {
    note.textContent = text;
    note.style.display = text ? "block" : "none";
  };

  const removed = new Set();          // wired rows whose wire must go
  let redraw = () => {};

  const moveTo = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= rows.length || to >= rows.length) return;
    const [row] = rows.splice(from, 1);
    rows.splice(to, 0, row);
    redraw();
  };
  enableDragReorder(list, moveTo);

  const removeRow = (row) => {
    if (row.kind === "wired") removed.add(row);
    const at = rows.indexOf(row);
    if (at >= 0) rows.splice(at, 1);
    redraw();
  };

  const addRow = (item) => {
    if (rows.length >= MAX_FIELDS) return;
    // A source this bundle feeds would close a loop once injected.
    if (sourceWouldLoop(node, item.node)) {
      showNote(
        `'${item.title}' is fed by this bundle — adding it would make a loop.`,
      );
      return;
    }
    showNote("");
    rows.push({
      kind: "wireless",
      name: uniqueName(rows, item.name),
      enabled: true,
      socket: null,
      sourceId: item.node.id,
      sourceTitle: item.title,
      outputName: item.name,
      outputIndex: item.index,
    });
    redraw();
  };

  const fieldRow = (row, index) => {
    const wrap = document.createElement("div");
    wrap.draggable = true;
    wrap.dataset.dragIndex = String(index);
    wrap.style.cssText = [
      "display:flex", "align-items:center", "gap:8px",
      "padding:4px 14px", "cursor:grab",
      row.enabled ? "" : "opacity:.55",
    ].join(";");

    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = row.enabled;
    box.title = "Include this field in the bundle.";
    box.addEventListener("change", () => {
      row.enabled = box.checked;
      redraw();
    });

    const name = document.createElement("input");
    name.type = "text";
    name.value = row.name;
    name.title = "Bundle field name.";
    name.style.cssText = [
      "width:120px", "padding:3px 6px", "border-radius:4px",
      "border:1px solid #444", "background:#2a2a2a", "color:#eee",
      "font:inherit", "outline:none",
    ].join(";");
    name.addEventListener("input", () => { row.name = name.value; });
    name.addEventListener("change", () => {
      row.name = String(name.value ?? "").trim() || "field";
      redraw();
    });

    const where = document.createElement("span");
    where.textContent = sourceLabel(node, row);
    where.style.cssText = [
      "flex:1", "min-width:0", "overflow-wrap:anywhere", "color:#999",
      row.kind === "wired" ? "font-style:italic" : "",
      row.kind === "wireless" && !resolveRowSource(node, row)
        ? "color:#e88" : "",
    ].join(";");

    const tag = document.createElement("span");
    tag.textContent = row.kind === "wired" ? "wire" : "no wire";
    tag.style.cssText = "color:#777;font-size:12px";

    wrap.append(
      dragGrip(), box, name, where, tag,
      dialogButton("✕", () => removeRow(row)),
    );
    return wrap;
  };

  const outputRow = (item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = [
      "display:block", "width:100%", "text-align:left",
      "padding:4px 14px", "border:0", "background:transparent",
      "color:inherit", "font:inherit", "cursor:pointer",
    ].join(";");

    const title = document.createElement("span");
    title.textContent = item.title;
    title.style.cssText = "font-weight:600";
    const output = document.createElement("span");
    output.textContent = `  ${item.name} (${item.type})`;
    output.style.cssText = "color:#999";

    button.append(title, output);
    button.addEventListener("click", () => addRow(item));
    return button;
  };

  redraw = () => {
    const on = rows.filter((row) => row.enabled).length;
    count.textContent = `${on} of ${rows.length} field`
      + `${rows.length === 1 ? "" : "s"} on`
      + (rows.length >= MAX_FIELDS
        ? ` · at most ${MAX_FIELDS} fields` : "");

    list.replaceChildren();
    if (!rows.length) {
      list.append(emptyHint(
        "Nothing added yet — wire an output into the node, or pick one "
        + "from the list below.",
      ));
    } else {
      rows.forEach((row, index) => list.append(fieldRow(row, index)));
    }

    const query = filter.value.trim().toLowerCase();
    const items = outputs.filter((item) => !query
      || `${item.title} ${item.name} ${item.type}`.toLowerCase()
        .includes(query));

    available.replaceChildren();
    if (!items.length) {
      available.append(emptyHint(
        outputs.length
          ? "No output matches the filter."
          : "No other nodes with outputs in this graph.",
      ));
    } else {
      for (const item of items) available.append(outputRow(item));
    }
  };

  filter.addEventListener("input", redraw);

  const cancel = dialogButton("Cancel", close);
  cancel.style.marginLeft = "auto";
  const ok = dialogButton("OK", () => {
    const looping = rows.find((row) => {
      if (row.kind !== "wireless" || row.enabled === false) return false;
      const src = resolveRowSource(node, row);
      return !!src && sourceWouldLoop(node, src.node);
    });
    if (looping) {
      showNote(
        `'${looping.name}' is fed by this bundle — that would make a loop.`,
      );
      return;
    }
    // Disconnecting leaves the socket empty; syncAll() then trims it and
    // renumbers the rest.
    for (const row of removed) {
      const index = wiredInputs(node).findIndex(
        (entry, i) => i === (row.socket ?? 0) - 1,
      );
      if (index < 0) continue;
      try {
        node.disconnectInput?.(index);
      } catch (err) {
        /* already gone */
      }
    }
    normalizeNames(rows);
    saveFields(node, rows);
    close();
    syncAll(node);
    forceRedraw(node, app);
  }, { accent: true });

  foot.append(cancel, ok);
  panel.append(
    sectionLabel("Fields — drag to reorder, tick to include"),
    list,
    count,
    sectionLabel("Add a node output (no wire)"),
    filter,
    available,
    note,
    foot,
  );
  document.body.append(overlay);
  redraw();
  filter.focus();
}

// ── Prompt pass: wireless sources -> ordinary links ───────────────────

function injectBundle(output, root) {
  const injected = [];

  walkPromptNodes(output, root, NODE_TYPE, (node, entry, execId) => {
    const rows = rawFields(node);
    const plan = planSlots(rows);

    entry.inputs[NAMES_WIDGET] = rows.map((row) => row.name).join("\n");
    entry.inputs[PLAN_WIDGET] = JSON.stringify(plan);

    const prefix = execId.split(":").slice(0, -1);
    rows.forEach((row, index) => {
      if (row.kind !== "wireless" || !row.enabled) return;
      const slot = plan[index];
      if (slot == null) return;

      const source = resolveRowSource(node, row);
      if (!source || isOff(source.node)) return;

      const id = [...prefix, String(source.node.id)].join(":");
      if (!output[id]) return;
      entry.inputs[`in_${slot}`] = [id, source.slot];
      injected.push({
        entryId: execId,
        field: row.name,
        sourceId: id,
        sourceTitle: titleOf(source.node),
      });
    });
  });

  if (!injected.length) return;

  // Wireless links are invisible on the canvas, so a loop can only be
  // seen here. Refuse with the field and source named, rather than let
  // ComfyUI report a bare dependency cycle.
  const cycle = findPromptCycle(output);
  if (!cycle) return;
  const inCycle = new Set(cycle);
  const bad = injected.find(
    (edge) => inCycle.has(edge.entryId) && inCycle.has(edge.sourceId),
  );
  if (!bad) return;        // a cycle that exists without a wireless link

  throw new ConstantRefusal(
    `Wireless Bundle: the field '${bad.field}' reads '${bad.sourceTitle}', `
    + "which depends on this bundle — that would make a loop. Remove that "
    + "source, or the wire/name that closes the loop.",
  );
}

// ── Extension ─────────────────────────────────────────────────────────

app.registerExtension({
  name: "AUNNodes.WirelessBundle",

  setup() {
    registerPromptPass("Wireless Bundle", (output, root) => {
      injectBundle(output, root);
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;
    NODE_DISPLAY = nodeData.display_name || NODE_DISPLAY;
    const proto = nodeType.prototype;

    // Bundle constant hooks: AUN-native first, OBVPM aliases for its
    // Unbundle/KJ Get readers.
    proto.aunConstantWidget = SET_WIDGET;
    proto.obvpmConstantWidget = SET_WIDGET;
    const bundleSlot = {
      configurable: true,
      get() {
        const outs = this.outputs ?? [];
        const index = outs.findIndex(
          (out) => String(out?.type ?? "") === BUNDLE_TYPE,
        );
        return index >= 0 ? index : 0;
      },
    };
    Object.defineProperty(proto, "aunConstantOutput", bundleSlot);
    Object.defineProperty(proto, "obvpmConstantOutput", bundleSlot);

    // Consumers ask a packing node for its field names.
    proto.aunBundleNames = function () {
      return rawFields(this).map((row) => row.name);
    };
    proto.obvpmBundleNames = proto.aunBundleNames;

    // Tracing asks where each field really comes from. Same entry shape as
    // Merge Bundles' plan, so the shared tracer can draw either producer.
    proto.aunBundleFieldEntries = function () {
      return rawFields(this).map((row) => {
        let source = null;
        if (row.kind === "wired") {
          const input = wiredInputs(this)[row.socket - 1]?.input;
          const hit = input ? sourceOf(this, input) : null;
          if (hit) source = { node: hit.node, slot: hit.slot };
        } else {
          const hit = resolveRowSource(this, row);
          if (hit) source = { node: hit.node, slot: hit.slot };
        }
        return {
          final: [row.name],
          source,
          constant: null,
          input: row.kind === "wired" ? `in_${row.socket}` : "no wire",
          skipped: !!(source && isOff(source.node)),
          disabled: row.enabled === false,
          wireless: row.kind !== "wired",
          error: source
            ? undefined
            : (row.kind === "wired"
              ? "nothing is wired into this slot"
              : "source is missing"),
        };
      });
    };

    // A programmatic set-name change (paste, load) may not reach the
    // widget callback; this does.
    const baseWidgetChanged = proto.onWidgetChanged;
    proto.onWidgetChanged = function (name) {
      const result = baseWidgetChanged?.apply(this, arguments);
      if (name === SET_WIDGET) applyTitle(this);
      return result;
    };

    const baseConnections = proto.onConnectionsChange;
    proto.onConnectionsChange = function () {
      const result = baseConnections?.apply(this, arguments);
      if (this.__aunWbReady) {
        requestAnimationFrame(() => {
          if (this.__aunWbReady) syncAll(this);
        });
      }
      return result;
    };

    const baseConfigure = proto.onConfigure;
    proto.onConfigure = function (info) {
      // A configured node is a loaded/duplicated one: keep its saved size.
      this.__aunWbConfigured = true;
      const saved = info?.size;
      const savedSize = saved
        && Number.isFinite(saved[0]) && Number.isFinite(saved[1])
        ? [saved[0], saved[1]] : null;
      const result = baseConfigure?.apply(this, arguments);
      requestAnimationFrame(() => {
        if (!this.__aunWbReady) return;
        hideListWidgets(this);
        installSourcesUi(this);
        syncAll(this);
        if (savedSize) {
          // Building the node from the 32 declared inputs expands it before
          // the saved inputs are restored, and the expanded height can end
          // up in the save too. This node has no variable-height content
          // besides its sockets, so the height always follows the real
          // pins; only a width the user chose is kept (and grown if the
          // content needs it).
          let content = null;
          try {
            content = this.computeSize?.() ?? null;
          } catch (err) {
            content = null;
          }
          const width = Math.max(savedSize[0], content?.[0] ?? 0);
          try {
            this.setSize?.([width, content?.[1] ?? savedSize[1]]);
          } catch (err) {
            /* ignore */
          }
        }
      });
      return result;
    };
  },

  nodeCreated(node) {
    if (!isNodeType(node, NODE_TYPE)) return;
    node.__aunWbReady = true;
    node.__aunWbSync = () => syncAll(node);

    hideListWidgets(node);
    installSourcesUi(node);
    chainWidgetCallback(getWidget(node, SET_WIDGET), () => applyTitle(node));
    applyTitle(node);

    // Trim the declared 32-input pool right away, before a loaded
    // workflow's configure can size the node for all of them.
    syncAll(node);

    // nodeCreated can run before the node is in its graph; reconcile one
    // frame later, after a loaded workflow's inputs are back in place.
    requestAnimationFrame(() => {
      if (!node.__aunWbReady) return;
      hideListWidgets(node);
      installSourcesUi(node);
      applyTitle(node);
      syncAll(node);
      if (!node.__aunWbConfigured) fitNodeSize(node, { fitWidth: true });
    });
  },
});

