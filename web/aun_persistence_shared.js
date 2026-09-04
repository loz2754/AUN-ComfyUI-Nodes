export const AUN_PROPS_KEY = "_aun_values";

const shouldCapture = (w) =>
  !!w &&
  !w.__AUN_removed &&
  w.name != null &&
  w.serialize !== false &&
  w.options?.serialize !== false;

function cloneValue(value) {
  if (value == null || typeof value !== "object") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

export function captureAunWidgetValues(node) {
  // Never capture during workflow load: widgets may still hold defaults
  // (the frontend applies saved widgets_values after our load hooks), and
  // a load-time capture poisons properties._aun_values — later restores
  // then overwrite the real saved values with defaults. Callers set
  // node.__AUN_loadStabilizing around their load path.
  if (node?.__AUN_loadStabilizing) return;
  const all = node?.__AUN_allWidgets;
  if (!Array.isArray(all)) return;
  node.properties = node.properties || {};
  const map = {};
  const previous = node.properties[AUN_PROPS_KEY];
  for (const w of all) {
    if (!shouldCapture(w)) continue;
    const cloned = cloneValue(w.value);
    if (
      cloned !== null &&
      typeof cloned === "object" &&
      !Array.isArray(cloned) &&
      Object.keys(cloned).length === 0 &&
      w.type !== "combo" &&
      w.type !== "converted-widget"
    ) {
      // Frontend ≥ v1.53.4 can hand back Proxy/{} for detached widget values.
      // Capturing that would poison the snapshot the prompt shim falls back
      // to — keep the previous good value instead.
      if (
        previous &&
        typeof previous === "object" &&
        w.name in previous
      ) {
        map[w.name] = previous[w.name];
        continue;
      }
    }
    map[w.name] = cloned;
  }
  node.properties[AUN_PROPS_KEY] = map;
}

function valueFitsWidgetType(widget, value) {
  if (value === undefined || value === null) return true;
  const t = widget?.type;
  if (t === "combo") {
    if (typeof value === "string") return true;
    if (Array.isArray(value)) return true;
    if (typeof value === "object") return true;
    return false;
  }
  if (t === "number" || t === "slider") {
    if (typeof value === "number") return true;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed !== "" && Number.isFinite(Number(trimmed));
    }
    return false;
  }
  if (t === "toggle") {
    return (
      typeof value === "boolean" ||
      value === "true" ||
      value === "false" ||
      value === 0 ||
      value === 1
    );
  }
  return true;
}

export function restoreAunWidgetValues(node) {
  const map = node?.properties?.[AUN_PROPS_KEY];
  if (!map || typeof map !== "object") return;
  const all = node?.__AUN_allWidgets;
  if (!Array.isArray(all)) return;
  for (const w of all) {
    if (!shouldCapture(w) || !(w.name in map)) continue;
    const saved = map[w.name];
    if (w.value === saved) continue;
    // Skip type-impossible values: files saved by buggy builds carry
    // positionally-misapplied garbage in _aun_values. Falling back to the
    // already-applied widgets_values (which are correct) self-heals them.
    if (!valueFitsWidgetType(w, saved)) continue;
    w.value = saved;
  }
}
