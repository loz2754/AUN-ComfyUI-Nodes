// The AUN card: one DOM panel that stands in for a node's classic canvas
// widgets, in the style of AusBoss's node cards (MIT, github.com/ausboss).
//
// The widgets stay the single source of truth: every row mirrors one hidden
// standard widget (or a pair of them), writes its value and runs its own
// callback, and re-reads everything on configure, on connection changes and
// after any callback. Save/load, undo, API prompts and widget-to-input links
// keep working through the widgets.
//
// Rows:
//   { widget, label?, kind?, labels?, suffix?, title?, when?, group?, step?,
//     decimals?, pixels?, snap?, button? }
//   { pair: [name, name], label, suffixes?: [a, b], sep?, when?, group? }
//   { section: "Caption" }
//   { group: "more", label: "More" }
//   { panel: (node, helpers) => ({ element, sync(values) }), height, when? }

import { app } from "../../scripts/app.js";
import { applyWidgetHiddenState, chainWidgetCallback, getWidget } from "./widgets.js";
import { CONTROL_HEIGHT, FONT_UI, RADIUS_CARD, RADIUS_CONTROL, RADIUS_XS, SELECT_CHEVRON, THEME as T } from "./aun_card_theme.js";
import { makeScrubInput, scrubSteps } from "./aun_card_scrub.js";

export const CARD_WIDGET = "aun_widget_card";

const CSS_ID = "aun-card-css";
const ROW_HEIGHT = 26;
const ROW_GAP = 5;
const SECTION_HEIGHT = 17;
const GROUP_HEIGHT = 22;
const CARD_PADDING = 7;
const WRAPPER_INSET = 16;
const WRAPPER_TOP = 10;
const SLOT_OFFSET = 10;
const SWITCH_LABEL_MAX = 14;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement("style");
  style.id = CSS_ID;
  style.textContent = `
.aun-card{position:relative;box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;gap:${ROW_GAP}px;padding:${CARD_PADDING}px 8px;overflow:hidden;border-radius:${RADIUS_CARD}px;background:${T.card};font:12px/1.3 ${FONT_UI};color:${T.inkSoft};pointer-events:none}
.aun-card-row{display:grid;grid-template-columns:minmax(56px,30%) 1fr;align-items:center;gap:8px;height:${ROW_HEIGHT}px;flex:none;pointer-events:auto}
.aun-card-row.hidden{display:none}
.aun-card-row.linked{opacity:.5}
.aun-card-row.linked .aun-card-control{pointer-events:none}
.aun-card-row.area{display:block}
.aun-card-row.panel{display:block;height:auto}
.aun-card-row.panel.hidden{display:none}
.aun-card-label{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:${T.label};font-size:11px;user-select:none}
.aun-card-control{display:flex;align-items:center;gap:6px;min-width:0;height:100%}
.aun-card-field{display:flex;align-items:center;gap:6px;flex:1 1 0;min-width:0;height:100%}
.aun-card-field.linked{opacity:.5;pointer-events:none}
.aun-card .aun-scrub{height:${CONTROL_HEIGHT}px}
.aun-card-field>.aun-scrub{flex:1 1 0;width:auto;min-width:0}
.aun-card-field>.aun-scrub .aun-scrub-input{width:100%}
.aun-card-sep{flex:none;color:${T.faint};font-size:11px}
.aun-card-section{height:${SECTION_HEIGHT}px;flex:none;display:flex;align-items:flex-end;gap:8px;color:${T.faint};font:600 10px/1 ${FONT_UI};letter-spacing:.1em;text-transform:uppercase;user-select:none}
.aun-card-section::after{content:"";flex:1;height:1px;margin-bottom:4px;background:${T.rule}}
.aun-card-section.hidden{display:none}
.aun-card-group{height:${GROUP_HEIGHT}px;flex:none;display:flex;align-items:center;gap:6px;padding:0 4px;border:1px solid transparent;border-radius:${RADIUS_CONTROL}px;background:transparent;color:${T.faint};font:600 10px/1 ${FONT_UI};letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-align:left;pointer-events:auto}
.aun-card-group:hover{color:${T.inkHover}}
.aun-card-group .glyph{display:inline-block;width:10px;transition:transform .12s}
.aun-card-group.open .glyph{transform:rotate(90deg)}
.aun-card-row.hidden{display:none}
.aun-card-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;width:100%;height:${ROW_HEIGHT}px;padding:2px;box-sizing:border-box;border:1px solid transparent;border-radius:${RADIUS_CONTROL}px;background:${T.fill}}
.aun-card-seg button{min-width:0;border:none;border-radius:${RADIUS_XS}px;padding:0 2px;background:transparent;color:${T.label};font:600 11px/1 ${FONT_UI};cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aun-card-seg button:hover{color:${T.inkHover}}
.aun-card-seg button.on{background:${T.brand};color:${T.onBrand}}
.aun-card-bool button.on:first-child{background:${T.switchOff};color:${T.ink}}
.aun-card-select{width:100%;height:${ROW_HEIGHT}px;padding:0 24px 0 8px;box-sizing:border-box;border:1px solid transparent;border-radius:${RADIUS_CONTROL}px;background:${T.fill} ${SELECT_CHEVRON} no-repeat right 9px center;color:${T.ink};font:500 12px ${FONT_UI};appearance:none;-webkit-appearance:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;min-width:0}
.aun-card-select:hover{background-color:${T.fillHover}}
.aun-card-select:focus-visible{outline:2px solid ${T.brand};outline-offset:1px}
.aun-card-text{width:100%;height:${ROW_HEIGHT}px;padding:0 8px;box-sizing:border-box;border:1px solid transparent;border-radius:${RADIUS_CONTROL}px;background:${T.fill};color:${T.ink};font:12px ${FONT_UI};min-width:0}
.aun-card-text:focus{outline:none;border-color:${T.brand}}
.aun-card-text::placeholder{color:${T.faint}}
.aun-card-btn{flex:none;height:${ROW_HEIGHT}px;padding:0 10px;border:1px solid transparent;border-radius:${RADIUS_CONTROL}px;background:${T.fill};color:${T.inkSoft};font:600 11px/1 ${FONT_UI};cursor:pointer;white-space:nowrap}
.aun-card-btn:hover{background:${T.fillHover};color:${T.inkHover}}
.aun-card-btn:focus-visible{outline:2px solid ${T.brand};outline-offset:1px}
.aun-card-panel{width:100%;min-width:0;pointer-events:auto}
.aun-card-panel.hidden{display:none}
.aun-card-note{color:${T.faint};font:11px/1.2 ${FONT_UI}}
.aun-card-note b{color:${T.inkSoft};font-weight:600}
.aun-card-empty{color:${T.faint};font:11px/1.2 ${FONT_UI}}
`;
  document.head.append(style);
}

function el(tag, className = "", text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** The choices a combo widget offers. */
export function comboValues(widget) {
  const values = widget?.options?.values;
  if (typeof values === "function") return values(widget) ?? [];
  if (Array.isArray(values)) return values;
  if (Array.isArray(widget?.values)) return widget.values;
  return [];
}

/** Write a value the way LiteGraph's own widgets do. */
export function commitWidgetValue(node, widget, value) {
  const previous = widget.value;
  widget.value = value;
  widget.callback?.(value, app.canvas, node);
  node.onWidgetChanged?.(widget.name, value, previous, widget);
}

function tooltipFor(node, name) {
  const data = node?.constructor?.nodeData
    ?? globalThis.LiteGraph?.registered_node_types?.[node?.type]?.nodeData;
  const spec = data?.input?.required?.[name] ?? data?.input?.optional?.[name];
  return spec?.[1]?.tooltip ?? "";
}

function widgetSlot(node, name) {
  return node.inputs?.find((input) => input?.widget?.name === name || input?.name === name) ?? null;
}

function widgetLinked(node, name) {
  const slot = widgetSlot(node, name);
  return Boolean(slot && slot.link !== null && slot.link !== undefined);
}

function isFloatWidget(widget) {
  const precision = widget?.options?.precision;
  if (precision !== undefined) return Number(precision) > 0;
  return widget?.type === "float" || !Number.isInteger(Number(widget?.value));
}

function rowNames(row) {
  if (!row) return [];
  return row.pair ?? (row.widget ? [row.widget] : []);
}

// Collapse a mirrored widget in both renderers: the classic canvas reads the
// hidden flags / zero size, Nodes 2.0 filters its list on options.hidden.
function hideMirrored(widget) {
  applyWidgetHiddenState(widget, true);
  if (widget.options) widget.options.hidden = true;
}

/**
 * Mount a card on `node`.
 * @returns {{refresh: Function, root: HTMLElement, state: object}}
 */
export function mountCard(node, { rows, minWidth = 320, hide = [] } = {}) {
  ensureCss();
  const root = el("div", "aun-card");
  const state = {
    node, root, rows: [], groups: {}, height: 0, widget: null,
    rowTop: new Map(), rowSpan: new Map(), autoHeight: null,
    disposed: false, byHand: false, socketed: [],
    userHeight: false, applyingSize: false,
  };
  node.__aunCard = state;

  const values = () => Object.fromEntries((node.widgets ?? []).map((widget) => [widget.name, widget.value]));
  const groupProperty = (name) => `_aunShow_${name}`;
  const groupOpen = (name) => Boolean(node.properties?.[groupProperty(name)]);
  const helpers = {
    values,
    linked: (name) => widgetLinked(node, name),
    setWidget: (name, value) => setWidget(name, value),
    comboValues,
    refresh: () => refresh(),
  };

  function setWidget(name, value) {
    const widget = getWidget(node, name);
    if (!widget || widget.value === value) return;
    commitWidgetValue(node, widget, value);
    node.graph?.setDirtyCanvas?.(true, true);
    refresh();
  }

  // ---- row builders ---------------------------------------------------

  const buildSelect = (row, name, into) => {
    const widget = getWidget(node, name);
    const select = el("select", "aun-card-select");
    let filled = "";
    const fill = (current) => {
      const options = comboValues(widget);
      const key = `${options.length}|${options[0] ?? ""}|${options[options.length - 1] ?? ""}|${current ?? ""}`;
      if (key === filled) return;
      filled = key;
      const list = options.includes(current) || current === undefined || current === "" ? options : [...options, current];
      select.textContent = "";
      for (const value of list) {
        const option = el("option", "", row.labels?.[value] ?? String(value));
        option.value = String(value);
        select.append(option);
      }
      select.value = String(current ?? "");
    };
    select.addEventListener("change", () => setWidget(name, select.value));
    into.append(select);
    return (vals) => fill(vals[name]);
  };

  const buildSegmented = (row, name, into) => {
    const widget = getWidget(node, name);
    const seg = el("div", "aun-card-seg");
    const buttons = new Map();
    const add = (value) => {
      const button = el("button", "", row.labels?.[value] ?? String(value));
      button.type = "button";
      button.title = row.title ?? tooltipFor(node, name);
      button.addEventListener("click", () => setWidget(name, value));
      seg.append(button);
      buttons.set(value, button);
    };
    for (const value of comboValues(widget)) add(value);
    into.append(seg);
    return (vals) => {
      const current = vals[name];
      if (typeof current === "string" && current !== "" && !buttons.has(current)) {
        add(current);
        buttons.get(current).classList.add("on");
      }
      for (const [value, button] of buttons) button.classList.toggle("on", current === value);
    };
  };

  const buildSwitch = (row, name, into) => {
    const seg = el("div", "aun-card-seg aun-card-bool");
    seg.setAttribute("role", "radiogroup");
    const label = (text, fallback) => (typeof text === "string" && text.length <= SWITCH_LABEL_MAX ? text : fallback);
    const buttons = new Map();
    for (const [value, text] of [[false, label(row.offText, "off")], [true, label(row.onText, "on")]]) {
      const button = el("button", "", text);
      button.type = "button";
      button.title = row.title ?? tooltipFor(node, name);
      button.addEventListener("click", () => setWidget(name, value));
      seg.append(button);
      buttons.set(value, button);
    }
    into.append(seg);
    return (vals) => {
      const on = Boolean(vals[name]);
      for (const [value, button] of buttons) {
        button.classList.toggle("on", value === on);
        button.setAttribute("aria-checked", String(value === on));
      }
    };
  };

  const buildText = (row, name, into) => {
    const widget = getWidget(node, name);
    const input = el("input", "aun-card-text");
    input.type = "text";
    input.placeholder = row.placeholder ?? "";
    input.spellcheck = false;
    input.title = row.title ?? tooltipFor(node, name);
    const commit = () => {
      if (input.value !== String(getWidget(node, name)?.value ?? "")) setWidget(name, input.value);
    };
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") input.blur();
      if (event.key === "Escape") { input.value = String(getWidget(node, name)?.value ?? ""); input.blur(); }
    });
    into.append(input);
    return (vals) => {
      if (document.activeElement !== input) input.value = String(vals[name] ?? "");
    };
  };

  const buildScrub = (row, name, into) => {
    const widget = getWidget(node, name);
    const isFloat = isFloatWidget(widget);
    const steps = scrubSteps(widget?.options, isFloat, row.pixels ?? row.suffix === "px");
    const control = makeScrubInput({
      value: Number(widget?.value) || 0,
      min: Number(widget?.options?.min ?? -Infinity),
      max: Number(widget?.options?.max ?? Infinity),
      step: row.step ?? steps.step,
      fineStep: steps.fineStep,
      decimals: row.decimals ?? steps.decimals,
      unit: row.suffix ?? "",
      snap: Boolean(row.snap),
      title: row.title ?? tooltipFor(node, name),
      onChange: (next) => setWidget(name, isFloat ? next : Math.round(next)),
    });
    into.append(control.root);
    return (vals) => control.set(Number(vals[name]) || 0);
  };

  const buildPair = (row, into) => {
    const fields = row.pair.map((name, index) => {
      const field = el("div", "aun-card-field");
      const sync = buildScrub({ ...row, suffix: row.suffixes?.[index] ?? "" }, name, field);
      into.append(field);
      if (index < row.pair.length - 1) into.append(el("span", "aun-card-sep", row.sep ?? "×"));
      return { name, field, sync };
    });
    const sync = (vals) => {
      for (const item of fields) {
        item.field.classList.toggle("linked", widgetLinked(node, item.name));
        item.sync(vals);
      }
    };
    sync.fields = fields;
    return sync;
  };

  // ---- build ----------------------------------------------------------

  for (const row of rows) {
    if (!row) continue;
    const entry = {
      row, element: null, names: [], syncs: [], header: false, fields: [],
    };
    if (row.section) {
      entry.element = el("div", "aun-card-section", row.section);
      state.rows.push(entry);
      continue;
    }
    if (row.group && !row.widget && !row.pair && !row.panel) {
      const button = el("button", "aun-card-group");
      button.type = "button";
      const glyph = el("span", "glyph", "▸");
      button.append(glyph, el("span", "", row.label ?? row.group));
      button.addEventListener("click", () => {
        node.properties ??= {};
        node.properties[groupProperty(row.group)] = !groupOpen(row.group);
        refresh();
      });
      entry.element = button;
      entry.header = true;
      entry.groupName = row.group;
      state.rows.push(entry);
      continue;
    }
    if (row.panel) {
      const panel = row.panel(node, helpers);
      entry.element = el("div", "aun-card-row panel");
      entry.element.style.height = `${row.height ?? 72}px`;
      entry.element.classList.add("aun-card-panel");
      entry.element.append(panel.element);
      entry.syncs.push((vals) => panel.sync?.(vals));
      state.rows.push(entry);
      continue;
    }

    const names = rowNames(row);
    entry.names = names;
    entry.element = el("div", "aun-card-row");
    entry.element.append(el("span", "aun-card-label", row.label ?? names[0] ?? ""));
    const control = el("div", "aun-card-control");
    entry.element.append(control);

    if (row.pair) {
      const sync = buildPair(row, control);
      entry.syncs.push(sync);
      entry.fields = sync.fields ?? [];
    } else {
      const name = names[0];
      const widget = getWidget(node, name);
      let kind = row.kind;
      if (!kind) {
        const type = String(widget?.type ?? "");
        if (type === "number" || type === "slider" || type === "float" || type === "int") kind = "scrub";
        else if (type === "toggle") kind = "switch";
        else if (type === "combo") kind = comboValues(widget).length <= 3 ? "segment" : "select";
        else kind = "text";
      }
      if (kind === "segment") entry.syncs.push(buildSegmented(row, name, control));
      else if (kind === "switch") entry.syncs.push(buildSwitch(row, name, control));
      else if (kind === "text") entry.syncs.push(buildText(row, name, control));
      else if (kind === "scrub") entry.syncs.push(buildScrub(row, name, control));
      else {
        if (row.button) {
          const wrap = el("div", "aun-card-field");
          wrap.append(el("span", "aun-card-empty"));
          const sync = buildSelect(row, name, wrap);
          const button = el("button", "aun-card-btn", row.button.text ?? "Load");
          button.type = "button";
          button.title = row.button.title ?? "";
          button.addEventListener("click", () => row.button.onClick?.(node));
          wrap.append(button);
          control.append(wrap);
          entry.syncs.push(sync);
        } else {
          entry.syncs.push(buildSelect(row, name, control));
        }
      }
      if (row.button) {
        entry.button = control.querySelector(".aun-card-btn");
      }
    }
    state.rows.push(entry);
  }

  // Every row was built above; put them on the card in order. (Rows that are
  // hidden still live here as elements with the "hidden" class.)
  for (const entry of state.rows) {
    if (entry.element) root.append(entry.element);
  }

  // ---- visibility and height -----------------------------------------

  const rowVisible = (entry, vals) => {
    const row = entry.row;
    if (entry.header) return true;
    if (row.group && !groupOpen(row.group)) return false;
    if (typeof row.when === "function" && !row.when(vals)) {
      return entry.names.some((name) => widgetLinked(node, name));
    }
    return true;
  };

  const rowHeightOf = (row) => {
    if (row.section) return SECTION_HEIGHT;
    if (row.group && !row.widget && !row.pair && !row.panel) return GROUP_HEIGHT;
    if (row.panel) return Number(row.height ?? 72);
    return ROW_HEIGHT;
  };

  function measure(visible) {
    if (!visible.length) return CARD_PADDING * 2;
    return CARD_PADDING * 2
      + visible.reduce((sum, entry) => sum + rowHeightOf(entry.row), 0)
      + ROW_GAP * (visible.length - 1);
  }

  const setNodeSize = (width, height) => {
    state.applyingSize = true;
    try {
      node.setSize?.([width, height]);
    } finally {
      state.applyingSize = false;
    }
  };

  function applyNodeSize() {
    // Once the person has sized the node themselves (or a workflow restored
    // its saved size), the card never resizes it again.
    if (state.userHeight) return;
    const width = Math.max(minWidth, Number(node.size?.[0]) || minWidth);
    const floor = Number(node.computeSize?.()[1]) || state.height + WRAPPER_INSET;
    const current = Number(node.size?.[1]) || 0;
    if (state.autoHeight === null) state.autoHeight = current;
    if (Math.abs(current - floor) > 1) setNodeSize(width, floor);
    state.autoHeight = floor;
    if (width < minWidth) setNodeSize(minWidth, node.size?.[1] ?? floor);
  }

  function refresh() {
    if (state.disposed) return;
    const vals = values();
    const visible = [];
    for (const entry of state.rows) {
      const show = rowVisible(entry, vals);
      entry.element.classList.toggle("hidden", !show);
      if (entry.header) entry.element.classList.toggle("open", groupOpen(entry.row.group));
      if (!show) continue;
      visible.push(entry);
      if (entry.names.length) {
        const linkedNames = entry.names.filter((name) => widgetLinked(node, name));
        const linked = linkedNames.length > 0 && linkedNames.length === entry.names.length;
        entry.element.classList.toggle("linked", linked);
        for (const item of entry.fields ?? []) item.field.classList.toggle("linked", linkedNames.includes(item.name));
      }
      for (const sync of entry.syncs) sync(vals);
    }

    const tops = [];
    let top = CARD_PADDING;
    for (const entry of visible) {
      tops.push(top);
      top += rowHeightOf(entry.row) + ROW_GAP;
    }
    state.rowTop = new Map();
    state.rowSpan = new Map();
    visible.forEach((entry, index) => {
      for (const name of entry.names) {
        state.rowTop.set(name, tops[index]);
        state.rowSpan.set(name, rowHeightOf(entry.row));
      }
    });

    const height = measure(visible);
    state.groups = Object.fromEntries(rows.filter((row) => row.group).map((row) => [row.group, groupOpen(row.group)]));
    state.signature = JSON.stringify({ ...vals, groups: state.groups });
    if (height !== state.height) {
      state.height = height;
      if (state.widget) {
        state.widget.computeSize = (width) => [
          Math.max(minWidth, Number(width || node.size?.[0] || minWidth)),
          state.height + WRAPPER_INSET,
        ];
      }
      applyNodeSize();
      node.graph?.setDirtyCanvas?.(true, true);
    }
    node.widgets_dirty = true;
  }

  // ---- mount ----------------------------------------------------------

  root.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button,input,select,textarea,.aun-scrub")) event.stopPropagation();
  });

  const widget = node.addDOMWidget(CARD_WIDGET, CARD_WIDGET, root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => state.height + WRAPPER_INSET,
  });
  widget.serialize = false;
  // Pin the height: the classic renderer reads computeSize, Nodes 2.0 would
  // otherwise size the panel itself from the DOM and ignore the card's rows.
  widget.computeLayoutSize = undefined;
  widget.computeSize = (width) => [
    Math.max(minWidth, Number(width || node.size?.[0] || minWidth)),
    state.height + WRAPPER_INSET,
  ];
  state.widget = widget;
  if (Array.isArray(node.widgets)) {
    const index = node.widgets.indexOf(widget);
    if (index > 0) {
      node.widgets.splice(index, 1);
      node.widgets.unshift(widget);
    }
  }

  // Hide the widgets the card mirrors.
  const managed = new Set([...rows.flatMap(rowNames)]);
  for (const name of hide) managed.add(name);
  for (const name of managed) {
    const target = getWidget(node, name);
    if (target) hideMirrored(target);
  }

  // A hidden widget reports the y of its row, so its input socket is drawn
  // (and hit-tested) where the row is.
  for (const name of managed) {
    const target = getWidget(node, name);
    if (!target || !widgetSlot(node, name)) continue;
    const own = Object.getOwnPropertyDescriptor(target, "y");
    if (own?.get) continue;
    let stored = target.y;
    try {
      Object.defineProperty(target, "y", {
        configurable: true, enumerable: true,
        get: () => {
          if (state.disposed || !target.hidden) return stored;
          const cardY = Number(state.widget?.y);
          const rowTop = state.rowTop.get(name);
          if (!Number.isFinite(cardY) || rowTop === undefined) return stored;
          const span = state.rowSpan.get(name) ?? ROW_HEIGHT;
          return cardY + WRAPPER_TOP + rowTop + Math.min(span / 2, 13) - SLOT_OFFSET;
        },
        set: (value) => { stored = value; },
      });
      state.socketed.push({ widget: target, restore: () => { delete target.y; target.y = stored; } });
    } catch { /* sealed widget */ }
  }

  for (const name of managed) {
    const target = getWidget(node, name);
    if (target) chainWidgetCallback(target, () => refresh());
  }

  // A size the person set by hand is theirs: from then on mode changes and
  // row folds only change what the card draws, never the node's size.
  const previousResize = node.onResize;
  node.onResize = function () {
    const result = previousResize?.apply(this, arguments);
    if (!state.applyingSize && !state.disposed) {
      const height = Number(node.size?.[1]);
      if (Number.isFinite(height) && (state.autoHeight === null || Math.abs(height - state.autoHeight) > 1)) {
        state.userHeight = true;
      }
    }
    return result;
  };

  const previousConfigure = node.onConfigure;
  node.onConfigure = function (info) {
    const result = previousConfigure?.apply(this, arguments);
    queueMicrotask(() => {
      if (state.disposed) return;
      for (const name of managed) {
        const target = getWidget(node, name);
        if (target) hideMirrored(target);
      }
      const savedHeight = Number(info?.size?.[1]);
      // A saved size is the workflow's size: keep it exactly.
      if (Number.isFinite(savedHeight) && savedHeight > 0) state.userHeight = true;
      refresh();
      if (Number.isFinite(savedHeight) && savedHeight > (node.size?.[1] ?? 0)) {
        setNodeSize(Math.max(minWidth, node.size?.[0] ?? minWidth), savedHeight);
      }
      state.autoHeight = Number(node.size?.[1]) || state.autoHeight;
      node.setDirtyCanvas?.(true, true);
    });
    return result;
  };

  const previousRemoved = node.onRemoved;
  node.onRemoved = function () {
    state.disposed = true;
    clearInterval(state.poll);
    for (const entry of state.socketed) entry.restore();
    return previousRemoved?.apply(this, arguments);
  };

  // Some frontends change a combo's value without running its callback (the
  // Vue select, the file arrows). A slow poll keeps the card in step.
  state.poll = setInterval(() => {
    if (state.disposed) return;
    const next = JSON.stringify({ ...values(), groups: state.groups });
    if (next === state.signature) return;
    refresh();
  }, 250);

  refresh();
  return { refresh, root, state };
}
