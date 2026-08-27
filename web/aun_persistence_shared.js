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
  const all = node?.__AUN_allWidgets;
  if (!Array.isArray(all)) return;
  node.properties = node.properties || {};
  const map = {};
  for (const w of all) {
    if (!shouldCapture(w)) continue;
    map[w.name] = cloneValue(w.value);
  }
  node.properties[AUN_PROPS_KEY] = map;
}

export function restoreAunWidgetValues(node) {
  const map = node?.properties?.[AUN_PROPS_KEY];
  if (!map || typeof map !== "object") return;
  const all = node?.__AUN_allWidgets;
  if (!Array.isArray(all)) return;
  for (const w of all) {
    if (!shouldCapture(w) || !(w.name in map)) continue;
    const saved = map[w.name];
    if (w.value !== saved) w.value = saved;
  }
}
