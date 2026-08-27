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

function getWidgetValue(w, node) {
  try {
    if (typeof w.serializeValue === "function") {
      return w.serializeValue(node, 0);
    }
  } catch (_) {}
  return w.value;
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
