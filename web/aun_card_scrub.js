// Number field for AUN cards: drag across the value to scrub it, click to
// type a number or a sum (1024*1.5), chevrons on the right step it, Shift is
// always the fine step.
//
// Adapted from AusBoss's scrub_input.mjs (MIT, github.com/ausboss).

import { FONT_UI, RADIUS_CONTROL, THEME as T } from "./aun_card_theme.js";

const FIELD_EDIT_KEYS = new Set([
  "a", "c", "v", "x", "z", "y", "backspace", "delete",
  "arrowleft", "arrowright", "arrowup", "arrowdown", "home", "end",
]);

/** Keep typing keys in the field, let the app's own Ctrl/Meta shortcuts through. */
export function keepKeyInField(event) {
  if (!(event.ctrlKey || event.metaKey)) event.stopPropagation();
  else if (FIELD_EDIT_KEYS.has(String(event.key ?? "").toLowerCase())) event.stopPropagation();
}

export const SCRUB_DEAD_ZONE = 3;
export const SCRUB_PIXELS_PER_STEP = 4;
export const SCRUB_SLOW_FACTOR = 4;

function isScrubGesture(deltaX, deltaY) {
  return Math.abs(deltaX) > SCRUB_DEAD_ZONE && Math.abs(deltaX) >= Math.abs(deltaY);
}

export function quantizeScrubValue(value, { min = -Infinity, max = Infinity, decimals = 2 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return quantizeScrubValue(min === -Infinity ? 0 : min, { min, max, decimals });
  }
  const clamped = Math.max(min, Math.min(max, number));
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(clamped * factor) / factor;
}

// A sum typed into a number box: 1024*1.5, 512+64, (1920-64)/2.
const SUM_LIMIT = 200;
const SUM_NUMBER = /(?:\d+\.?\d*|\.\d+)/y;

export function sumValue(text) {
  const source = String(text ?? "");
  if (source.length > SUM_LIMIT) return null;
  let at = 0;
  const skip = () => { while (source[at] === " " || source[at] === "\t") at += 1; };
  const atom = () => {
    skip();
    const mark = source[at];
    if (mark === "+" || mark === "-") {
      at += 1;
      const value = atom();
      return value === null ? null : mark === "-" ? -value : value;
    }
    if (mark === "(") {
      at += 1;
      const value = sum();
      skip();
      if (value === null || source[at] !== ")") return null;
      at += 1;
      return value;
    }
    SUM_NUMBER.lastIndex = at;
    const match = SUM_NUMBER.exec(source);
    if (!match) return null;
    at += match[0].length;
    return Number(match[0]);
  };
  const product = () => {
    let value = atom();
    while (value !== null) {
      skip();
      const mark = source[at];
      if (mark !== "*" && mark !== "/" && mark !== "%") break;
      at += 1;
      const next = atom();
      if (next === null) return null;
      value = mark === "*" ? value * next : mark === "/" ? value / next : value % next;
    }
    return value;
  };
  function sum() {
    let value = product();
    while (value !== null) {
      skip();
      const mark = source[at];
      if (mark !== "+" && mark !== "-") break;
      at += 1;
      const next = product();
      if (next === null) return null;
      value = mark === "+" ? value + next : value - next;
    }
    return value;
  }
  const value = sum();
  skip();
  if (value === null || at !== source.length || !Number.isFinite(value)) return null;
  return value === 0 ? 0 : value;
}

export function stepDecimals(step) {
  const text = String(Number(Math.abs(Number(step) || 0).toFixed(6)));
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

export function formatScrubValue(value, { decimals = 2, minDecimals = null } = {}) {
  if (value === null || value === undefined) return "";
  const held = Math.max(0, decimals);
  const text = Number(value).toFixed(held);
  if (minDecimals === null || minDecimals === undefined || minDecimals >= held) return text;
  const keep = text.length - (held - Math.max(0, minDecimals));
  let end = text.length;
  while (end > keep && text[end - 1] === "0") end -= 1;
  return text[end - 1] === "." ? text.slice(0, end - 1) : text.slice(0, end);
}

export function steppedValue(start, count, size, snap = false) {
  const number = Number(start);
  if (!snap || !count) return number + count * size;
  const units = number / size;
  const from = count > 0 ? Math.floor(units + 1e-9) : Math.ceil(units - 1e-9);
  return (from + count) * size;
}

export function scrubbedValue(start, deltaX, fine, options = {}) {
  const { step = 1, fineStep = null, snap = false } = options;
  if (Math.abs(deltaX) <= SCRUB_DEAD_ZONE) return quantizeScrubValue(start, options);
  const finer = fineStep != null && fineStep < step;
  const size = fine && finer ? fineStep : step;
  const pixels = fine && !finer ? SCRUB_PIXELS_PER_STEP * SCRUB_SLOW_FACTOR : SCRUB_PIXELS_PER_STEP;
  const travel = deltaX - Math.sign(deltaX) * SCRUB_DEAD_ZONE;
  const steps = Math.round(travel / pixels);
  return quantizeScrubValue(steppedValue(start, steps, size, snap && size === step), options);
}

/** Step size and precision for a ComfyUI widget's options. */
export function scrubSteps(options = {}, isFloat = true, pixels = false) {
  const fine = Number(options.step2 ?? (options.step ? options.step / 10 : null) ?? (isFloat ? 0.01 : 1)) || (isFloat ? 0.01 : 1);
  const range = Number(options.max ?? Infinity) - Number(options.min ?? -Infinity);
  let step;
  if (!isFloat) step = pixels && Number.isFinite(range) && range > 2048 ? 8 : Math.max(1, fine);
  else if (Number.isFinite(range) && range <= 2) step = Math.max(fine, 0.05);
  else step = fine * 10;
  const decimals = isFloat ? Number(options.precision ?? Math.max(0, -Math.floor(Math.log10(fine)))) : 0;
  return { step, fineStep: fine, decimals };
}

const CSS_ID = "aun-card-scrub-css";

function ensureScrubCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement("style");
  style.id = CSS_ID;
  style.textContent = `
  .aun-scrub{display:flex;width:72px;height:24px;border:1px solid transparent;border-radius:${RADIUS_CONTROL}px;
    background:${T.fill};overflow:hidden;flex:none;color:${T.ink};font:500 12px ${FONT_UI};font-variant-numeric:tabular-nums}
  .aun-scrub:focus-within{border-color:${T.brand}}
  .aun-scrub>.aun-scrub-input{flex:1 1 auto;min-width:0;width:100%;height:100%;border:none;
    padding:0;margin:0;background:transparent;color:inherit;text-align:center;cursor:ew-resize;
    user-select:none;font:inherit;outline:none;border-radius:0}
  .aun-scrub>.aun-scrub-input:focus{cursor:text;user-select:text}
  .aun-scrub>.aun-scrub-unit{flex:none;align-self:center;padding:0 3px 0 1px;color:${T.faint};font:600 10px ${FONT_UI};letter-spacing:.04em;text-transform:uppercase;text-align:center;user-select:none;pointer-events:none}
  .aun-scrub>.aun-scrub-step{flex:none;width:14px;display:flex;flex-direction:column;
    border-left:1px solid transparent;background:${T.fillHover}}
  .aun-scrub>.aun-scrub-step>button{flex:1 1 0;min-height:0;border:none;background:transparent;
    color:${T.label};cursor:pointer;padding:0;margin:0;display:grid;place-items:center;border-radius:0}
  .aun-scrub>.aun-scrub-step>button:hover{color:${T.brand};background:rgba(255,255,255,.05)}
  `;
  document.head.append(style);
}

function chevronSvg(up) {
  const points = up ? "1.5,4 4.5,1 7.5,4" : "1.5,1 4.5,4 7.5,1";
  return `<svg width="9" height="5" viewBox="0 0 9 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${points}"/></svg>`;
}

export function makeScrubInput(options = {}) {
  ensureScrubCss();
  const opts = {
    value: 0, min: -Infinity, max: Infinity,
    step: 1, fineStep: null, decimals: 2, minDecimals: null,
    width: null, title: "", onChange: null, onSettle: null,
    unit: "", unitWidth: 0, snap: false,
    ...options,
  };
  let current = quantizeScrubValue(opts.value, opts);
  const base = () => current;
  const stepped = (direction, fine) => {
    const size = fine ? (opts.fineStep ?? opts.step) : opts.step;
    return steppedValue(base(), direction, size, opts.snap && size === opts.step);
  };

  const box = document.createElement("div");
  box.className = "aun-scrub";
  if (opts.width) box.style.width = `${opts.width}px`;
  const input = document.createElement("input");
  input.className = "aun-scrub-input";
  input.type = "text";
  input.inputMode = "decimal";
  input.readOnly = true;
  if (opts.title) input.title = `${opts.title} Drag to scrub, click to type a number or a sum (1024*1.5), arrows to step; Shift = fine.`;

  const format = (value) => formatScrubValue(value, opts);
  input.value = format(current);

  const commit = (value) => {
    const next = quantizeScrubValue(value, opts);
    const changed = next !== current;
    current = next;
    input.value = format(current);
    if (changed) opts.onChange?.(current);
    return current;
  };
  const settle = () => opts.onSettle?.();

  let drag = null;
  input.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !input.readOnly) return;
    drag = { x: event.clientX, y: event.clientY, start: base(), scrubbed: false };
    input.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  input.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.scrubbed && isScrubGesture(dx, dy)) { drag.scrubbed = true; drag.fine = event.shiftKey; }
    if (!drag.scrubbed) return;
    if (event.shiftKey !== drag.fine) {
      drag.start = base();
      drag.x = event.clientX - Math.sign(dx || 1) * (SCRUB_DEAD_ZONE + 1);
      drag.fine = event.shiftKey;
    }
    commit(scrubbedValue(drag.start, event.clientX - drag.x, event.shiftKey, opts));
  });
  const endDrag = (event) => {
    if (!drag) return;
    try { input.releasePointerCapture(event.pointerId); } catch { /* mouse fallback */ }
    const wasClick = !drag.scrubbed;
    const scrubbed = drag.scrubbed;
    drag = null;
    if (wasClick) {
      input.readOnly = false;
      input.focus();
      input.select();
      requestAnimationFrame(() => {
        if (document.activeElement !== input) {
          input.readOnly = false;
          input.focus();
          input.select();
        }
      });
    } else if (scrubbed) {
      settle();
    }
  };
  input.addEventListener("pointerup", endDrag);
  input.addEventListener("pointercancel", endDrag);

  input.addEventListener("keydown", (event) => {
    keepKeyInField(event);
    if (event.key === "Enter") input.blur();
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(stepped(event.key === "ArrowUp" ? 1 : -1, event.shiftKey));
      input.select();
      settle();
    }
  });
  input.addEventListener("blur", () => {
    if (!input.readOnly) {
      const number = Number(input.value);
      const typed = Number.isFinite(number) ? number : sumValue(input.value);
      if (typed !== null) { commit(typed); settle(); }
      input.readOnly = true;
    }
    input.value = format(current);
  });

  const steppers = document.createElement("div");
  steppers.className = "aun-scrub-step";
  for (const direction of [1, -1]) {
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.title = `Step ${direction > 0 ? "up" : "down"}; Shift = fine.`;
    button.innerHTML = chevronSvg(direction > 0);
    button.addEventListener("click", (event) => {
      commit(stepped(direction, event.shiftKey));
      settle();
    });
    steppers.append(button);
  }

  if (opts.unit || opts.unitWidth > 0) {
    const unit = document.createElement("span");
    unit.className = "aun-scrub-unit";
    unit.textContent = opts.unit;
    if (opts.unitWidth > 0) {
      unit.style.width = `${opts.unitWidth}px`;
      unit.style.padding = "0";
    }
    box.append(input, unit, steppers);
  } else {
    box.append(input, steppers);
  }

  return {
    root: box,
    input,
    get: () => current,
    set: (value) => {
      current = quantizeScrubValue(value, opts);
      if (input.readOnly) input.value = format(current);
    },
    setStep: (step, fineStep = null) => { opts.step = step; opts.fineStep = fineStep; },
  };
}
