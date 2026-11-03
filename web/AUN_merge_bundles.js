/**
 * AUN Merge Bundles — browser side.
 *
 * The node itself is trivial on the server (it merges dicts). What the
 * browser adds is what makes one OBVPM Unbundle able to show the fields of
 * several bundles at once:
 *
 *  - `obvpmBundleNames(slot)` — OBVPM asks a node that packs a bundle for
 *    its field names; this returns the merged list, so the Unbundle builds
 *    one output per field of every connected bundle.
 *  - `obvpmConstantWidget` — the node takes part in OBVPM bundle constants
 *    (a `set` name, read by an Unbundle with `get` or a KJ Get), like the
 *    AUN loaders do.
 *  - wireless inputs: the Constants… button lists setter names, and at
 *    prompt-build time each name becomes an ordinary bundle input on this
 *    node — the same trick OBVPM's own getters use (obvpm_constants.js
 *    wraps `app.graphToPrompt` and fills `inputs`), so the server only
 *    ever sees wires and needs to know nothing about names.
 *  - the input sockets grow one spare at a time, like the Bundle node.
 *  - tracing: hovering an OBVPM Unbundle output fed by this node names the
 *    field's real source, Alt-click jumps there, and this node's menu lists
 *    them all ("Sources…").
 *
 * The naming rule is mirrored in AUNMergeBundles.merge(): bundles merge in
 * input order (wired first, then the listed constants), the first copy of
 * a name keeps it, and a later copy gets the lowest free numbered suffix
 * (`width`, `width_2`, ...). Both sides must agree or the Unbundle's labels
 * would not match the server's keys.
 */

import { app } from "../../scripts/app.js";
import {
  applyWidgetHiddenState,
  chainWidgetCallback,
  forceRedraw,
  getWidget,
} from "./index.js";
import {
  BUNDLE_TYPE,
  ConstantRefusal,
  MAX_GRAPH_DEPTH,
  fieldsOf,
  findSetter,
  isOff,
  linesOf,
  nodesOf,
  pathToGraph,
  registerPromptPass,
  resolveConstantSource,
  sourceOf,
  titleOf,
  visibleConstantNames,
} from "./aun_bundle_constants.js";
import {
  closeDialog,
  createDialog,
  dialogButton,
  dragGrip,
  emptyHint,
  enableDragReorder,
  sectionLabel,
} from "./aun_dialog_shared.js";

const NODE_TYPE = "AUNMergeBundles";
const INPUT_PREFIX = "bundle_";
const MAX_INPUTS = 64;           // mirrors AUNMergeBundles.MAX_INPUTS
const HOLLOW_CIRCLE = 7;         // RenderShape.HollowCircle: optional pin
const CONSTANTS_WIDGET = "constants";
const ORDER_WIDGET = "order";
const BUTTON_WIDGET = "__aun_constants_button";
const TITLE_PROP = "aun_merge_title";   // the title to put back, kept in properties

// ── Small helpers ─────────────────────────────────────────────────────

/** `bundle_3` -> 3, anything else -> 0. */
function slotNumber(name) {
  const text = String(name ?? "");
  if (!text.startsWith(INPUT_PREFIX)) return 0;
  const n = parseInt(text.slice(INPUT_PREFIX.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The wired bundle inputs, in input order. */
function bundleInputs(node) {
  return (node?.inputs ?? [])
    .filter((input) => slotNumber(input?.name) > 0 && input.link != null)
    .sort((a, b) => slotNumber(a.name) - slotNumber(b.name));
}

/** The constant names written in this node's box, in order, deduped. */
function constantNames(node) {
  const widget = getWidget(node, CONSTANTS_WIDGET);
  const names = linesOf(widget?.value);
  return [...new Set(names)];
}

/**
 * Number per-entry field names so no two entries collide: the first copy
 * keeps its name, later copies get `name_2`, `name_3`, ... Entries are
 * numbered in order, so passing `null` for a skipped entry still reserves
 * the names it would have had.
 */
function numberFields(lists) {
  const taken = new Set();
  return lists.map((names) => (names ?? []).map((raw) => {
    const base = String(raw);
    let name = base;
    let suffix = 2;
    while (taken.has(name)) name = `${base}_${suffix++}`;
    taken.add(name);
    return name;
  }));
}

/**
 * Every source, in merge order (wired bundles first, then listed
 * constants), with the field names it contributes.
 *
 * A source that is muted or bypassed stays in the list with `skipped: true`
 * and its names intact — that is what keeps the numbering of the others
 * stable: mute ref2 and ref3 is still `image_3`, while ref2's `image_2` is
 * simply absent (its Unbundle pin, if any, outputs None).
 */
function bundlePlan(node) {
  const entries = [];

  for (const input of bundleInputs(node)) {
    const source = sourceOf(node, input);
    const skipped = !source || isOff(source.node);
    entries.push({
      input: input.name,
      constant: null,
      source,
      names: source ? fieldsOf(source.node, source.slot) : null,
      skipped,
      reason: skipped
        ? `${input.name} comes from '${titleOf(source?.node ?? input)}', `
          + "which is muted or bypassed"
        : "",
      error: null,
    });
  }

  for (const name of constantNames(node)) {
    const source = resolveConstantSource(node, name);
    if (source.error) {
      entries.push({
        input: null,
        constant: name,
        source: null,
        names: null,
        skipped: false,
        reason: "",
        error: source.error,
      });
      continue;
    }
    entries.push({
      input: null,
      constant: name,
      source,
      names: fieldsOf(source.node, source.slot),
      skipped: !!source.skipped,
      reason: source.reason ?? "",
      error: null,
    });
  }

  const numbered = numberFields(entries.map((entry) => entry.names));
  entries.forEach((entry, index) => {
    entry.final = numbered[index];
  });
  return entries;
}

/**
 * The field names an OBVPM Unbundle should show: every planned field,
 * skipped sources included, so muting one bundle never moves another's
 * pins.
 */
function mergedNames(node) {
  const warned = (node.__aunMergeWarned ??= new Set());
  const names = [];

  for (const entry of bundlePlan(node)) {
    const key = entry.constant ? `constant:${entry.constant}` : entry.input;
    if (entry.final.length) {
      names.push(...entry.final);
      warned.delete(key);
      continue;
    }
    if (entry.error) {
      if (warned.has(key)) continue;
      warned.add(key);
      console.warn("[AUN] Merge Bundles:", `${entry.error}.`);
      continue;
    }
    if (warned.has(key)) continue;
    warned.add(key);
    console.warn(
      "[AUN] Merge Bundles:",
      `cannot read the field names of the bundle on ${key} `
      + `(${titleOf(entry.source?.node)}). Its fields still merge, but an `
      + "OBVPM Unbundle will not label them.",
    );
  }

  return names;
}

// ── Prompt pass: names -> ordinary bundle inputs ──────────────────────

/** Log a skipped source once per node and name. */
function logSkipped(node, entry) {
  const key = entry.constant ? `constant:${entry.constant}` : entry.input;
  const logged = (node.__aunMergeSkipped ??= new Set());
  if (logged.has(key)) return;
  logged.add(key);
  console.info(
    "[AUN] Merge Bundles: skipping",
    `${entry.reason}; its fields are left empty.`,
  );
}

/**
 * Fill this node's bundle inputs from its constant names, and tell the
 * server what each input's fields are called.
 *
 * Wired inputs are never touched; the named ones take the slots after the
 * highest wired one, so the server merges the wires first, then the names
 * in the order they are listed. `order` carries the final field names for
 * every input, with skipped sources still counted in the numbering.
 */
function injectConstants(output, entry, node) {
  const plan = bundlePlan(node);
  const broken = plan.find((item) => item.error);
  if (broken) {
    throw new ConstantRefusal(`Merge Bundles: ${broken.error}.`);
  }

  const inputs = (entry.inputs ??= {});
  const taken = new Set();
  for (const key of Object.keys(inputs)) {
    const n = slotNumber(key);
    if (n > 0) taken.add(n);
  }
  // A wired input may be missing from the prompt (its source was bypassed),
  // but its slot is still in use on the canvas: never reuse it.
  for (const input of node.inputs ?? []) {
    const n = slotNumber(input?.name);
    if (n > 0 && input.link != null) taken.add(n);
  }
  const first = (taken.size ? Math.max(...taken) : 0) + 1;
  const free = [];
  for (let n = first; n <= MAX_INPUTS; n++) {
    if (!taken.has(n)) free.push(n);
  }

  // Prompts can be serialised and passed back through several wrapper
  // layers. If this bundle is already wired to a source, reuse that slot
  // instead of allocating a second one.
  const bySource = new Map();
  for (const [key, value] of Object.entries(inputs)) {
    if (slotNumber(key) <= 0) continue;
    if (Array.isArray(value) && value.length === 2) {
      bySource.set(`${value[0]}:${value[1]}`, key);
    }
  }

  const serverPlan = [];
  let nextFree = 0;

  for (const item of plan) {
    if (item.skipped) {
      if (item.reason) logSkipped(node, item);
      continue;                     // its names stay reserved, no values
    }

    let inputName = item.input;
    if (item.constant != null) {
      const source = item.source;
      const graph = source.graph ?? source.node?.graph;
      const path = pathToGraph(graph, node.graph);
      if (!path) {
        throw new ConstantRefusal(
          `Merge Bundles: the Set named '${item.constant}' is in a graph `
          + "this node cannot reach.",
        );
      }
      const id = [...path, source.node.id].join(":");
      if (!output[id]) {
        throw new ConstantRefusal(
          `Merge Bundles: '${item.constant}' resolves to `
          + `'${titleOf(source.node)}', which is not in the prompt.`,
        );
      }
      const sourceKey = `${id}:${source.slot}`;
      inputName = bySource.get(sourceKey);
      if (!inputName) {
        if (nextFree >= free.length) {
          throw new ConstantRefusal(
            "Merge Bundles: there are not enough bundle inputs left for "
            + `'${item.constant}' (only ${free.length} free after the `
            + "wired ones).",
          );
        }
        inputName = `${INPUT_PREFIX}${free[nextFree++]}`;
        bySource.set(sourceKey, inputName);
      }
      inputs[inputName] = [id, source.slot];
    }

    if (item.final.length) {
      serverPlan.push({ input: inputName, names: item.final });
    }
  }

  inputs.order = serverPlan.length ? JSON.stringify(serverPlan) : "";
}

function fillMergeConstants(output, root) {
  if (!output || !root) return;
  const walk = (graph, path, depth) => {
    if (depth > MAX_GRAPH_DEPTH) return;
    for (const node of nodesOf(graph)) {
      if (node?.type === NODE_TYPE || node?.comfyClass === NODE_TYPE) {
        const id = [...path, node.id].join(":");
        const entry = output[id];
        if (entry) injectConstants(output, entry, node);
      }
      if (node?.subgraph && !isOff(node)) {
        walk(node.subgraph, [...path, node.id], depth + 1);
      }
    }
  };
  walk(root, [], 0);
}

/**
 * Resolve the constant names once per queue, after everything else has
 * serialised — the same place and the same way OBVPM resolves its getters.
 */
function installPromptPass() {
  if (installPromptPass.done) return;
  installPromptPass.done = true;
  registerPromptPass("Merge Bundles", (output, root) => {
    fillMergeConstants(output, root);
  });
}

/** Ask bundle readers to re-read this node's field names. */
function nudgeObvpm(node) {
  const graph = node?.graph ?? app.graph;
  for (const other of graph?._nodes ?? []) {
    try {
      other.__obvpmSync?.();
    } catch (err) {
      /* a consumer that cannot re-sync is not ours to fix here */
    }
    try {
      other.__aunSplitSync?.();
    } catch (err) {
      /* a Split Bundle that cannot re-sync is not ours to fix here */
    }
  }
}

// ── Sockets ───────────────────────────────────────────────────────────

/**
 * Keep one spare input. Slots are only ever added at the end or removed
 * while empty, so no wired socket ever changes index.
 */
function syncInputs(node) {
  const inputs = node?.inputs ?? [];
  const used = bundleInputs(node).length;
  const target = Math.max(1, Math.min(MAX_INPUTS, used + 1));
  let changed = false;

  for (let i = inputs.length - 1; i >= 0; i--) {
    const input = inputs[i];
    const n = slotNumber(input?.name);
    if (n > target && input.link == null) {
      node.removeInput(i);
      changed = true;
    }
  }

  for (let n = 1; n <= target; n++) {
    const name = `${INPUT_PREFIX}${n}`;
    if ((node.inputs ?? []).some((input) => input?.name === name)) continue;
    node.addInput(name, BUNDLE_TYPE, { shape: HOLLOW_CIRCLE });
    changed = true;
  }

  for (const input of node.inputs ?? []) {
    const n = slotNumber(input?.name);
    if (n > 0) input.label = `bundle ${n}`;
  }

  if (changed) {
    node.setSize?.(node.computeSize());
    forceRedraw(node, app);
  }
}

// ── The list, kept in the hidden widget ───────────────────────────────

/**
 * Write the ordered list. The `constants` widget is never shown: it is the
 * saved channel the prompt pass reads, and the dialog is the only way in.
 */
function setConstants(node, names) {
  const widget = getWidget(node, CONSTANTS_WIDGET);
  if (!widget) return;
  const next = [...new Set(names.map((name) => String(name).trim())
    .filter(Boolean))];
  widget.value = next.join("\n");
  try {
    widget.callback?.(widget.value);
  } catch (err) {
    /* the widget callback is the host's; a failure is not fatal */
  }
  updateButtonLabel(node);
  forceRedraw(node, app);
  requestAnimationFrame(() => nudgeObvpm(node));
}

function constantsButton(node) {
  return getWidget(node, BUTTON_WIDGET);
}

function updateButtonLabel(node) {
  const button = constantsButton(node);
  if (!button) return;
  const names = constantNames(node);
  let label = "Constants…";
  if (names.length) {
    const skipped = names.filter(
      (name) => resolveConstantSource(node, name).skipped,
    ).length;
    label = `Constants… (${names.length}`
      + (skipped ? `, ${skipped} skipped)` : ")");
  }
  if (button.label === label) return;
  button.label = label;
  button.value = label;
  node.setDirtyCanvas?.(true, true);
}

/** Hide the saved list, add the button that opens the dialog. */
function installConstantsUi(node) {
  applyWidgetHiddenState(getWidget(node, CONSTANTS_WIDGET), true);
  applyWidgetHiddenState(getWidget(node, ORDER_WIDGET), true);
  if (constantsButton(node)) return;
  try {
    const button = node.addWidget(
      "button", BUTTON_WIDGET, "Constants…",
      () => openConstantsDialog(node),
    );
    if (button) {
      button.serialize = false;
      button.options ??= {};
    }
  } catch (err) {
    console.warn("[AUN] Merge Bundles: could not add the constants button:", err);
  }
  updateButtonLabel(node);
  node.setSize?.(node.computeSize());
}

// ── Title follows the constant name ───────────────────────────────────

/**
 * A node set to a constant shows which one in its title, the way OBVPM's
 * own Set nodes do ("Set ckpt"). The title it replaced is kept in the
 * node's properties, so clearing the name puts it back — and it survives a
 * save and reload.
 */
function applyTitle(node) {
  const name = String(getWidget(node, "set")?.value ?? "").trim();
  const props = (node.properties ??= {});
  if (name) {
    if (props[TITLE_PROP] == null) props[TITLE_PROP] = node.title ?? "";
    const wanted = `Set ${name}`;
    if (node.title !== wanted) {
      node.title = wanted;
      node.setDirtyCanvas?.(true, true);
    }
    return;
  }
  const kept = props[TITLE_PROP];
  if (kept == null) return;
  delete props[TITLE_PROP];
  node.title = kept || "Merge Bundles";
  node.setDirtyCanvas?.(true, true);
}

function installTitle(node) {
  if (!node.__aunMergeTitleWired) {
    node.__aunMergeTitleWired = true;
    // The change may come from typing, the picker or a load: all of them
    // end in the widget's callback.
    chainWidgetCallback(getWidget(node, "set"), () => applyTitle(node));
  }
  applyTitle(node);
}

// ── Constants dialog ──────────────────────────────────────────────────

const DIALOG_CLASS = "AUN-merge-dialog";

function closeMergeDialog() {
  closeDialog(DIALOG_CLASS);
}

/**
 * The only way to choose constants: pick from the setters visible from this
 * node, then order them. Nothing is written until OK.
 */
function openConstantsDialog(node) {
  closeMergeDialog();

  const selected = [...constantNames(node)];
  const visible = () => visibleConstantNames(node);

  const { overlay, panel, foot, close } = createDialog(
    DIALOG_CLASS, "Constants to merge", { width: 500 },
  );

  const selectedList = document.createElement("div");
  selectedList.style.cssText = [
    "overflow:auto", "max-height:36vh", "min-height:44px", "padding:2px 0",
  ].join(";");

  const filter = document.createElement("input");
  filter.type = "text";
  filter.placeholder = "Filter available names…";
  filter.style.cssText = [
    "margin:4px 14px 6px", "padding:6px 8px", "border-radius:5px",
    "border:1px solid #444", "background:#2a2a2a", "color:#eee",
    "font:inherit", "outline:none",
  ].join(";");

  const availableList = document.createElement("div");
  availableList.style.cssText = [
    "flex:1", "overflow:auto", "min-height:90px", "padding:2px 0 8px",
  ].join(";");

  let redraw = () => {};

  const clear = dialogButton("Clear all", () => {
    selected.length = 0;
    redraw();
  });

  const cancel = dialogButton("Cancel", close);
  cancel.style.marginLeft = "auto";

  const ok = dialogButton("OK", () => {
    setConstants(node, selected);
    close();
  }, { accent: true });

  const moveTo = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= selected.length || to >= selected.length) return;
    const [name] = selected.splice(from, 1);
    selected.splice(to, 0, name);
    redraw();
  };

  const move = (index, delta) => moveTo(index, index + delta);

  const selectedRow = (name, index, owners) => {
    const owner = owners.get(name);
    const row = document.createElement("div");
    row.draggable = true;
    row.dataset.dragIndex = String(index);
    row.style.cssText = [
      "display:flex", "align-items:center", "gap:6px",
      "padding:3px 14px", "cursor:grab",
    ].join(";");

    const text = document.createElement("div");
    text.style.cssText = "flex:1;min-width:0;overflow:hidden";
    const strong = document.createElement("span");
    strong.textContent = name;
    strong.style.cssText = "font-weight:600";
    const where = document.createElement("span");
    where.textContent = owner
      ? `  ${titleOf(owner.node)}`
        + (owner.off ? "  (muted — skipped)" : "")
      : "  (no longer set anywhere)";
    where.style.cssText = "color:#999";
    text.append(strong, where);

    row.append(
      dragGrip(),
      text,
      dialogButton("▲", () => move(index, -1), { disabled: index === 0 }),
      dialogButton("▼", () => move(index, 1),
        { disabled: index === selected.length - 1 }),
      dialogButton("✕", () => {
        selected.splice(index, 1);
        redraw();
      }),
    );
    return row;
  };

  const availableRow = (item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.style.cssText = [
      "display:block", "width:100%", "text-align:left",
      "padding:5px 14px", "border:0", "background:transparent",
      "color:inherit", "font:inherit", "cursor:pointer",
      item.off ? "opacity:.65" : "",
    ].join(";");

    const strong = document.createElement("span");
    strong.textContent = item.name;
    strong.style.cssText = "font-weight:600";
    const where = document.createElement("span");
    where.textContent = `  ${titleOf(item.node)}`
      + (item.off ? "  (muted — will be skipped)" : "");
    where.style.cssText = "color:#999";
    row.append(strong, where);

    // A muted setter can still be picked: its fields stay in place and
    // are simply left empty while it is muted.
    row.addEventListener("click", () => {
      selected.push(item.name);
      redraw();
    });
    return row;
  };

  redraw = () => {
    const owners = new Map(visible().map((item) => [item.name, item]));

    selectedList.replaceChildren();
    if (!selected.length) {
      selectedList.append(emptyHint(
        "Nothing selected yet — pick names from the list below.",
      ));
    } else {
      selected.forEach((name, index) => selectedList.append(
        selectedRow(name, index, owners),
      ));
    }

    const query = filter.value.trim().toLowerCase();
    const chosen = new Set(selected);
    const items = visible().filter((item) => {
      if (chosen.has(item.name)) return false;
      if (!query) return true;
      return `${item.name} ${titleOf(item.node)}`.toLowerCase().includes(query);
    });

    availableList.replaceChildren();
    if (!items.length) {
      availableList.append(emptyHint(
        visible().length
          ? "Every visible name is already in the list."
          : "No names are set in this graph — give a loader a name in its "
            + "'set' widget first.",
      ));
    } else {
      for (const item of items) availableList.append(availableRow(item));
    }
  };

  filter.addEventListener("input", redraw);
  enableDragReorder(selectedList, moveTo);

  foot.append(clear, cancel, ok);
  panel.append(
    sectionLabel("Selected — merged in this order"),
    selectedList,
    sectionLabel("Available in this graph"),
    filter,
    availableList,
    foot,
  );
  document.body.append(overlay);
  redraw();
  filter.focus();
}

// ── Where each field comes from ───────────────────────────────────────

/** Centre and select a node, the way OBVPM's "Go to setter" does. */
export function goToNode(node) {
  if (!node) return;
  const canvas = app.canvas;
  canvas?.centerOnNode?.(node);
  canvas?.selectNode?.(node, false);
  node.setDirtyCanvas?.(true, true);
  canvas?.setDirty?.(true, true);
}

/**
 * "Sources…": every merged field, the node it comes from, and how it got
 * here — a wire or a constant. "Go to" jumps to that node.
 */
export function openSourcesDialog(mergeNode) {
  closeMergeDialog();
  const plan = entriesFor(mergeNode);
  const rows = plan.filter((entry) => entry.source?.node || entry.error);

  const { overlay, panel, foot, close } = createDialog(
    DIALOG_CLASS, "Bundle sources", { width: 560 },
  );
  foot.style.justifyContent = "flex-end";

  const list = document.createElement("div");
  list.style.cssText = [
    "overflow:auto", "max-height:60vh", "min-height:64px", "padding:2px 0 8px",
  ].join(";");

  if (!rows.length) {
    list.append(emptyHint(
      "Nothing is merged yet — wire a bundle or pick constants first.",
    ));
  }

  for (const entry of rows) {
    const row = document.createElement("div");
    row.style.cssText = [
      "display:flex", "align-items:center", "gap:10px",
      "padding:6px 14px", "border-bottom:1px solid #2b2b2b",
    ].join(";");

    const fields = document.createElement("div");
    fields.style.cssText = [
      "flex:1", "min-width:0", "overflow-wrap:anywhere", "font-weight:600",
      entry.skipped ? "opacity:.55" : "",
    ].join(";");
    fields.textContent = entry.final?.length
      ? entry.final.join(", ")
      : "(field names unknown)";

    const where = document.createElement("div");
    where.style.cssText = [
      "flex:1", "min-width:0", "color:#999", "overflow-wrap:anywhere",
    ].join(";");
    if (entry.error) {
      where.textContent = entry.error;
    } else {
      where.textContent = `${titleOf(entry.source?.node)} · ${kindOf(entry)}`
        + (entry.skipped ? " · muted, empty" : "")
        + (entry.disabled ? " · off" : "");
    }

    row.append(
      fields,
      where,
      dialogButton("Go to", () => {
        goToNode(entry.source?.node);
        closeMergeDialog();
      }, { disabled: !entry.source?.node }),
    );
    list.append(row);
  }

  foot.append(dialogButton("Close", close));
  panel.append(list, foot);
  document.body.append(overlay);
}

// ── Tracing a bundle back to its sources ──────────────────────────────
//
// A bundle replaces several wires with one, so the canvas can no longer say
// which node an output really comes from. These hooks put that back for
// bundles packed by Merge Bundles or Wireless Bundle.
//
// The reliable way in is SELECTION: select the Unbundle (or this node) and
// every source it draws from is outlined and labelled with the fields it
// supplies. That needs no pointer hit-testing, so it works in both the
// classic canvas and Nodes 2.0.
//
// On the classic canvas hovering an output pin also highlights just that
// field's source. The label is drawn at the SOURCE, not at the cursor: the
// pin already has ComfyUI's own tooltip there ("The bundle's value for
// field 1"), so a second tooltip would only fight it.

const UNBUNDLE_TYPE = "Unbundle (obvpm)";
const SPLIT_TYPE = "AUNSplitBundle";
const WIRELESS_TYPE = "AUNWirelessBundle";
const PIN_TOLERANCE = 14;
const MAX_LABEL = 120;

let traceHover = null;         // { node, field, entry } under the pointer
let traceKey = "";

function isUnbundle(node) {
  return !!node
    && (node.type === UNBUNDLE_TYPE || node.comfyClass === UNBUNDLE_TYPE);
}

function isMergeNode(node) {
  return !!node && (node.comfyClass === NODE_TYPE || node.type === NODE_TYPE);
}

function isSplitNode(node) {
  return !!node
    && (node.comfyClass === SPLIT_TYPE || node.type === SPLIT_TYPE);
}

function isWirelessNode(node) {
  return !!node
    && (node.comfyClass === WIRELESS_TYPE || node.type === WIRELESS_TYPE);
}

/** A node that packs a bundle and can name where each field came from. */
function isProducer(node) {
  return isMergeNode(node) || isWirelessNode(node);
}

function linkAt(graph, id) {
  if (id == null) return null;
  if (typeof id === "object") return id;          // already a link record
  const links = graph?.links;
  if (!links) return null;
  return links.get ? links.get(id) ?? null : links[id] ?? null;
}

/** The link on `name` (or the first input, for a Reroute). */
function inputLink(node, name) {
  const inputs = node?.inputs ?? [];
  const slot = name == null
    ? inputs[0]
    : inputs.find((input) => input?.name === name);
  if (slot?.link == null) return null;
  return linkAt(node.graph, slot.link);
}

/** The constant an Unbundle with `get` on is reading, or "". */
function constantNameOf(node) {
  if (node?.properties?.obvpm_constant !== true) return "";
  return String(getWidget(node, "get")?.value ?? "").trim();
}

/** A Split Bundle is reading by name when `get` is on and it has a name. */
function splitReadsByName(node) {
  const value = getWidget(node, "get")?.value;
  const on = value === true || value === 1 || value === "true";
  return on && !!String(getWidget(node, "constant")?.value ?? "").trim();
}

/** A setter's producer: itself, or what a KJ Set carries. */
function producerOfSetter(hit) {
  if (!hit?.node) return null;
  if (isProducer(hit.node)) return hit.node;
  if (String(hit.node.type ?? "") === "SetNode") {
    const up = sourceOf(hit.node, hit.node.inputs?.[0]);
    if (up && isProducer(up.node)) return up.node;
  }
  return null;
}

/**
 * The producer a reader draws from: a Merge Bundles or Wireless Bundle
 * node, wired or by constant name. Readers are OBVPM's Unbundle, a Split
 * Bundle and (as a pass-through) a KJ Get.
 */
function producerFor(node, depth = 0) {
  if (!node || depth > 6) return null;

  if (isSplitNode(node)) {
    if (splitReadsByName(node)) {
      const name = String(getWidget(node, "constant")?.value ?? "").trim();
      return producerOfSetter(findSetter(name, node));
    }
    const input = (node.inputs ?? []).find((item) => item?.name === "bundle");
    const link = input?.link != null ? linkAt(node.graph, input.link) : null;
    if (!link) return null;
    const origin = node.graph?.getNodeById?.(link.origin_id) ?? null;
    if (!origin) return null;
    if (isProducer(origin)) return origin;
    if (String(origin.type ?? "") === "Reroute") {
      return producerFor(origin, depth + 1);
    }
    if (String(origin.type ?? "") === "GetNode") {
      const name = String(origin.widgets?.[0]?.value ?? "").trim();
      return name ? producerOfSetter(findSetter(name, origin)) : null;
    }
    return null;
  }

  if (isUnbundle(node)) {
    // A wired bundle, through reroutes.
    const reroute = String(node.type ?? "") === "Reroute";
    const link = inputLink(node, reroute ? null : "in");
    if (link) {
      const origin = node.graph?.getNodeById?.(link.origin_id) ?? null;
      if (origin) {
        if (isProducer(origin)) return origin;
        if (String(origin.type ?? "") === "Reroute") {
          return producerFor(origin, depth + 1);
        }
        // A KJ Get reads a constant by name: see whether that setter is us.
        if (String(origin.type ?? "") === "GetNode") {
          const name = String(origin.widgets?.[0]?.value ?? "").trim();
          const hit = name ? findSetter(name, origin) : null;
          const producer = producerOfSetter(hit);
          if (producer) return producer;
        }
      }
    }

    // No wire: an Unbundle with `get` on reads a setter by that name.
    const name = constantNameOf(node);
    if (name) return producerOfSetter(findSetter(name, node));
    return null;
  }

  if (String(node.type ?? "") === "GetNode") {
    const name = String(node.widgets?.[0]?.value ?? "").trim();
    return name ? producerOfSetter(findSetter(name, node)) : null;
  }
  return null;
}

/**
 * A producer's fields and their sources. Merge Bundles computes a plan;
 * a node with an `aunBundleFieldEntries` hook (Wireless Bundle) answers
 * itself, in the same entry shape.
 */
function entriesFor(node) {
  if (!node) return [];
  if (typeof node.aunBundleFieldEntries === "function") {
    const now = Date.now();
    const hit = node.__aunTraceEntries;
    if (hit && now - hit.at < 500) return hit.entries;
    let entries = [];
    try {
      entries = node.aunBundleFieldEntries() ?? [];
    } catch (err) {
      entries = [];
    }
    node.__aunTraceEntries = { at: now, entries };
    return entries;
  }
  return planFor(node);
}

/** A merge node's plan, cached briefly: it is read on every redraw. */
function planFor(node) {
  const now = Date.now();
  const hit = node.__aunTracePlan;
  if (hit && now - hit.at < 500) return hit.entries;
  const entries = bundlePlan(node);
  node.__aunTracePlan = { at: now, entries };
  return entries;
}

/** Field name -> the entry that supplies it. */
function fieldMap(producer) {
  const map = new Map();
  for (const entry of entriesFor(producer)) {
    for (const name of entry.final ?? []) {
      if (!map.has(name)) map.set(name, entry);
    }
  }
  return map;
}

function outputName(output) {
  if (!output) return "";
  return String(output.label || output.localized_name || output.name || "");
}

/**
 * The output pin at graph coordinates (x, y), or null.
 *
 * Mirrors the frontend's own slot layout: outputs with a `pos` sit there;
 * the rest stack from `slot_start_y` at 0.7 of a slot height. Nodes 2.0
 * positions pins from its rendered layout, which is not reachable from
 * here, so hover tracing is classic-canvas only (selection tracing covers
 * both).
 */
function pinUnder(node, x, y) {
  const lg = globalThis.LiteGraph ?? {};
  if (lg.vueNodesMode) return null;

  const slotHeight = lg.NODE_SLOT_HEIGHT ?? 20;
  const half = slotHeight * 0.5;
  const startY = node.constructor?.slot_start_y ?? 0;
  const outputs = node.outputs ?? [];
  const vertical = outputs.filter((output) => !slotPos(output));
  const edge = node.pos[0] + node.size[0] + 1 - half;

  for (const output of outputs) {
    const pos = slotPos(output);
    const pinX = pos ? node.pos[0] + pos[0] : edge;
    const pinY = pos
      ? node.pos[1] + pos[1]
      : node.pos[1] + startY
        + (vertical.indexOf(output) + 0.7) * slotHeight;
    if (Math.abs(x - pinX) <= PIN_TOLERANCE
        && Math.abs(y - pinY) <= half) {
      return output;
    }
  }
  return null;
}

/** A slot's explicit position, if it has one. */
function slotPos(slot) {
  const pos = slot?.pos;
  if (Array.isArray(pos) && pos.length >= 2) return [pos[0], pos[1]];
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    return [pos.x, pos.y];
  }
  return null;
}

/** Where a widget-input's pin sits: on its widget row, at the left edge. */
function widgetPin(node, input, half) {
  const name = input?.widget?.name ?? input?.name;
  const widget = (node.widgets ?? []).find((w) => w?.name === name);
  if (!widget || !Number.isFinite(widget.last_y)) return null;
  const height = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT
    ?? globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
  return [node.pos[0] + half, node.pos[1] + widget.last_y + height * 0.5];
}

/**
 * The input pin at graph coordinates (x, y), or null. Same layout rules as
 * `pinUnder`, mirrored to the left edge; a converted widget's pin sits on
 * its widget row.
 */
function inputPinUnder(node, x, y) {
  const lg = globalThis.LiteGraph ?? {};
  if (lg.vueNodesMode) return null;

  const slotHeight = lg.NODE_SLOT_HEIGHT ?? 20;
  const half = slotHeight * 0.5;
  const startY = node.constructor?.slot_start_y ?? 0;
  const inputs = node.inputs ?? [];
  const vertical = inputs.filter((input) => !slotPos(input) && !input?.widget);
  const edge = node.pos[0] + half;

  for (const input of inputs) {
    if (!input) continue;
    let point = null;
    const pos = slotPos(input);
    if (pos) {
      point = [node.pos[0] + pos[0], node.pos[1] + pos[1]];
    } else if (input.widget) {
      point = widgetPin(node, input, half);
    } else {
      point = [
        edge,
        node.pos[1] + startY + (vertical.indexOf(input) + 0.7) * slotHeight,
      ];
    }
    if (!point) continue;
    if (Math.abs(x - point[0]) <= PIN_TOLERANCE
        && Math.abs(y - point[1]) <= half) {
      return input;
    }
  }
  return null;
}

/** A link's real origin, following Reroutes. */
function resolveOrigin(node, link, depth = 0) {
  if (!node || !link || depth > 4) return null;
  const origin = node.graph?.getNodeById?.(link.origin_id) ?? null;
  if (!origin) return null;
  if (String(origin.type ?? "") !== "Reroute") {
    return { node: origin, slot: link.origin_slot ?? 0 };
  }
  const up = inputLink(origin, null);
  return up ? resolveOrigin(origin, up, depth + 1) : null;
}

/**
 * A consumer's input, followed all the way back: input wire -> reader
 * output -> producer field -> the node that really supplies that value.
 */
function traceThroughInput(node, input) {
  const link = input?.link != null ? linkAt(node.graph, input.link) : null;
  if (!link) return null;
  const origin = resolveOrigin(node, link);
  if (!origin || !(isUnbundle(origin.node) || isSplitNode(origin.node))) {
    return null;
  }
  const producer = producerFor(origin.node);
  const field = outputName(origin.node.outputs?.[origin.slot]);
  const entry = producer ? fieldMap(producer).get(field) : null;
  return entry?.source?.node ? { field, entry } : null;
}

function clearTraceHover() {
  if (!traceHover) return;
  traceHover = null;
  traceKey = "";
  app.canvas?.setDirty?.(true, true);
}

/** Any traced pin under these coordinates: { field, entry }. */
function traceAt(x, y) {
  const nodes = app.canvas?.graph?._nodes
    ?? app.canvas?.graph?.nodes ?? [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (!node?.pos || !node?.size) continue;
    const near = x >= node.pos[0] - 24 && x <= node.pos[0] + node.size[0] + 24
      && y >= node.pos[1] - 24 && y <= node.pos[1] + node.size[1] + 24;
    if (!near) continue;

    // A reader's output pin: the field's own source.
    if (isUnbundle(node) || isSplitNode(node)) {
      const output = pinUnder(node, x, y);
      if (output) {
        const producer = producerFor(node);
        const field = outputName(output);
        const entry = producer ? fieldMap(producer).get(field) : null;
        if (entry?.source?.node) return { field, entry };
      }
    }

    // Any node's input pin: the same chain, from the consumer's side.
    const input = inputPinUnder(node, x, y);
    if (input) {
      const traced = traceThroughInput(node, input);
      if (traced) return traced;
    }
  }
  return null;
}

/** Work out which pin the pointer is over, without waiting for a redraw. */
function updateTraceHover(x, y) {
  const found = traceAt(x, y);
  if (!found) return clearTraceHover();

  const { field, entry } = found;
  const source = entry?.source?.node;
  if (!source) return clearTraceHover();

  const key = `${field}:${entry.skipped ? 1 : 0}:${source.id}:`
    + `${entry.constant ?? entry.input ?? ""}`;
  traceHover = { field, entry };
  if (key === traceKey) return;
  traceKey = key;
  app.canvas?.setDirty?.(true, true);
}

function isSelected(node) {
  if (node?.is_selected) return true;
  const selected = app.canvas?.selected_nodes;
  return !!(selected && selected[node.id]);
}

/**
 * What is selected and can be traced: a merge node, an Unbundle it feeds,
 * or a consumer wired to that Unbundle's output. Each gives the plan
 * entries behind the fields it uses.
 */
function selectedTraceTargets() {
  const nodes = app.canvas?.graph?._nodes
    ?? app.canvas?.graph?.nodes ?? [];
  const targets = [];
  for (const node of nodes) {
    if (!isSelected(node)) continue;
    if (isProducer(node)) {
      targets.push({ node, entries: entriesFor(node) });
      continue;
    }
    if (isUnbundle(node) || isSplitNode(node)) {
      const producer = producerFor(node);
      if (producer) targets.push({ node, entries: entriesFor(producer) });
      continue;
    }
    // A downstream node: follow each input through the Unbundle to the
    // merge, so the real sources light up from the target's side too.
    const entries = [];
    const seen = new Set();
    for (const input of node.inputs ?? []) {
      const traced = traceThroughInput(node, input);
      if (!traced || seen.has(traced.entry)) continue;
      seen.add(traced.entry);
      entries.push(traced.entry);
    }
    if (entries.length) targets.push({ node, entries });
  }
  return targets;
}

function kindOf(entry) {
  if (entry.constant != null) return String(entry.constant);
  return entry.input ?? "wire";
}

function clip(text) {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

/** Canvas zoom, so labels keep a readable size at any zoom level. */
function traceScale() {
  const scale = app.canvas?.ds?.scale;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function drawOutline(ctx, node) {
  const scale = traceScale();
  ctx.strokeStyle = "#4da3ff";
  ctx.lineWidth = 2 / scale;
  ctx.strokeRect(
    node.pos[0] - 3, node.pos[1] - 3, node.size[0] + 6, node.size[1] + 6,
  );
}

function drawLabel(ctx, node, text) {
  const scale = traceScale();
  const fontSize = 14 / scale;          // 14 screen px whatever the zoom
  const padX = 7 / scale;
  const padY = 4 / scale;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  const width = ctx.measureText(text).width + padX * 2;
  const height = fontSize + padY * 2;
  const x = node.pos[0] - 2;
  const y = node.pos[1] - height - 8 / scale;

  ctx.fillStyle = "rgba(18,18,18,.92)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#dbe6f2";
  ctx.fillText(text, x + padX, y + padY + fontSize * 0.8);
}

/** Outline every source; label only the one under the pointer. */
function drawMap(ctx, entries, labelNode = null) {
  const byNode = new Map();
  for (const entry of entries) {
    const node = entry.source?.node;
    if (!node?.pos || !node?.size) continue;
    const list = byNode.get(node) ?? [];
    list.push(entry);
    byNode.set(node, list);
  }

  for (const [node, list] of byNode) {
    drawOutline(ctx, node);
    if (!labelNode || node !== labelNode) continue;
    const parts = list.map((entry) => {
      const names = (entry.final ?? []).join(", ") || "?";
      return `${names} · ${kindOf(entry)}`
        + (entry.skipped ? " · muted" : "")
        + (entry.disabled ? " · off" : "");
    });
    drawLabel(ctx, node, clip(parts.join("   |   ")));
  }
}

/** Hover a pin: that one field. Selected: the outlines, labelled on hover. */
function drawTrace(ctx) {
  if (!ctx) return;
  if (traceHover) {
    const { entry, field } = traceHover;
    const node = entry.source?.node;
    if (!node?.pos || !node?.size) return;
    drawOutline(ctx, node);
    drawLabel(
      ctx,
      node,
      clip(`${field} ← ${titleOf(node)} · ${kindOf(entry)}`
        + (entry.skipped ? " · muted" : "")
        + (entry.disabled ? " · off" : "")),
    );
    return;
  }
  const under = app.canvas?.node_over ?? null;
  for (const target of selectedTraceTargets()) {
    drawMap(ctx, target.entries, under);
  }
}

/** Client point -> graph point, without relying on the host's own state. */
function graphPoint(clientX, clientY) {
  const canvas = app.canvas;
  const element = canvas?.canvas
    ?? document.querySelector("canvas.lgraphcanvas");
  if (!element || !canvas?.ds) return null;
  const rect = element.getBoundingClientRect();
  const scale = canvas.ds.scale || 1;
  const offset = canvas.ds.offset;
  const offsetX = Array.isArray(offset) ? offset[0] : (offset?.x ?? 0);
  const offsetY = Array.isArray(offset) ? offset[1] : (offset?.y ?? 0);
  return [
    (clientX - rect.left) / scale - offsetX,
    (clientY - rect.top) / scale - offsetY,
  ];
}

function onTracePointerMove(event) {
  const point = graphPoint(event.clientX, event.clientY);
  if (!point) return clearTraceHover();
  updateTraceHover(point[0], point[1]);
}

/** Alt-click a traced pin: select and centre the source node. */
function bindAltClick() {
  const element = app.canvas?.canvas
    ?? document.querySelector("canvas.lgraphcanvas");
  if (!element || element.__aunTraceClick) return !!element;
  element.__aunTraceClick = true;
  element.addEventListener("mousedown", (event) => {
    const source = traceHover?.entry?.source?.node;
    if (!event.altKey || !source) return;
    // Take the click before the canvas starts dragging a link from the pin.
    event.preventDefault();
    event.stopPropagation();
    goToNode(source);
    clearTraceHover();
  }, true);
  return true;
}

function bindTracePointer() {
  const element = app.canvas?.canvas
    ?? document.querySelector("canvas.lgraphcanvas");
  if (!element || element.__aunTraceMove) return !!element;
  element.__aunTraceMove = true;
  element.addEventListener("mousemove", onTracePointerMove, { passive: true });
  element.addEventListener("mouseleave", clearTraceHover, { passive: true });
  return true;
}

function hookTraceCanvas(canvas) {
  if (!canvas || canvas.__aunBundleTrace) return;
  canvas.__aunBundleTrace = true;
  const baseDraw = canvas.onDrawForeground;
  canvas.onDrawForeground = function (ctx) {
    const result = baseDraw?.apply(this, arguments);
    drawTrace(ctx);
    return result;
  };
}

/** Install the pointer/canvas hooks, retrying while the canvas is not up. */
function installTrace() {
  let tries = 0;
  const install = () => {
    hookTraceCanvas(app.canvas);
    if (app.canvas?.__aunBundleTrace && bindTracePointer()
        && bindAltClick()) {
      console.info("[AUN] Merge Bundles: tracing installed");
      return;
    }
    if (tries++ < 20) setTimeout(install, 500);
  };
  install();
}

// ── Extension ─────────────────────────────────────────────────────────

app.registerExtension({
  name: "AUNNodes.MergeBundles",

  setup() {
    installPromptPass();
    installTrace();
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    // Tracing lives on the readers/producers: only their menus are patched,
    // never their files.
    if (nodeData.name === UNBUNDLE_TYPE
        || nodeData.name === SPLIT_TYPE
        || nodeData.name === WIRELESS_TYPE) {
      const baseMenu = nodeType.prototype.getExtraMenuOptions;
      nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
        const result = baseMenu?.apply(this, arguments);
        if (!Array.isArray(options)) return result;
        const producer = isProducer(this) ? this : producerFor(this);
        if (!producer) return result;
        options.push({
          content: "Bundle sources…",
          callback: () => openSourcesDialog(producer),
        });
        return result;
      };
      return;
    }
    if (nodeData.name !== NODE_TYPE) return;
    const proto = nodeType.prototype;

    // OBVPM constant support, exactly as the AUN loaders declare it: the
    // `set` widget holds the name and output 0 carries the bundle.
    proto.obvpmConstantWidget = "set";
    if (!Object.prototype.hasOwnProperty.call(proto, "obvpmConstantOutput")) {
      Object.defineProperty(proto, "obvpmConstantOutput", {
        configurable: true,
        get() {
          const outs = this.outputs || [];
          const idx = outs.findIndex(
            (out) => String(out?.type ?? "") === BUNDLE_TYPE,
          );
          return idx >= 0 ? idx : (outs.length ? outs.length - 1 : 0);
        },
      });
    }

    // What an OBVPM Unbundle reads to build its outputs (obvpm_dynamic.js,
    // bundleNamesFor): one name per merged field, wired bundles first.
    proto.obvpmBundleNames = function (slot) {
      const out = this.outputs?.[slot];
      if (out && String(out.type ?? "") !== BUNDLE_TYPE) return null;
      return mergedNames(this);
    };

    // A programmatic name change (paste renames, obvpm helpers) does not
    // always reach the widget callback; this does.
    const baseWidgetChanged = proto.onWidgetChanged;
    proto.onWidgetChanged = function (name) {
      const result = baseWidgetChanged?.apply(this, arguments);
      if (name === "set") applyTitle(this);
      return result;
    };

    // Muting a setter is not an event on this node, so the "n skipped"
    // part of the button label is refreshed while the node is drawn --
    // twice a second at most, and only a redraw when it actually changed.
    const baseDraw = proto.onDrawForeground;
    proto.onDrawForeground = function () {
      const result = baseDraw?.apply(this, arguments);
      if (this.__aunMergeReady) {
        const now = Date.now();
        if (now - (this.__aunMergeLabelAt ?? 0) > 500) {
          this.__aunMergeLabelAt = now;
          updateButtonLabel(this);
        }
      }
      return result;
    };

    const baseMenu = proto.getExtraMenuOptions;    proto.getExtraMenuOptions = function (canvas, options) {
      const result = baseMenu?.apply(this, arguments);
      if (!Array.isArray(options)) return result;
      options.push({
        content: "Constants…",
        callback: () => openConstantsDialog(this),
      });
      options.push({
        content: "Sources…",
        callback: () => openSourcesDialog(this),
      });
      return result;
    };

    const baseOnConnectionsChange = proto.onConnectionsChange;
    proto.onConnectionsChange = function () {
      const result = baseOnConnectionsChange?.apply(this, arguments);
      if (this.__aunMergeReady) {
        syncInputs(this);
        // The merged fields changed: let an OBVPM Unbundle re-label.
        requestAnimationFrame(() => nudgeObvpm(this));
      }
      return result;
    };

    const baseOnConfigure = proto.onConfigure;
    proto.onConfigure = function () {
      const result = baseOnConfigure?.apply(this, arguments);
      // After the saved inputs are back in place.
      requestAnimationFrame(() => {
        if (this.__aunMergeReady) {
          syncInputs(this);
          installTitle(this);
          nudgeObvpm(this);
        }
      });
      return result;
    };
  },

  nodeCreated(node) {
    if (node?.comfyClass !== NODE_TYPE && node?.type !== NODE_TYPE) return;
    node.__aunMergeReady = true;
    syncInputs(node);
    installConstantsUi(node);
    installTitle(node);
  },
});
