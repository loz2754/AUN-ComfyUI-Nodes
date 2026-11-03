/**
 * AUN Split Bundle — browser side.
 *
 * One node, two ways to read a bundle:
 *
 *  - wire a `bundle` output in — the pins follow that bundle's fields;
 *  - turn `get` on and name a constant — the browser resolves the name to
 *    the node that sets it (nearest graph first, then outward) and wires
 *    the run to that node's bundle output, with no wire on the canvas.
 *
 * Bundles are plain dicts. The field names come from the producing node's
 * `aunBundleNames` hook (older AUN nodes still expose `obvpmBundleNames`),
 * so this node needs no external pack.
 *
 * The hidden `fields` widget is the contract with the server: a JSON list
 * in pin order. The server returns `bundle.get(name)` for each entry, so
 * pin N always matches field N.
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
  ConstantRefusal,
  applyGeneratedTitle,
  eachGraphLink,
  fieldsOf,
  isNodeType,
  outputIsWired,
  pathToGraph,
  registerPromptPass,
  resolveConstantSource,
  setNameOf,
  sourceOf,
  titleOf,
  visibleConstantNames,
  walkPromptNodes,
  wiredOutputNames,
} from "./aun_bundle_constants.js";
import {
  createDialog,
  dialogButton,
  dragGrip,
  emptyHint,
  enableDragReorder,
  sectionLabel,
} from "./aun_dialog_shared.js";

const NODE_TYPE = "AUNSplitBundle";
const MAX_OUTPUTS = 32;                 // mirrors AUNSplitBundle.MAX_OUTPUTS
const FIELDS_WIDGET = "fields";
const TITLE_PROP = "aun_split_title";   // the title to put back
const ORDER_PROP = "aun_split_order";   // saved output order, by field name
const HIDDEN_PROP = "aun_split_hidden"; // field names with no output pin
const SETTINGS_BUTTON = "__aun_split_settings";
const DIALOG_CLASS = "AUN-split-dialog";

// ── Widgets ───────────────────────────────────────────────────────────

function getMode(node) {
  const raw = getWidget(node, "get")?.value;
  return raw === true || raw === 1 || raw === "true";
}

function constantName(node) {
  return String(getWidget(node, "constant")?.value ?? "").trim();
}

/** The saved output order (field names), or [] for the bundle's own order. */
function fieldOrder(node) {
  const saved = node?.properties?.[ORDER_PROP];
  return Array.isArray(saved) ? saved.map((name) => String(name)) : [];
}

/**
 * Put the saved field order first, keeping any field the order does not
 * mention in the bundle's own order after it. New fields therefore appear
 * at the end instead of being lost or shoved into the middle.
 */
function applyFieldOrder(node, names) {
  const order = fieldOrder(node);
  if (!order.length) return names;
  const rank = new Map(order.map((name, index) => [name, index]));
  const known = names.filter((name) => rank.has(name))
    .sort((a, b) => rank.get(a) - rank.get(b));
  const rest = names.filter((name) => !rank.has(name));
  return [...known, ...rest];
}

/** The `get` toggle decides whether the constant picker is shown. */
function applyConstantVisibility(node) {
  const widget = getWidget(node, "constant");
  if (widget) applyWidgetHiddenState(widget, !getMode(node));
}

/** The drop-down entries: the empty "use the wire" option, then setters. */
function constantChoices(node) {
  const names = visibleConstantNames(node).map((entry) => entry.name);
  const current = String(getWidget(node, "constant")?.value ?? "").trim();
  if (current && !names.includes(current)) names.unshift(current);
  return ["", ...names];
}

/**
 * The `constant` widget must be a real combo to get a drop-down, and the
 * frontend picks a widget's control when it is created — changing `type`
 * on the server's STRING widget only leaves a text box. This swaps it for
 * a combo in the same slot. Same recipe as OBVPM's asCombo():
 *
 *  - the old widget comes OUT before the combo goes in, or the frontend
 *    renames the new one to `constant#1` and nothing finds it again;
 *  - `options.values` is a function, so the list is read when the menu
 *    opens and never goes stale;
 *  - the combo goes back at the old index, because widgets_values is
 *    positional.
 */
function ensureConstantCombo(node) {
  const widgets = node.widgets ?? [];
  const index = widgets.findIndex((widget) => widget?.name === "constant");
  if (index < 0) return null;
  const old = widgets[index];

  if (old.type === "combo") {
    old.options = old.options || {};
    old.options.values = () => constantChoices(node);
    return old;
  }

  const value = String(old.value ?? "");
  widgets.splice(index, 1);
  let combo = null;
  try {
    combo = node.addWidget?.(
      "combo", "constant", value, () => {}, {
        values: () => constantChoices(node),
      },
    ) ?? null;
  } catch (err) {
    combo = null;
  }
  if (!combo) {
    widgets.splice(index, 0, old);        // put the string widget back
    return old;
  }

  combo.value = value;                    // through to the surviving state
  combo.serialize = true;
  if (old.tooltip) combo.tooltip = old.tooltip;
  const appended = widgets.indexOf(combo);
  if (appended >= 0) widgets.splice(appended, 1);
  widgets.splice(index, 0, combo);
  combo.__aunSplitCombo = true;
  return combo;
}

/** Rebuild the pins only when the plan the graph now resolves to changed. */
function pollPlan(node) {
  const resolved = resolveNames(node);
  const current = parseFieldWidget(node);
  const next = resolved ?? [];
  if (next.length === current.length
      && next.every((name, index) => name === current[index])) {
    return;
  }
  syncOutputs(node);
}

function warnOnce(node, key, message) {
  const warned = (node.__aunSplitWarned ??= new Set());
  if (warned.has(key)) return;
  warned.add(key);
  console.warn("[AUN] Split Bundle:", message);
}

function parseFieldWidget(node) {
  const text = String(getWidget(node, FIELDS_WIDGET)?.value ?? "").trim();
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data.map((name) => String(name)) : [];
  } catch (err) {
    return [];
  }
}

function writeFieldWidget(node, names) {
  const widget = getWidget(node, FIELDS_WIDGET);
  if (!widget) return;
  const text = JSON.stringify(names ?? []);
  if (widget.value === text) return;
  widget.value = text;
  node.setDirtyCanvas?.(true, true);
}

// ── Resolving field names ─────────────────────────────────────────────

/** The field names coming from the wired bundle (no order, no hiding). */
function wiredInputNames(node) {
  const input = (node.inputs ?? []).find((item) => item?.name === "bundle");
  if (!input) return null;
  const source = sourceOf(node, input);
  return source ? fieldsOf(source.node, source.slot) : null;
}

/** A saved list of field names, as a Set. */
function savedFields(node, prop) {
  const saved = node?.properties?.[prop];
  return new Set(Array.isArray(saved) ? saved.map((name) => String(name)) : []);
}

/**
 * Where each field's wires go, by field name, taken BEFORE any slot is
 * renamed. A pin that changes position can then take its wires with it.
 */
function snapshotWires(node) {
  const names = (node?.outputs ?? []).map((out) => String(out?.name ?? ""));
  const wires = new Map();
  eachGraphLink(node?.graph, (link) => {
    if (!link || link.origin_id !== node.id) return;
    const name = names[link.origin_slot] ?? "";
    if (!name) return;
    let list = wires.get(name);
    if (!list) wires.set(name, list = []);
    list.push({
      link,
      to: node.graph?.getNodeById?.(link.target_id) ?? null,
      toSlot: link.target_slot,
    });
  });
  return wires;
}

/**
 * Put every field's wires on the pin that field occupies now. The frontend
 * replaces the wire into an input through connect(); assigning a slot's
 * link list would disconnect whatever is not in it. A link into a subgraph
 * output has no target node, so its origin slot is retargeted directly.
 */
function moveWires(node, fields, wires) {
  const at = new Map(fields.map((name, index) => [name, index]));
  for (const [name, list] of wires) {
    const to = at.get(name);
    if (to == null) continue;
    for (const wire of list) {
      if (wire.link?.origin_slot === to) continue;
      let moved = false;
      if (wire.to && typeof node.connect === "function") {
        try {
          moved = node.connect(to, wire.to, wire.toSlot) != null;
        } catch (err) {
          moved = false;
        }
      }
      if (!moved) {
        try {
          wire.link.origin_slot = to;
        } catch (err) {
          /* a read-only link is not ours to move */
        }
      }
    }
  }
}

/** The field names the source offers, in the bundle's own order. */
function sourceNames(node) {
  const name = constantName(node);
  if (getMode(node) && name) {
    const source = resolveConstantSource(node, name);
    if (source.error) {
      warnOnce(node, `constant:${name}`, `${source.error}.`);
      return null;
    }
    const names = fieldsOf(source.node, source.slot);
    if (!names) {
      warnOnce(
        node, `constant-names:${name}`,
        `'${titleOf(source.node)}' does not publish its field names, so `
        + "the outputs cannot be named.",
      );
      return null;
    }
    return names;
  }
  return wiredInputNames(node);
}

/**
 * The field names this node should show: the saved order applied, then the
 * hidden ones removed. A hidden field that still has a wire is kept, so a
 * stale saved list can never silently drop a connection.
 */
function resolveNames(node) {
  const names = sourceNames(node);
  if (!names) return names;
  const ordered = applyFieldOrder(node, names);
  const hidden = savedFields(node, HIDDEN_PROP);
  if (!hidden.size) return ordered;
  const wired = wiredOutputNames(node);
  return ordered.filter((name) => !hidden.has(name) || wired.has(name));
}

/**
 * Write the plan and rebuild the output pins.
 *
 * `keepSaved` is for loading only: until the wire or the named setter is
 * back in the graph, the saved `fields` list keeps the pins in place. In
 * normal editing a source that cannot be read clears the plan, so the node
 * never keeps showing (or running with) the previous bundle's fields.
 *
 * `resize` is off while loading, so a saved node keeps the size the user
 * gave it; it only follows the pin count when the plan itself changes.
 */
function syncOutputs(node, { keepSaved = false, resize = true } = {}) {
  const resolved = resolveNames(node);
  const saved = keepSaved ? parseFieldWidget(node) : [];
  const plan = (resolved?.length ? resolved : saved).slice(0, MAX_OUTPUTS);
  writeFieldWidget(node, resolved?.length ? plan : (keepSaved ? plan : []));
  const signature = plan.join("\u0000");
  const changed = node.__aunSplitPlan !== signature;
  node.__aunSplitPlan = signature;

  // Snapshot each field's wires by NAME before anything moves, then make
  // the pins follow the plan. Reordering therefore takes a field's wire
  // with it, and hiding removes a pin only after its neighbours' wires
  // have been re-homed.
  const wires = snapshotWires(node);

  const fields = plan.slice();
  const known = new Set(fields);
  for (const name of wires.keys()) {
    if (known.has(name) || fields.length >= MAX_OUTPUTS) continue;
    known.add(name);
    fields.push(name);      // a wired field the plan dropped still gets a pin
  }

  while ((node.outputs?.length ?? 0) < fields.length) {
    node.addOutput(`field_${(node.outputs?.length ?? 0) + 1}`, "*");
  }

  (node.outputs ?? []).forEach((out, index) => {
    const field = fields[index];
    if (!out || !field) return;
    out.name = field;
    out.label = field;
    out.localized_name = undefined;
    out.type = "*";
  });

  moveWires(node, fields, wires);

  // Trailing surplus goes after the wires have moved, so the slot a link
  // is leaving is still there while it is re-homed. Wired pins are kept.
  for (let i = (node.outputs?.length ?? 0) - 1; i >= fields.length; i--) {
    if (outputIsWired(node, i)) break;
    try {
      node.removeOutput(i);
    } catch (err) {
      node.outputs?.splice?.(i, 1);
    }
  }
  if (resize && changed) {
    fitNodeSize(node);
    // Some frontends settle the widget layout one frame later; fit again
    // then, so a shrink lands even when the first measure is still tall.
    requestAnimationFrame(() => {
      if (node.__aunSplitReady) fitNodeSize(node);
    });
  }
  updateSettingsLabel(node, plan.length);
  node.setDirtyCanvas?.(true, true);
}

// ── Title ─────────────────────────────────────────────────────────────

/** The node's display name, from its registration (`nodeData`). */
let NODE_DISPLAY = "Split Bundle";

function applyTitle(node) {
  applyGeneratedTitle(node, {
    prop: TITLE_PROP,
    prefix: "Get",
    name: getMode(node) ? constantName(node) : "",
    display: NODE_DISPLAY,
  });
}

// ── Field order dialog ────────────────────────────────────────────────

function settingsButton(node) {
  return getWidget(node, SETTINGS_BUTTON);
}

function updateSettingsLabel(node, count = null) {
  const button = settingsButton(node);
  if (!button) return;
  const total = count == null ? (resolveNames(node) ?? []).length : count;
  const label = total ? `Fields… (${total})` : "Fields…";
  if (button.label === label && button.value === label) return;
  button.label = label;
  button.value = label;
  node.setDirtyCanvas?.(true, true);
}

/** Add the button that opens the field-order dialog. */
function installSettingsUi(node) {
  if (settingsButton(node)) {
    updateSettingsLabel(node);
    return;
  }
  if (node.__aunSplitNoButton) return;      // this frontend has no addWidget
  try {
    const button = node.addWidget(
      "button", SETTINGS_BUTTON, "Fields…",
      () => openSettingsDialog(node),
    );
    if (button) {
      button.serialize = false;
      button.options ??= {};
    }
  } catch (err) {
    node.__aunSplitNoButton = true;
    console.warn("[AUN] Split Bundle: could not add the fields button:", err);
  }
  updateSettingsLabel(node);
}

/**
 * Reorder the output pins and choose which fields get one. Both choices
 * are stored by field name in `properties`, so they survive a reload, a
 * setter rename, and a bundle that grows; a field added later is appended
 * and shown by default. Nothing is written until OK.
 */
function openSettingsDialog(node) {
  const natural = sourceNames(node) ?? [];       // the bundle's own order
  let order = applyFieldOrder(node, natural);    // saved order, hidden too
  const hidden = savedFields(node, HIDDEN_PROP);
  const wired = wiredOutputNames(node);

  const { overlay, panel, foot, close } = createDialog(
    DIALOG_CLASS, "Split Bundle — fields", { width: 540 },
  );

  const list = document.createElement("div");
  list.style.cssText = [
    "overflow:auto", "max-height:52vh", "min-height:48px", "padding:2px 0 8px",
  ].join(";");

  const count = document.createElement("div");
  count.style.cssText = "padding:0 14px 6px;color:#999;font-size:12px";

  const redraw = () => {
    const shown = order.filter((field) => !hidden.has(field)).length;
    count.textContent = `${shown} of ${order.length} field`
      + `${order.length === 1 ? "" : "s"} shown`;

    list.replaceChildren();
    if (!order.length) {
      list.append(emptyHint(
        "This node has no fields yet — wire a bundle or pick a constant "
        + "first. Fields that appear later go after the ones ordered here.",
      ));
      return;
    }

    let pin = 0;
    order.forEach((field, index) => {
      const isHidden = hidden.has(field);
      if (!isHidden) pin += 1;
      const isWired = wired.has(field);

      const row = document.createElement("div");
      row.draggable = true;
      row.dataset.dragIndex = String(index);
      row.style.cssText = [
        "display:flex", "align-items:center", "gap:10px",
        "padding:5px 14px", "cursor:grab",
        isHidden ? "opacity:.6" : "",
      ].join(";");

      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !isHidden;
      box.disabled = isWired;
      box.title = isWired
        ? "Has a connection — unplug it before hiding this field."
        : "Shown as an output pin.";
      box.addEventListener("change", () => {
        if (box.checked) hidden.delete(field);
        else hidden.add(field);
        redraw();
      });

      const name = document.createElement("span");
      name.textContent = field;
      name.style.cssText = [
        "flex:1", "min-width:0", "overflow-wrap:anywhere", "font-weight:600",
        isHidden ? "text-decoration:line-through;color:#888" : "",
      ].join(";");

      const slot = document.createElement("span");
      slot.textContent = isHidden ? "hidden" : `pin ${pin}`;
      slot.style.cssText = "color:#999;font-variant-numeric:tabular-nums";

      row.append(dragGrip(), box, name, slot);
      list.append(row);
    });
  };

  const moveTo = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    if (from >= order.length || to >= order.length) return;
    const [field] = order.splice(from, 1);
    order.splice(to, 0, field);
    redraw();
  };

  enableDragReorder(list, moveTo);

  const reset = dialogButton("Reset order", () => {
    order = [...natural];
    redraw();
  });
  const selectAll = dialogButton("Select all", () => {
    hidden.clear();
    redraw();
  });
  selectAll.title = "Give every field an output pin.";
  const selectNone = dialogButton("Select none", () => {
    // A wired field cannot lose its pin, so it stays ticked.
    for (const field of order) {
      if (!wired.has(field)) hidden.add(field);
    }
    redraw();
  });
  selectNone.title = "Untick every field that has no connection. Wired "
    + "fields keep their pin.";
  const cancel = dialogButton("Cancel", close);
  cancel.style.marginLeft = "auto";
  const ok = dialogButton("OK", () => {
    const props = (node.properties ??= {});
    props[ORDER_PROP] = [...order];
    const keepHidden = [...hidden].filter((field) => order.includes(field));
    if (keepHidden.length) props[HIDDEN_PROP] = keepHidden;
    else delete props[HIDDEN_PROP];
    close();
    syncOutputs(node);
    forceRedraw(node, app);
  }, { accent: true });

  foot.append(reset, selectAll, selectNone, cancel, ok);
  panel.append(
    sectionLabel("Output pins — drag to reorder, untick to hide"),
    list,
    count,
    foot,
  );
  document.body.append(overlay);
  redraw();
}

// ── Prompt pass: constant name -> ordinary bundle input ───────────────

function injectSplit(output, root) {
  walkPromptNodes(output, root, NODE_TYPE, (node, entry) => {
    const inputs = (entry.inputs ??= {});
    // Always send the plan the graph shows now. Leaving the widget's saved
    // value here is what made a run repeat an old bundle's fields after
    // the source changed or was removed.
    const names = resolveNames(node) ?? [];
    inputs.fields = JSON.stringify(names.slice(0, MAX_OUTPUTS));

    if (!getMode(node)) return;
    const name = constantName(node);
    if (!name) return;              // `get` on with no name: use the wire

    const source = resolveConstantSource(node, name);
    if (source.error) {
      throw new ConstantRefusal(`Split Bundle: ${source.error}.`);
    }
    if (source.skipped) {
      // Keep the pins, drop the values: muted/bispassed source.
      delete inputs.bundle;
      return;
    }
    const graph = source.graph ?? source.node?.graph;
    const path = pathToGraph(graph, node.graph);
    if (!path) {
      throw new ConstantRefusal(
        `Split Bundle: the constant '${name}' is set in a graph this node `
        + "cannot reach.",
      );
    }
    const id = [...path, source.node.id].join(":");
    if (!output[id]) {
      throw new ConstantRefusal(
        `Split Bundle: '${name}' resolves to '${titleOf(source.node)}', `
        + "which is not in the prompt.",
      );
    }
    inputs.bundle = [id, source.slot];
  });
}

// ── UI ────────────────────────────────────────────────────────────────

function installUi(node) {
  applyWidgetHiddenState(getWidget(node, FIELDS_WIDGET), true);
  ensureConstantCombo(node);
  applyConstantVisibility(node);
  installSettingsUi(node);

  for (const name of ["get", "constant"]) {
    const widget = getWidget(node, name);
    if (!widget || widget.__aunSplitWired) continue;
    widget.__aunSplitWired = true;
    chainWidgetCallback(widget, () => {
      applyConstantVisibility(node);
      applyTitle(node);
      syncOutputs(node);
      requestAnimationFrame(() => {
        if (node.__aunSplitReady) fitNodeSize(node);
      });
    });
  }
  applyTitle(node);
}

// ── "Add Split Bundle (get)" on every setter ─────────────────────────

/** Whether a node definition declares the `set` name widget. */
function declaresSetInput(nodeData) {
  const inputs = nodeData?.input ?? {};
  for (const group of ["required", "optional"]) {
    const spec = inputs[group]?.set;
    if (!spec) continue;
    const type = Array.isArray(spec) ? spec[0] : spec?.type;
    if (type === "STRING" || type === "COMBO") return true;
  }
  return false;
}

/** Create a Split Bundle reading this setter by name, to its right. */
function addSplitBundleFor(setter) {
  const name = setNameOf(setter);
  const graph = setter?.graph ?? app.graph;
  const lite = globalThis.LiteGraph;
  if (!name || !graph || !lite?.createNode) return;

  const split = lite.createNode(NODE_TYPE);
  if (!split) return;

  split.pos = [
    (setter.pos?.[0] ?? 0) + (setter.size?.[0] ?? 200) + 40,
    setter.pos?.[1] ?? 0,
  ];
  graph.add(split);

  const get = getWidget(split, "get");
  const constant = getWidget(split, "constant");
  if (get) get.value = true;
  if (constant) constant.value = name;

  // nodeCreated may already have run (on add); sync so the title and pins
  // appear now. Otherwise it picks the values up when it runs.
  if (typeof split.__aunSplitSync === "function") {
    split.__aunSplitSync();
  } else {
    applyTitle(split);
    syncOutputs(split);
  }

  app.canvas?.selectNode?.(split, false);
  split.setDirtyCanvas?.(true, true);
  graph.setDirtyCanvas?.(true, true);
}

/** Right-click item on any node that sets a constant (AUN, OBVPM, KJ). */
function installAddSplitMenu(nodeType) {
  const proto = nodeType?.prototype;
  if (!proto || proto.__aunAddSplitMenu) return;
  proto.__aunAddSplitMenu = true;

  const base = proto.getExtraMenuOptions;
  proto.getExtraMenuOptions = function (canvas, options) {
    const result = base?.apply(this, arguments);
    if (!Array.isArray(options)) return result;
    options.unshift({
      content: "Add Split Bundle (get)",
      disabled: !setNameOf(this),
      callback: () => addSplitBundleFor(this),
    }, null);
    return result;
  };
}

app.registerExtension({
  name: "AUNNodes.SplitBundle",

  setup() {
    registerPromptPass("Split Bundle", (output, root) => {
      injectSplit(output, root);
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) {
      // Setters (AUN, OBVPM's Bundle/Value Presets, KJ Set) get a
      // right-click shortcut to a Split Bundle that reads them by name.
      if (nodeData.name === "SetNode" || declaresSetInput(nodeData)) {
        installAddSplitMenu(nodeType);
      }
      return;
    }
    NODE_DISPLAY = nodeData.display_name || NODE_DISPLAY;
    const proto = nodeType.prototype;

    // A programmatic `constant`/`get` change (paste, load) does not always
    // reach the widget callback; this does.
    const baseWidgetChanged = proto.onWidgetChanged;
    proto.onWidgetChanged = function (name) {
      const result = baseWidgetChanged?.apply(this, arguments);
      if (name === "get" || name === "constant") {
        applyConstantVisibility(this);
        applyTitle(this);
        syncOutputs(this);
        requestAnimationFrame(() => {
          if (this.__aunSplitReady) fitNodeSize(this);
        });
      }
      return result;
    };

    const baseConnections = proto.onConnectionsChange;
    proto.onConnectionsChange = function () {
      const result = baseConnections?.apply(this, arguments);
      if (this.__aunSplitReady) {
        requestAnimationFrame(() => {
          if (!this.__aunSplitReady) return;
          syncOutputs(this);
        });
      }
      return result;
    };

    // Setters can be added, renamed or deleted while the node sits still,
    // and none of those changes reach this node. Poll on draw instead, at
    // most once a second, and only rebuild when the plan really changed.
    const baseDraw = proto.onDrawForeground;
    proto.onDrawForeground = function () {
      const result = baseDraw?.apply(this, arguments);
      if (!this.__aunSplitReady) return result;
      const now = Date.now();
      const last = this.__aunSplitRefreshAt ?? 0;
      if (now - last < 1000) return result;
      this.__aunSplitRefreshAt = now;
      pollPlan(this);
      return result;
    };

    const baseConfigure = proto.onConfigure;
    proto.onConfigure = function () {
      // A configured node is a loaded/duplicated one: keep its saved size.
      this.__aunSplitConfigured = true;
      const result = baseConfigure?.apply(this, arguments);
      // After the saved pins and links are back in place.
      requestAnimationFrame(() => {
        if (!this.__aunSplitReady) return;
        installUi(this);
        syncOutputs(this, { keepSaved: true, resize: false });
      });
      return result;
    };
  },

  nodeCreated(node) {
    if (!isNodeType(node, NODE_TYPE)) return;
    node.__aunSplitReady = true;
    node.__aunSplitSync = () => {
      installUi(node);
      syncOutputs(node);
      forceRedraw(node, app);
    };
    installUi(node);
    syncOutputs(node, { keepSaved: true, resize: false });
    // nodeCreated can run before the node is in its graph, when the setter
    // list is not visible yet; one frame later it is. If this node is not
    // being loaded from a workflow, it opens at its content size.
    requestAnimationFrame(() => {
      if (!node.__aunSplitReady) return;
      installUi(node);
      syncOutputs(node, { keepSaved: true, resize: false });
      if (!node.__aunSplitConfigured) fitNodeSize(node, { fitWidth: true });
    });
  },
});

