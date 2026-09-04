import { app } from "../../scripts/app.js";

/**
 * ComfyUI 1.53.2: `node.widgets` is a reactive getter over a "presented"
 * view.  Hidden widgets are excluded → their values never reach the prompt
 * that `graphToPrompt` builds → server validation fails with
 * "Required input is missing".
 *
 * Fix: after the original `graphToPrompt` runs, inject every widget value
 * that is present on the graph node but missing from the output prompt.
 * We read widgets from two sources and merge them:
 *   - node.__AUN_allWidgets  (snapshot of ALL widgets, maintained by each
 *     node's JS file, includes hidden ones)
 *   - node.widgets           (current "presented" view, always fresh)
 * We skip widgets that the frontend itself skips: serialize === false.
 */
const AUN_NODE_TYPES = new Set([
  "AUNLoRAsByPromptIndex",
  "AUNRandomLoraModelOnlyMulti",
  "AUNRandomLoraModelOnly",
  "AUNLoraStackWithTriggers",
  "AUNLoraStackWithTriggersModelClip",
  "AUNMultiUniversal",
  "AUNMultiGroupUniversal",
  "ANCMultiUniversal",
  "ANCMultiGroupUniversal",
]);

function shouldSkipWidget(w) {
  if (!w || !w.name) return true;
  if (w.__AUN_removed) return true;
  if (w.options?.serialize === false || w.serialize === false) return true;
  return false;
}

function buildAllWidgetsMap(node) {
  const map = new Map();
  const sources = [node.__AUN_allWidgets, node.widgets];
  for (const list of sources) {
    if (!Array.isArray(list)) continue;
    for (const w of list) {
      if (!shouldSkipWidget(w)) map.set(w.name, w);
    }
  }
  return map;
}

function isPromptSafePrimitive(value) {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}

function unwrapValueShape(value) {
  // Newer frontends may hand back reactive wrappers / { value } shapes for
  // detached (hidden) widgets. Unwrap one level when the inside is usable.
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const inner = value.value;
    if (isPromptSafePrimitive(inner)) return inner;
  }
  return value;
}

function getWidgetValue(w, node) {
  // Frontend ≥ v1.53.4: w.serializeValue() / w.value for hidden (detached)
  // widgets can come back as Proxy/{} objects. Injecting those corrupts the
  // prompt (e.g. label_1: {}), so only primitives are accepted. A skipped
  // input fails loudly at validation; a {} input corrupts silently.
  try {
    if (typeof w.serializeValue === "function") {
      const viaSerialize = unwrapValueShape(w.serializeValue(node, 0));
      if (isPromptSafePrimitive(viaSerialize)) return viaSerialize;
    }
  } catch (_) {}
  const direct = unwrapValueShape(w.value);
  if (isPromptSafePrimitive(direct)) return direct;
  if (Array.isArray(direct)) return direct;
  // Last resort: our own serialize-time snapshot (properties._aun_values),
  // which still holds the true strings when the live read degrades.
  try {
    const snapshotted = node?.properties?.["_aun_values"]?.[w.name];
    if (isPromptSafePrimitive(snapshotted)) return snapshotted;
  } catch (_) {}
  return undefined;
}

function patchGraphToPrompt() {
  if (app.__AUN_graphToPromptPatched) return;
  app.__AUN_graphToPromptPatched = true;

  const originalGraphToPrompt = app.graphToPrompt?.bind(app);
  if (typeof originalGraphToPrompt !== "function") return;

  app.graphToPrompt = async function patchedGraphToPrompt(graph, options) {
    const result = await originalGraphToPrompt(graph, options);
    try {
      const prompt = result?.output;
      if (!prompt || typeof prompt !== "object") return result;

      const nodes = graph?._nodes ?? [];
      for (const node of nodes) {
        if (!AUN_NODE_TYPES.has(node.type)) continue;

        const entry = prompt[String(node.id)];
        if (!entry || typeof entry !== "object") continue;

        const inputs = (entry.inputs ??= {});
        const byName = buildAllWidgetsMap(node);

        let injected = 0;
        for (const [name, w] of byName) {
          if (name in inputs) continue;
          const val = getWidgetValue(w, node);
          if (val !== undefined && val !== null) {
            inputs[name] = val;
            injected++;
          }
        }

        if (injected > 0) {
          console.debug(
            `[AUN] Injected ${injected} hidden input(s) for ${node.type} #${node.id}`,
          );
        }
      }
    } catch (err) {
      console.warn("[AUN] graphToPrompt patch error:", err);
    }
    return result;
  };
  console.debug("[AUN] graphToPrompt patched");
}

// --- Patch timing: apply as early as possible, with fallbacks ---

// 1. Immediate: app.graphToPrompt usually exists when custom extensions load
if (app.graphToPrompt) {
  patchGraphToPrompt();
} else {
  // 2. Fallback: hook into app lifecycle
  const origInit = app.init?.bind(app);
  if (typeof origInit === "function") {
    app.init = async function (...args) {
      const r = await origInit(...args);
      patchGraphToPrompt();
      return r;
    };
  }
}

// 3. Also patch from registerExtension (guaranteed to run after app is ready)
app.registerExtension({
  name: "AUN.fixPromptMissingInputs",
  beforeRegisterNodeDef() {
    patchGraphToPrompt();
  },
});
