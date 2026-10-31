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

const NODE_TYPE = "AUNMergeBundles";
const BUNDLE_TYPE = "OBVPM_BUNDLE";
const INPUT_PREFIX = "bundle_";
const MAX_INPUTS = 16;           // mirrors AUNMergeBundles.MAX_INPUTS
const HOLLOW_CIRCLE = 7;         // RenderShape.HollowCircle: optional pin
const CONSTANTS_WIDGET = "constants";
const ORDER_WIDGET = "order";
const BUTTON_WIDGET = "__aun_constants_button";
const TITLE_PROP = "aun_merge_title";   // the title to put back, kept in properties

const OBVPM_BUNDLE = "Bundle (obvpm)";
const KJ_SET = "SetNode";
const MODE_NEVER = 2;            // LGraphEventMode.NEVER  (muted)
const MODE_BYPASS = 4;           // LGraphEventMode.BYPASS

const MAX_TRACE_DEPTH = 4;
const MAX_GRAPH_DEPTH = 16;

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

function linkOf(graph, id) {
  if (id == null) return null;
  const links = graph?.links;
  return links?.get ? links.get(id) : links?.[id] ?? null;
}

/** The node and output slot a wire comes from. */
function sourceOf(node, input) {
  const graph = node?.graph ?? app.graph;
  const link = input?.link != null ? linkOf(graph, input.link) : null;
  if (!link) return null;
  const origin = graph?.getNodeById?.(link.origin_id) ?? null;
  return origin ? { node: origin, slot: link.origin_slot ?? 0 } : null;
}

function linesOf(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function titleOf(node) {
  return String(node?.title ?? node?.type ?? `node ${node?.id ?? "?"}`);
}

function isOff(node) {
  return node?.mode === MODE_NEVER || node?.mode === MODE_BYPASS;
}

function nodesOf(graph) {
  return graph?._nodes ?? graph?.nodes ?? [];
}

function rootGraph() {
  return app.rootGraph ?? app.graph;
}

/** The root graph and every subgraph instanced below it. */
function allGraphs(graph = rootGraph(), seen = new Set(), out = []) {
  if (!graph || seen.has(graph)) return out;
  seen.add(graph);
  out.push(graph);
  for (const node of nodesOf(graph)) {
    if (node?.subgraph) allGraphs(node.subgraph, seen, out);
  }
  return out;
}

/** `graph` then each graph that instances it, up to the root. */
function graphChain(graph) {
  const root = rootGraph();
  const graphs = allGraphs();
  const chain = [graph];
  let current = graph;
  for (let depth = 0; current && current !== root && depth < 32; depth++) {
    const parent = graphs.find(
      (g) => g !== current && nodesOf(g).some((n) => n.subgraph === current),
    );
    if (!parent || chain.includes(parent)) {
      if (root && !chain.includes(root)) chain.push(root);
      break;
    }
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/**
 * The instance ids from the root graph down to `target`, for a prompt id
 * (`"3:12"`), or null when `target` is not on the way to `start`.
 *
 * Visibility is upward only — a constant must be set in this graph or an
 * outer one — so walking `start`'s own chain also picks the right instance
 * of a subgraph used more than once.
 */
function pathToGraph(target, start) {
  if (!target || !start) return null;
  const chain = graphChain(start);
  if (!chain.includes(target)) return null;
  const forward = chain.slice().reverse();          // root ... start
  if (forward[0] === target) return [];
  const path = [];
  let current = forward[0];
  for (let i = 1; i < forward.length; i++) {
    const next = forward[i];
    const instance = nodesOf(current).find((n) => n.subgraph === next);
    if (!instance) return null;
    path.push(instance.id);
    if (next === target) return path;
    current = next;
  }
  return null;
}

// ── Bundle field names ────────────────────────────────────────────────

/**
 * The field names of the bundle a wire carries.
 *
 * Three sources, in order: the producing node's own answer (every AUN
 * loader defines `obvpmBundleNames`), OBVPM Bundle's hidden `names`
 * widget, and OBVPM Value Presets' `values` JSON. A reroute is followed.
 * Null when the source cannot name its fields — the merge then still
 * works, only that bundle's fields get no labels on the Unbundle.
 */
function fieldsOf(origin, slot, depth = 0) {
  if (!origin || depth > MAX_TRACE_DEPTH) return null;
  if (String(origin.type ?? "") === "Reroute") {
    const up = sourceOf(origin, origin.inputs?.[0]);
    return up ? fieldsOf(up.node, up.slot, depth + 1) : null;
  }
  if (typeof origin.obvpmBundleNames === "function") {
    try {
      const names = origin.obvpmBundleNames(slot);
      if (Array.isArray(names)) return names.map((name) => String(name));
    } catch (err) {
      /* fall through to the widgets */
    }
  }
  const namesWidget = getWidget(origin, "names");
  const fromNames = namesWidget ? linesOf(namesWidget.value) : [];
  if (fromNames.length) return fromNames;
  const valuesWidget = getWidget(origin, "values");
  if (valuesWidget && typeof valuesWidget.value === "string") {
    try {
      const parsed = JSON.parse(valuesWidget.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.keys(parsed);
      }
    } catch (err) {
      /* not a Value Presets node */
    }
  }
  return null;
}

// ── Bundles by constant name ──────────────────────────────────────────

function isKjSet(node) {
  return node?.type === KJ_SET || node?.comfyClass === KJ_SET;
}

/** The constant name a node sets, or "" when it is not a setter. */
function setNameOf(node) {
  // This pack's loaders (and this node, so merges can chain).
  if (typeof node?.obvpmConstantWidget === "string"
      && node.obvpmConstantWidget) {
    return String(getWidget(node, node.obvpmConstantWidget)?.value ?? "")
      .trim();
  }
  // OBVPM's own Bundle, with "set as a constant" turned on.
  if (node?.type === OBVPM_BUNDLE && node?.properties?.obvpm_constant) {
    return String(getWidget(node, "set")?.value ?? "").trim();
  }
  // KJNodes' Set: its name is the first widget.
  if (isKjSet(node)) {
    return String(node?.widgets?.[0]?.value ?? "").trim();
  }
  return "";
}

/** The output slot carrying a setter's bundle, or -1. */
function bundleOutputSlot(node) {
  const own = node?.obvpmConstantOutput;
  if (typeof own === "number" && own >= 0) return own;
  const outputs = node?.outputs ?? [];
  const idx = outputs.findIndex(
    (out) => String(out?.type ?? "") === BUNDLE_TYPE,
  );
  if (idx >= 0) return idx;
  return outputs.length === 1 ? 0 : -1;
}

/** The nearest setter of `name` seen from `node`: own graph first, then up. */
function findSetter(name, node) {
  for (const graph of graphChain(node?.graph)) {
    const setter = nodesOf(graph).find(
      (other) => other !== node && setNameOf(other) === name,
    );
    if (setter) return { node: setter, graph };
  }
  return null;
}

/**
 * Where a constant's bundle really comes from: `{ node, slot, graph }`; or
 * `{ skipped: true, node, slot, graph, reason }` when its setter is muted
 * or bypassed — its names still count (so the other bundles keep their
 * fields), but it contributes no values; or `{ error }` for a real mistake
 * (an unknown name, a setter with no bundle output, an empty KJ Set).
 *
 * A KJ Set is stepped through to whatever feeds it, the same rule OBVPM's
 * constants use, so a Set on an Unbundle output resolves to the field's
 * own source.
 */
function resolveConstantSource(node, name) {
  const hit = findSetter(name, node);
  if (!hit) {
    return { error: `no constant named '${name}' is visible from this node` };
  }
  const setter = hit.node;
  if (isOff(setter)) {
    return {
      skipped: true,
      reason: `'${name}' is set on '${titleOf(setter)}', which is muted `
        + "or bypassed",
      node: setter,
      slot: bundleOutputSlot(setter),
      graph: hit.graph,
    };
  }
  if (isKjSet(setter)) {
    const up = sourceOf(setter, setter.inputs?.[0]);
    if (!up) {
      return {
        error: `the Set named '${name}' has nothing wired into it`,
      };
    }
    if (isOff(up.node)) {
      return {
        skipped: true,
        reason: `'${name}' is fed by '${titleOf(up.node)}', which is muted `
          + "or bypassed",
        node: up.node,
        slot: up.slot,
        graph: up.node.graph ?? hit.graph,
      };
    }
    // An output of a virtual node (an Unbundle, say) is not in the prompt:
    // ask it where the value really comes from.
    try {
      const virtual = up.node?.isVirtualNode
        ? up.node.resolveVirtualOutput?.(up.slot) : null;
      if (virtual?.node) {
        return {
          node: virtual.node,
          slot: virtual.slot ?? 0,
          graph: virtual.node.graph ?? hit.graph,
        };
      }
    } catch (err) {
      /* fall through to the wire as it is */
    }
    return { node: up.node, slot: up.slot, graph: up.node.graph ?? hit.graph };
  }
  const slot = bundleOutputSlot(setter);
  if (slot < 0) {
    return {
      error: `the constant '${name}' is set on '${titleOf(setter)}', which `
        + "has no bundle output",
    };
  }
  return { node: setter, slot, graph: hit.graph };
}

/** The constant names written in this node's box, in order, deduped. */
function constantNames(node) {
  const widget = getWidget(node, CONSTANTS_WIDGET);
  const names = linesOf(widget?.value);
  return [...new Set(names)];
}

/**
 * Every constant name visible from `node`, nearest graph first, with the
 * node that sets it. Used by the dialog.
 */
function visibleConstantNames(node) {
  const found = new Map();
  for (const graph of graphChain(node?.graph)) {
    for (const other of nodesOf(graph)) {
      if (other === node) continue;
      const name = setNameOf(other);
      if (!name || found.has(name)) continue;
      found.set(name, { name, node: other, off: isOff(other) });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
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

/** A refusal the user asked for: it stops the run with its message. */
class ConstantRefusal extends Error {}

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
  const first = (taken.size ? Math.max(...taken) : 0) + 1;
  const free = [];
  for (let n = first; n <= MAX_INPUTS; n++) {
    if (!taken.has(n)) free.push(n);
  }

  const live = plan.filter(
    (item) => item.constant != null && !item.skipped,
  ).length;
  if (live > free.length) {
    throw new ConstantRefusal(
      `Merge Bundles: ${live} constant(s) are selected but only `
      + `${free.length} bundle input(s) are free after the wired ones.`,
    );
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
      inputName = `${INPUT_PREFIX}${free[nextFree++]}`;
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
  if (typeof app.graphToPrompt !== "function"
      || app.graphToPrompt.__aunMergeConstants) {
    return;
  }
  const base = app.graphToPrompt;
  const wrapped = async function (...args) {
    const result = await base.apply(this, args);
    try {
      const root = args[0]?.serialize ? args[0] : rootGraph();
      fillMergeConstants(result?.output, root);
    } catch (err) {
      // Our own refusals stop the queue with their message; anything else
      // must not take the whole prompt build down with it.
      if (err instanceof ConstantRefusal) throw err;
      console.error("[AUN] Merge Bundles: could not apply constants:", err);
    }
    return result;
  };
  wrapped.__aunMergeConstants = true;
  app.graphToPrompt = wrapped;
}

/** Ask OBVPM's dynamic nodes to re-read this node's field names. */
function nudgeObvpm(node) {
  const graph = node?.graph ?? app.graph;
  for (const other of graph?._nodes ?? []) {
    try {
      other.__obvpmSync?.();
    } catch (err) {
      /* a consumer that cannot re-sync is not ours to fix here */
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

const DIALOG_CLASS = "AUN-merge-constants-dialog";

function closeConstantsDialog() {
  document.querySelector(`.${DIALOG_CLASS}`)?.remove();
}

function dialogButton(label, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = !!options.disabled;
  button.style.cssText = [
    "padding:5px 12px", "border-radius:5px",
    `border:1px solid ${options.accent ? "#4a7dbd" : "#555"}`,
    `background:${options.accent ? "#2f5b94" : "#333"}`,
    "color:#eee", "font:inherit",
    options.disabled ? "opacity:.45" : "cursor:pointer",
  ].join(";");
  if (!options.disabled) {
    button.addEventListener("click", onClick);
  }
  return button;
}

function sectionLabel(text) {
  const label = document.createElement("div");
  label.textContent = text;
  label.style.cssText = [
    "padding:10px 14px 4px", "color:#9aa4af", "font-size:11px",
    "letter-spacing:.04em", "text-transform:uppercase",
  ].join(";");
  return label;
}

function emptyHint(text) {
  const hint = document.createElement("div");
  hint.textContent = text;
  hint.style.cssText = "padding:6px 14px;color:#999";
  return hint;
}

/**
 * The only way to choose constants: pick from the setters visible from this
 * node, then order them. Nothing is written until OK.
 */
function openConstantsDialog(node) {
  closeConstantsDialog();

  const selected = [...constantNames(node)];
  const visible = () => visibleConstantNames(node);

  const overlay = document.createElement("div");
  overlay.className = DIALOG_CLASS;
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:10000", "display:flex",
    "align-items:center", "justify-content:center",
    "background:rgba(0,0,0,.55)",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "width:500px", "max-height:78vh", "display:flex",
    "flex-direction:column", "background:#202020", "color:#ddd",
    "border:1px solid #4a4a4a", "border-radius:8px", "overflow:hidden",
    "box-shadow:0 12px 40px rgba(0,0,0,.55)",
    "font:13px/1.45 system-ui,-apple-system,sans-serif",
  ].join(";");

  const head = document.createElement("div");
  head.textContent = "Constants to merge";
  head.style.cssText = [
    "padding:12px 14px", "font-weight:600", "border-bottom:1px solid #3a3a3a",
  ].join(";");

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

  const foot = document.createElement("div");
  foot.style.cssText = [
    "display:flex", "align-items:center", "gap:8px",
    "padding:10px 14px", "border-top:1px solid #3a3a3a",
  ].join(";");

  let redraw = () => {};

  const clear = dialogButton("Clear all", () => {
    selected.length = 0;
    redraw();
  });

  const cancel = dialogButton("Cancel", closeConstantsDialog);
  cancel.style.marginLeft = "auto";

  const ok = dialogButton("OK", () => {
    setConstants(node, selected);
    closeConstantsDialog();
  }, { accent: true });

  const move = (index, delta) => {
    const to = index + delta;
    if (to < 0 || to >= selected.length) return;
    const [name] = selected.splice(index, 1);
    selected.splice(to, 0, name);
    redraw();
  };

  const selectedRow = (name, index, owners) => {
    const owner = owners.get(name);
    const row = document.createElement("div");
    row.style.cssText = [
      "display:flex", "align-items:center", "gap:6px",
      "padding:3px 14px",
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
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeConstantsDialog();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeConstantsDialog();
    }
  });

  foot.append(clear, cancel, ok);
  panel.append(
    head,
    sectionLabel("Selected — merged in this order"),
    selectedList,
    sectionLabel("Available in this graph"),
    filter,
    availableList,
    foot,
  );
  overlay.append(panel);
  document.body.append(overlay);
  redraw();
  filter.focus();
}

// ── Extension ─────────────────────────────────────────────────────────

app.registerExtension({
  name: "AUNNodes.MergeBundles",

  setup() {
    installPromptPass();
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
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
