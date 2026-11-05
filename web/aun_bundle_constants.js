/**
 * Shared bundle-constant plumbing.
 *
 * A "bundle" is a plain dict: the `bundle` output every AUN setter node
 * produces. A constant is the `set` name on that node. This module owns the
 * browser-side rules both bundle nodes need:
 *
 *  - how a node names its bundle fields (`aunBundleNames`, with the older
 *    `obvpmBundleNames` still read so both packs work),
 *  - how a constant name is resolved to the node and output slot that
 *    really supplies it (nearest graph first, then outward),
 *  - how the field names of a wired bundle are read,
 *  - one `app.graphToPrompt` wrapper that all AUN prompt passes share, so
 *    they cannot fight over the hook.
 *
 * Nothing here imports an external node pack. OBVPM/KJ nodes are only
 * recognised as optional sources or setters when they happen to be in the
 * graph.
 *
 * The bundle format, the `set`-name constant and the `obvpm*` hooks are
 * OBVPM's design (https://github.com/chanon/comfyui-obvpm) by chanon.
 * AUN's bundle nodes build directly on that work — thank you.
 */

import { app } from "../../scripts/app.js";
import { getWidget } from "./widgets.js";

export const BUNDLE_TYPE = "OBVPM_BUNDLE";
export const OBVPM_BUNDLE = "Bundle (obvpm)";
export const KJ_SET = "SetNode";

export const MODE_NEVER = 2;            // LGraphEventMode.NEVER  (muted)
export const MODE_BYPASS = 4;           // LGraphEventMode.BYPASS

export const MAX_TRACE_DEPTH = 4;
export const MAX_GRAPH_DEPTH = 16;

/** A refusal the user asked for: it stops the run with its message. */
export class ConstantRefusal extends Error {}

// ── Graph helpers ─────────────────────────────────────────────────────

export function nodesOf(graph) {
  return graph?._nodes ?? graph?.nodes ?? [];
}

export function rootGraph() {
  return app.rootGraph ?? app.graph;
}

/** The root graph and every subgraph instanced below it. */
export function allGraphs(graph = rootGraph(), seen = new Set(), out = []) {
  if (!graph || seen.has(graph)) return out;
  seen.add(graph);
  out.push(graph);
  for (const node of nodesOf(graph)) {
    if (node?.subgraph) allGraphs(node.subgraph, seen, out);
  }
  return out;
}

/** `graph` then each graph that instances it, up to the root. */
export function graphChain(graph) {
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
 */
export function pathToGraph(target, start) {
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

export function linkOf(graph, id) {
  if (id == null) return null;
  const links = graph?.links;
  return links?.get ? links.get(id) : links?.[id] ?? null;
}

/** The node and output slot a wire comes from. */
export function sourceOf(node, input) {
  const graph = node?.graph ?? app.graph;
  const link = input?.link != null ? linkOf(graph, input.link) : null;
  if (!link) return null;
  const origin = graph?.getNodeById?.(link.origin_id) ?? null;
  return origin ? { node: origin, slot: link.origin_slot ?? 0 } : null;
}

export function linesOf(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function titleOf(node) {
  return String(node?.title ?? node?.type ?? `node ${node?.id ?? "?"}`);
}

export function isOff(node) {
  return node?.mode === MODE_NEVER || node?.mode === MODE_BYPASS;
}

export function isNodeType(node, type) {
  return !!node && (node.type === type || node.comfyClass === type);
}

// ── Output slots and generated titles ─────────────────────────────────

/** Visit every link record in the graph, whatever shape the store has. */
export function eachGraphLink(graph, visit) {
  const links = graph?.links;
  if (!links) return;
  if (Array.isArray(links)) {
    for (const link of links) visit(link);
    return;
  }
  if (typeof links.forEach === "function") {       // Map-like store
    links.forEach((link) => visit(link));
    return;
  }
  if (typeof links.values === "function") {
    for (const link of links.values()) visit(link);
    return;
  }
  for (const key of Object.keys(links)) visit(links[key]);
}

/** Whether output pin `index` has a link (works with old and new frontends). */
export function outputIsWired(node, index) {
  try {
    if (typeof node?.isOutputConnected === "function") {
      return !!node.isOutputConnected(index);
    }
  } catch (err) {
    /* fall through to the slot shape */
  }
  const out = node?.outputs?.[index];
  if (Array.isArray(out?.links)) return out.links.length > 0;
  return out?.link != null;
}

/** Field names whose current output pin is connected. */
export function wiredOutputNames(node) {
  const names = new Set();
  const outs = node?.outputs ?? [];
  for (let index = 0; index < outs.length; index++) {
    if (!outputIsWired(node, index)) continue;
    const name = String(outs[index]?.name ?? "");
    if (name) names.add(name);
  }
  return names;
}

/** A title a node generated (`Get <name>` / `Set <name>`), not one the user chose. */
export function isGeneratedTitle(title, prefix) {
  const text = String(title ?? "").trim();
  return !!prefix && text.length > prefix.length + 1
    && text.startsWith(`${prefix} `);
}

/**
 * Keep a node's title in step with the constant name it sets or reads,
 * and put the user's own title back when the name is cleared.
 *
 * The generated title must never be stored as the title to restore: a
 * workflow saved while the mode was on restores `Get <name>` as the
 * node's title, and storing that would make it permanent.
 */
export function applyGeneratedTitle(node, { prop, prefix, name, display }) {
  const props = (node.properties ??= {});
  const text = String(name ?? "").trim();

  if (text) {
    const wanted = `${prefix} ${text}`;
    if (props[prop] == null && node.title !== wanted
        && !isGeneratedTitle(node.title, prefix)) {
      props[prop] = node.title ?? "";
    }
    if (isGeneratedTitle(props[prop], prefix)) delete props[prop];
    if (node.title !== wanted) {
      node.title = wanted;
      node.setDirtyCanvas?.(true, true);
    }
    return;
  }

  const kept = props[prop];
  delete props[prop];

  // Older saves may hold the generated title as if it were the user's, so
  // any title in this node's generated form is treated as ours.
  const usable = kept && !isGeneratedTitle(kept, prefix) ? kept : "";
  const wanted = usable
    || (isGeneratedTitle(node.title, prefix) ? display : "");
  if (!wanted || node.title === wanted) return;
  node.title = wanted;
  node.setDirtyCanvas?.(true, true);
}

// ── Bundle field names ────────────────────────────────────────────────

/**
 * The field names of the bundle a wire carries.
 *
 * Sources, in order: the producing node's own answer (`aunBundleNames`,
 * then `obvpmBundleNames`), OBVPM Bundle's hidden `names` widget, and OBVPM
 * Value Presets' `values` JSON. A reroute is followed. Null when the source
 * cannot name its fields.
 */
export function fieldsOf(origin, slot, depth = 0) {
  if (!origin || depth > MAX_TRACE_DEPTH) return null;
  if (String(origin.type ?? "") === "Reroute") {
    const up = sourceOf(origin, origin.inputs?.[0]);
    return up ? fieldsOf(up.node, up.slot, depth + 1) : null;
  }
  for (const hook of ["aunBundleNames", "obvpmBundleNames"]) {
    if (typeof origin[hook] !== "function") continue;
    try {
      const names = origin[hook](slot);
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

export function isKjSet(node) {
  return node?.type === KJ_SET || node?.comfyClass === KJ_SET;
}

/** The constant name a node sets, or "" when it is not a setter. */
export function setNameOf(node) {
  for (const hook of ["aunConstantWidget", "obvpmConstantWidget"]) {
    if (typeof node?.[hook] === "string" && node[hook]) {
      return String(getWidget(node, node[hook])?.value ?? "").trim();
    }
  }
  // OBVPM's own Bundle, with "set as a constant" turned on.
  if (isNodeType(node, OBVPM_BUNDLE) && node?.properties?.obvpm_constant) {
    return String(getWidget(node, "set")?.value ?? "").trim();
  }
  // KJNodes' Set: its name is the first widget.
  if (isKjSet(node)) {
    return String(node?.widgets?.[0]?.value ?? "").trim();
  }
  return "";
}

/** The output slot carrying a setter's bundle, or -1. */
export function bundleOutputSlot(node) {
  for (const hook of ["aunConstantOutput", "obvpmConstantOutput"]) {
    const own = node?.[hook];
    if (typeof own === "number" && own >= 0) return own;
  }
  const outputs = node?.outputs ?? [];
  const idx = outputs.findIndex(
    (out) => String(out?.type ?? "") === BUNDLE_TYPE,
  );
  if (idx >= 0) return idx;
  return outputs.length === 1 ? 0 : -1;
}

/** The nearest setter of `name` seen from `node`: own graph first, then up. */
export function findSetter(name, node) {
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
 * or bypassed; or `{ error }` for a real mistake.
 */
export function resolveConstantSource(node, name) {
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
      return { error: `the Set named '${name}' has nothing wired into it` };
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

/** Every constant name visible from `node`, nearest graph first. */
export function visibleConstantNames(node) {
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

// ── Prompt pass ───────────────────────────────────────────────────────

const promptPasses = [];
/** output object -> passes already applied to it */
const passRuns = new WeakMap();
let _graphToPrompt = app.graphToPrompt;

function runPasses(output, root) {
  if (!output || typeof output !== "object") return;
  let done = passRuns.get(output);
  if (!done) {
    done = new Set();
    passRuns.set(output, done);
  }
  for (const pass of promptPasses) {
    if (!pass.repeat) {
      if (done.has(pass.fn)) continue;
      done.add(pass.fn);
    }
    try {
      pass.fn(output, root);
    } catch (err) {
      if (err instanceof ConstantRefusal) throw err;
      console.error(`[AUN] ${pass.name}:`, err);
    }
  }
}

function wrapCurrent() {
  const cur = app.graphToPrompt;
  if (!cur || typeof cur !== "function" || cur.__aunPromptPass) return;
  const base = cur;
  const wrapped = async function (...args) {
    const result = await base.apply(this, args);
    const root = args[0]?.serialize ? args[0] : rootGraph();
    runPasses(result?.output ?? null, root);
    return result;
  };
  wrapped.__aunPromptPass = true;
  _graphToPrompt = wrapped;
}

try {
  Object.defineProperty(app, "graphToPrompt", {
    configurable: true,
    get() { return _graphToPrompt; },
    set(v) {
      _graphToPrompt = v;
      queueMicrotask(wrapCurrent);
    },
  });
} catch (err) {
  wrapCurrent();
}

queueMicrotask(wrapCurrent);

/**
 * Register a prompt-build pass. Every AUN bundle feature goes through this
 * one wrapper, so ordering is registration order and nobody replaces
 * `app.graphToPrompt` twice.
 */
export function registerPromptPass(name, fn, options = {}) {
  promptPasses.push({ name, fn, repeat: options.repeat === true });
  wrapCurrent();
}

/**
 * Walk the prompt entries for nodes of `type`, including nodes inside
 * subgraphs, calling `visit(node, entry, execId)`.
 */
export function walkPromptNodes(output, root, type, visit) {
  if (!output || !root) return;
  const walk = (graph, path, depth) => {
    if (depth > MAX_GRAPH_DEPTH) return;
    for (const node of nodesOf(graph)) {
      if (isNodeType(node, type)) {
        const id = [...path, node.id].join(":");
        const entry = output[id];
        if (entry) visit(node, entry, id);
      }
      if (node?.subgraph && !isOff(node)) {
        walk(node.subgraph, [...path, node.id], depth + 1);
      }
    }
  };
  walk(root, [], 0);
}
