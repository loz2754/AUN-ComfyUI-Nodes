import { api } from "../../scripts/api.js";
import { makeLoraLabelClickable } from "./aun_lora_dropdown_shared.js";

const MAX_PROMPTS = 20;
const LORAS_PER_PROMPT = 3;
const NODE_TYPE_NEW = "AUNLoRAsByPromptIndex";
const STYLE_KEY = "__AUN_loraMultiSetupStyle";
const MODAL_KEY = "__AUN_loraMultiSetupRefs";
const SHOW_CLIP_PROP = "_AUN_showClipStrength";

function isDynamicSlotsNode(node) {
  if (!node) return false;
  return node.comfyClass === NODE_TYPE_NEW || node.type === NODE_TYPE_NEW;
}

const DEFAULT_SLOT = { lora: "None", sm: 1, sc: 1, trigger: "", enabled: true };

// NOTE: local getWidget kept intentionally — unlike the shared widgets.js
// version it also falls back to node.__AUN_allWidgets (hidden widgets).
function getWidget(node, name) {
  if (!node || !name) return null;
  const fromView = node.widgets?.find((w) => w?.name === name);
  if (fromView) return fromView;
  const all = node.__AUN_allWidgets;
  if (Array.isArray(all)) {
    const fromRegistry = all.find((w) => w?.name === name);
    if (fromRegistry) return fromRegistry;
  }
  return null;
}

function showClipStrength(node) {
  return node?.properties?.[SHOW_CLIP_PROP] !== false;
}

function setWidgetValue(widget, value) {
  if (!widget) return;
  widget.value = value;
  widget.callback?.call(widget, value);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return value;
  if (Number.isFinite(min)) value = Math.max(min, value);
  if (Number.isFinite(max)) value = Math.min(max, value);
  return value;
}

function roundToStep(value, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  const rounded = Math.round(value / step) * step;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(rounded.toFixed(decimals));
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getNumPrompts(node) {
  const raw = Number(getWidget(node, "num_prompts")?.value);
  if (!Number.isFinite(raw)) return 5;
  return clampInt(raw, 1, MAX_PROMPTS, 5);
}

function resolveActiveIndex(node) {
  const exec = parseInt(node?.__AUN_loraMultiLastPromptIndex, 10);
  if (Number.isInteger(exec) && exec > 0) {
    return Math.min(exec, MAX_PROMPTS);
  }
  const idx = parseInt(getWidget(node, "prompt_index")?.value, 10);
  return Number.isInteger(idx) && idx > 0 ? Math.min(idx, MAX_PROMPTS) : 1;
}

function setEditedPrompt(refs, p) {
  const node = refs?.node;
  const next = clampInt(p, 1, MAX_PROMPTS, 0);
  if (!node || next < 1) return;
  node.__AUN_loraMultiLastPromptIndex = next;
  for (const card of refs.promptCards || []) {
    card.card.classList.toggle("is-active", card.p === next);
  }
}

function formatStrengthValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "1.00";
}

function loraBasename(value) {
  if (!value || typeof value !== "string") return null;
  const stripped = value.replace(/\\/g, "/").split("/").pop() ?? value;
  return stripped.replace(/\.[^.]+$/, "");
}

function formatPromptLoraLabel(value) {
  if (!value || value === "None") return "None";
  const name = loraBasename(value) ?? String(value).trim();
  return name.length > 28 ? name.substring(0, 25) + "…" : name;
}

function getPromptLabels(node) {
  const labels = node?.properties?.AUN_promptLabels;
  return labels && typeof labels === "object" ? labels : null;
}

function getPromptLabel(node, p) {
  const labels = getPromptLabels(node);
  return labels && labels[p] ? String(labels[p]) : "";
}

function setPromptLabel(node, p, label) {
  node.properties = node.properties || {};
  const labels = node.properties.AUN_promptLabels || (node.properties.AUN_promptLabels = {});
  labels[p] = String(label || "").trim();
}

async function copyText(value) {
  const text = String(value || "");
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "readonly");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, text.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

async function readClipboard() {
  try {
    if (navigator?.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // Fall through to manual paste.
  }
  return window.prompt("Paste the prompt setup JSON below:") ?? "";
}

function ensureStyles() {
  if (window[STYLE_KEY]) return;
  const style = document.createElement("style");
  style.textContent = `
    .AUN-lora-multi-setup-overlay {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(8, 10, 14, 0.72);
      backdrop-filter: blur(3px);
      z-index: 100000;
    }
    body.AUN-setup-open .AUN-lora-dropdown-popup {
      z-index: 100001 !important;
    }
    .AUN-lora-multi-setup-dialog {
      width: min(1080px, calc(100vw - 32px));
      max-height: calc(100vh - 40px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid rgba(210, 224, 242, 0.12);
      background:
        radial-gradient(circle at top right, rgba(88, 144, 214, 0.18), transparent 34%),
        linear-gradient(180deg, rgba(29, 34, 43, 0.98), rgba(14, 18, 24, 0.99));
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.46);
      color: #eef2f7;
      font: 12px/1.5 system-ui, sans-serif;
    }
    .AUN-setup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .AUN-setup-heading {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .AUN-setup-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1.15;
    }
    .AUN-setup-subtitle {
      color: #9cb0c7;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .AUN-setup-close {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border: 0;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    .AUN-setup-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .AUN-setup-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.025);
    }
    .AUN-setup-toolbar-label {
      color: #9cb0c7;
      font-weight: 600;
    }
    .AUN-setup-stepper {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .AUN-setup-stepper button {
      width: 22px;
      height: 22px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: #eef2f7;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
    }
    .AUN-setup-stepper button:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .AUN-setup-stepper input {
      width: 42px;
      height: 22px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.3);
      color: #eef2f7;
      font: 12px/1 monospace;
      text-align: center;
    }
    .AUN-setup-action {
      height: 22px;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.05);
      color: #eef2f7;
      cursor: pointer;
      font: 12px/1 system-ui, sans-serif;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .AUN-setup-action:hover {
      background: rgba(255, 255, 255, 0.11);
      border-color: rgba(171, 208, 246, 0.25);
    }
    .AUN-setup-action.is-off {
      opacity: 0.6;
      border-color: rgba(255, 255, 255, 0.08);
    }
    .AUN-setup-action.is-off:hover {
      opacity: 0.85;
      background: rgba(255, 255, 255, 0.08);
    }
    .AUN-setup-action--danger:hover {
      background: rgba(214, 84, 84, 0.16);
      border-color: rgba(214, 84, 84, 0.35);
    }
    .AUN-setup-action:disabled {
      opacity: 0.4;
      cursor: default;
      pointer-events: none;
    }
    .AUN-setup-config-select {
      height: 22px;
      max-width: 360px;
      min-width: 160px;
      padding: 0 4px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.3);
      color: #eef2f7;
      font: 12px/1 system-ui, sans-serif;
      cursor: pointer;
    }
    .AUN-setup-config-name {
      height: 22px;
      flex: 1 1 260px;
      min-width: 180px;
      max-width: 420px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.3);
      color: #eef2f7;
      font: 12px/1 system-ui, sans-serif;
    }
    .AUN-setup-config-name::placeholder {
      color: rgba(156, 176, 199, 0.6);
    }
    .AUN-setup-config-name:focus {
      outline: none;
      border-color: rgba(171, 208, 246, 0.35);
    }
    .AUN-setup-config-select:focus {
      outline: none;
      border-color: rgba(171, 208, 246, 0.35);
    }
    .AUN-setup-config-select option {
      background: #10141b;
      color: #eef2f7;
    }
    .AUN-setup-status {
      margin-left: auto;
      min-width: 0;
      color: #9cb0c7;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .AUN-setup-body {
      overflow-y: auto;
      padding: 14px 16px 18px;
      scrollbar-width: thin;
    }
    .AUN-setup-body::-webkit-scrollbar {
      width: 8px;
    }
    .AUN-setup-body::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.18);
      border-radius: 4px;
    }
    .AUN-setup-prompt {
      margin-bottom: 10px;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      overflow: hidden;
    }
    .AUN-setup-prompt.is-active {
      border-color: rgba(125, 181, 255, 0.45);
      box-shadow: 0 0 0 1px rgba(125, 181, 255, 0.12), inset 3px 0 0 rgba(125, 181, 255, 0.5);
    }
    .AUN-setup-prompt-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(255, 255, 255, 0.04);
    }
    .AUN-setup-prompt-num {
      flex-shrink: 0;
      min-width: 30px;
      font-weight: 700;
      color: #b7d6ff;
      font-size: 12px;
    }
    .AUN-setup-prompt-label {
      flex: 1;
      min-width: 0;
      height: 24px;
      padding: 0 8px;
      border: 1px solid rgba(125, 181, 255, 0.22);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.25);
      color: #eef2f7;
      font: 12px/1.4 system-ui, sans-serif;
    }
    .AUN-setup-prompt-label:focus {
      outline: none;
      border-color: rgba(125, 181, 255, 0.6);
    }
    .AUN-setup-prompt-label::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
    .AUN-setup-prompt-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .AUN-setup-icon-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      color: #cfe0f2;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .AUN-setup-icon-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(171, 208, 246, 0.28);
    }
    .AUN-setup-icon-btn.is-disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }
    .AUN-setup-slot {
      display: grid;
      grid-template-columns: 30px minmax(0, 1.4fr) 96px 96px minmax(0, 1fr) 30px;
      gap: 8px;
      align-items: center;
      padding: 5px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .AUN-setup-slots[data-hide-clip="true"] .AUN-setup-slot,
    .AUN-setup-slots[data-hide-clip="true"] .AUN-setup-slot-header {
      grid-template-columns: 30px minmax(0, 1.4fr) 96px minmax(0, 1fr) 30px;
    }
    .AUN-setup-slot-header {
      display: grid;
      grid-template-columns: 30px minmax(0, 1.4fr) 96px 96px minmax(0, 1fr) 30px;
      gap: 8px;
      align-items: center;
      padding: 4px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(255, 255, 255, 0.45);
      font: 10px/1.4 system-ui, sans-serif;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .AUN-setup-slot-header span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .AUN-setup-slot-header span.is-center {
      text-align: center;
    }
    .AUN-setup-prompt .AUN-setup-slot:last-child {
      border-bottom: none;
    }
    .AUN-setup-slot-num {
      color: rgba(255, 255, 255, 0.4);
      font-size: 11px;
      font-weight: 600;
      text-align: center;
    }
    .AUN-setup-add-slot {
      display: grid;
      grid-template-columns: 1fr;
      padding: 5px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .AUN-setup-add-label {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px dashed rgba(171, 208, 246, 0.35);
      border-radius: 4px;
      background: rgba(171, 208, 246, 0.06);
      color: rgba(171, 208, 246, 0.9);
      cursor: pointer;
      font: 12px/1.4 system-ui, sans-serif;
      text-align: center;
    }
    .AUN-setup-add-label:hover {
      background: rgba(171, 208, 246, 0.12);
      border-color: rgba(171, 208, 246, 0.6);
    }
    .AUN-setup-strength {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .AUN-setup-strength button {
      width: 16px;
      height: 20px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.05);
      color: #d0d0d0;
      cursor: pointer;
      font-size: 10px;
      line-height: 1;
      flex-shrink: 0;
    }
    .AUN-setup-strength button:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .AUN-setup-strength input {
      width: 100%;
      min-width: 0;
      height: 20px;
      padding: 0 4px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.3);
      color: #e8e8e8;
      font: 11px/1 monospace;
      text-align: center;
      box-sizing: border-box;
    }
    .AUN-setup-strength input:focus {
      outline: none;
      border-color: rgba(100, 170, 255, 0.6);
    }
    .AUN-setup-strength input[type="number"]::-webkit-outer-spin-button,
    .AUN-setup-strength input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .AUN-setup-strength input[type="number"] {
      -moz-appearance: textfield;
    }
    .AUN-setup-trigger {
      width: 100%;
      min-width: 0;
      height: 20px;
      padding: 0 6px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.3);
      color: #e8e8e8;
      font: 11px/1.4 system-ui, sans-serif;
      box-sizing: border-box;
    }
    .AUN-setup-trigger:focus {
      outline: none;
      border-color: rgba(100, 170, 255, 0.6);
    }
    .AUN-setup-trigger::placeholder {
      color: rgba(255, 255, 255, 0.28);
    }
    .AUN-setup-enabled {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .AUN-setup-enabled input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 26px;
      height: 14px;
      margin: 0;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #242424;
      box-sizing: border-box;
      position: relative;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .AUN-setup-enabled input[type="checkbox"]::before {
      content: "";
      position: absolute;
      top: 1px;
      left: 1px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #b7b7b7;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
      transition: transform 120ms ease, background 120ms ease;
    }
    .AUN-setup-enabled input[type="checkbox"]:checked {
      background: #4a5860;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .AUN-setup-enabled input[type="checkbox"]:checked::before {
      transform: translateX(12px);
      background: #d8d8d8;
    }
    .AUN-setup-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.025);
    }
  `;
  document.head.appendChild(style);
  window[STYLE_KEY] = style;
}

function makeStepBtn(text, title, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.title = title;
  btn.addEventListener("click", (event) => {
    event.preventDefault?.();
    if (handler) handler();
  });
  return btn;
}

function commitStrength(node, input, slotName) {
  const widget = getWidget(node, slotName);
  const step = 0.01;
  const min = Number(widget?.options?.min ?? -20);
  const max = Number(widget?.options?.max ?? 20);
  const parsed = parseFloat(input.value);
  const fallback = Number(widget?.value ?? 1);
  let next = Number.isFinite(parsed) ? parsed : fallback;
  next = clampNumber(next, min, max);
  next = Number((Math.round(next / step) * step).toFixed(2));
  setWidgetValue(widget, next);
  input.value = formatStrengthValue(next);
}

function adjustStrength(node, input, slotName, delta) {
  const widget = getWidget(node, slotName);
  const step = 0.01;
  const min = Number(widget?.options?.min ?? -20);
  const max = Number(widget?.options?.max ?? 20);
  const current = Number(widget?.value ?? input.value ?? 0);
  const base = Number.isFinite(current) ? current : 0;
  let next = clampNumber(base + step * delta, min, max);
  next = Number((Math.round(next / step) * step).toFixed(2));
  setWidgetValue(widget, next);
  input.value = formatStrengthValue(next);
}

function makeStrengthInput(node, slotName, onChanged) {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.01";
  const widget = getWidget(node, slotName);
  input.min = String(widget?.options?.min ?? -20);
  input.max = String(widget?.options?.max ?? 20);
  input.value = formatStrengthValue(widget?.value ?? 1);
  input.addEventListener("change", () => {
    commitStrength(node, input, slotName);
    onChanged(node);
  });
  return input;
}

function bindStrengthDragScrub(node, input, slotName, onChanged) {
  input.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const widget = getWidget(node, slotName);
    const step = 0.01;
    const min = Number(widget?.options?.min);
    const max = Number(widget?.options?.max);
    const startX = event.clientX;
    const startValue = Number(widget?.value ?? input.value ?? 0);
    if (!Number.isFinite(startValue)) return;
    const pointerId = event.pointerId;
    let dragging = false;

    const finish = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      input.removeEventListener("lostpointercapture", onCancel);
      if (input.hasPointerCapture?.(pointerId)) {
        input.releasePointerCapture(pointerId);
      }
    };

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - startX;
      if (!dragging && Math.abs(deltaX) < 4) return;
      moveEvent.preventDefault?.();
      dragging = true;
      const deltaSteps = Math.trunc(deltaX / 8);
      const nextValue = clampNumber(
        roundToStep(startValue + deltaSteps * step, step),
        min,
        max,
      );
      input.value = formatStrengthValue(nextValue);
      setWidgetValue(widget, nextValue);
    };

    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      finish();
      if (dragging) {
        onChanged(node);
        input.blur();
      }
    };

    const onCancel = () => {
      finish();
    };

    input.setPointerCapture?.(pointerId);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    input.addEventListener("lostpointercapture", onCancel);
  });
}

function bindStrengthControl(node, container, slotName, onChanged) {
  const input = makeStrengthInput(node, slotName, onChanged);
  const dec = makeStepBtn("-", "Decrease", () => {
    adjustStrength(node, input, slotName, -1);
    onChanged(node);
  });
  const inc = makeStepBtn("+", "Increase", () => {
    adjustStrength(node, input, slotName, 1);
    onChanged(node);
  });
  container.append(dec, input, inc);
  bindStrengthDragScrub(node, input, slotName, onChanged);
  return input;
}

function buildSlot(node, p, s, onChanged, showClip, onLoraChanged) {
  const row = document.createElement("div");
  row.className = "AUN-setup-slot";
  row.dataset.prompt = String(p);
  row.dataset.slot = String(s);

  const slotNum = document.createElement("span");
  slotNum.className = "AUN-setup-slot-num";
  slotNum.textContent = `S${s}`;

  const loraLabel = document.createElement("div");
  loraLabel.className = "AUN-lora-dropdown-label";
  loraLabel.style.width = "100%";
  loraLabel.style.height = "20px";
  const loraLabelText = document.createElement("span");
  loraLabelText.style.minWidth = "0";
  loraLabelText.style.overflow = "hidden";
  loraLabelText.style.textOverflow = "ellipsis";
  loraLabelText.style.whiteSpace = "nowrap";
  const slotName = `p${p}_lora${s}`;
  loraLabelText.textContent = formatPromptLoraLabel(
    String(getWidget(node, slotName)?.value ?? "None"),
  );
  loraLabel.appendChild(loraLabelText);

  makeLoraLabelClickable(node, slotName, loraLabel, loraLabelText, {
    formatLabel: formatPromptLoraLabel,
    onChanged: (n, value) => {
      loraLabelText.textContent = formatPromptLoraLabel(String(value ?? "None"));
      (onLoraChanged || onChanged)(n, value);
    },
  });

  const modelWrap = document.createElement("span");
  modelWrap.className = "AUN-setup-strength";
  const modelInput = bindStrengthControl(
    node,
    modelWrap,
    `p${p}_strength_model${s}`,
    onChanged,
  );

  const clipWrap = document.createElement("span");
  clipWrap.className = "AUN-setup-strength";
  const clipInput = bindStrengthControl(
    node,
    clipWrap,
    `p${p}_strength_clip${s}`,
    onChanged,
  );

  const triggerInput = document.createElement("input");
  triggerInput.type = "text";
  triggerInput.className = "AUN-setup-trigger";
  triggerInput.placeholder = "Trigger words";
  triggerInput.value = String(getWidget(node, `p${p}_trigger${s}`)?.value ?? "");
  triggerInput.addEventListener("change", () => {
    setWidgetValue(getWidget(node, `p${p}_trigger${s}`), triggerInput.value.trim());
    onChanged(node);
  });

  const enabledWrap = document.createElement("label");
  enabledWrap.className = "AUN-setup-enabled";
  enabledWrap.title = `Enable slot ${s}`;
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.checked = !!getWidget(node, `p${p}_enabled${s}`)?.value;
  enabledInput.addEventListener("change", () => {
    setWidgetValue(getWidget(node, `p${p}_enabled${s}`), enabledInput.checked);
    onChanged(node);
  });
  enabledWrap.appendChild(enabledInput);

  const cells = [slotNum, loraLabel, modelWrap];
  if (showClip) cells.push(clipWrap);
  cells.push(triggerInput, enabledWrap);
  row.append(...cells);

  return {
    p,
    s,
    row,
    loraLabelText,
    modelInput,
    clipInput: showClip ? clipInput : null,
    triggerInput,
    enabledInput,
  };
}

function buildAddRow(node, p, s, onLoraChanged) {
  const row = document.createElement("div");
  row.className = "AUN-setup-add-slot";
  row.dataset.prompt = String(p);
  row.dataset.slot = String(s);

  const addLabel = document.createElement("div");
  addLabel.className = "AUN-lora-dropdown-label AUN-setup-add-label";
  addLabel.style.width = "100%";
  addLabel.style.height = "20px";
  const addText = document.createElement("span");
  addText.textContent = "＋ Add LoRA";
  addLabel.appendChild(addText);

  const slotName = `p${p}_lora${s}`;
  makeLoraLabelClickable(node, slotName, addLabel, addText, {
    formatLabel: () => "＋ Add LoRA",
    onChanged: (n, value) => {
      if (value && value !== "None") onLoraChanged(n);
    },
  });

  row.appendChild(addLabel);
  return row;
}

function readSlot(node, p, s) {
  return {
    lora: String(getWidget(node, `p${p}_lora${s}`)?.value ?? "None"),
    sm: Number(getWidget(node, `p${p}_strength_model${s}`)?.value ?? 1),
    sc: Number(getWidget(node, `p${p}_strength_clip${s}`)?.value ?? 1),
    trigger: String(getWidget(node, `p${p}_trigger${s}`)?.value ?? ""),
    enabled: !!getWidget(node, `p${p}_enabled${s}`)?.value,
  };
}

function writeSlotWidgets(node, p, s, slot) {
  setWidgetValue(getWidget(node, `p${p}_lora${s}`), slot.lora == null ? "None" : String(slot.lora));
  setWidgetValue(getWidget(node, `p${p}_strength_model${s}`), Number(slot.sm ?? 1));
  setWidgetValue(getWidget(node, `p${p}_strength_clip${s}`), Number(slot.sc ?? 1));
  setWidgetValue(getWidget(node, `p${p}_trigger${s}`), String(slot.trigger ?? ""));
  setWidgetValue(getWidget(node, `p${p}_enabled${s}`), slot.enabled !== false);
}

function countConfiguredPrompts(node, numPrompts) {
  let count = 0;
  for (let p = 1; p <= numPrompts; p++) {
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const value = String(getWidget(node, `p${p}_lora${s}`)?.value ?? "None");
      if (value && value !== "None") {
        count++;
        break;
      }
    }
  }
  return count;
}

function buildPromptCard(node, p, refs) {
  const onChanged = (n) => {
    setEditedPrompt(refs, p);
    refs.options?.onChanged?.(n || refs.node);
  };

  const dynamic = isDynamicSlotsNode(node);
  const rebuild = () => {
    renderRows(refs);
    renderToolbar(refs);
  };
  const refreshOrRebuild = () => {
    if (dynamic) rebuild();
    else refreshAll(refs);
  };

  const card = document.createElement("div");
  card.className = "AUN-setup-prompt";
  card.dataset.prompt = String(p);

  const head = document.createElement("div");
  head.className = "AUN-setup-prompt-head";

  const num = document.createElement("span");
  num.className = "AUN-setup-prompt-num";
  num.textContent = `P${p}`;

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "AUN-setup-prompt-label";
  labelInput.placeholder = "Label (e.g. anime girl)";
  labelInput.value = getPromptLabel(node, p);
  labelInput.title = `Name for prompt ${p}`;
  labelInput.addEventListener("change", () => {
    setPromptLabel(node, p, labelInput.value);
    setEditedPrompt(refs, p);
  });

  const actions = document.createElement("span");
  actions.className = "AUN-setup-prompt-actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "AUN-setup-icon-btn";
  copyBtn.textContent = "⧉";
  copyBtn.title = `Copy prompt ${p}`;
  copyBtn.addEventListener("click", () => {
    setEditedPrompt(refs, p);
    refs.clipboard = { label: getPromptLabel(node, p), slots: [] };
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      refs.clipboard.slots.push(readSlot(node, p, s));
    }
    for (const card of refs.promptCards) {
      card.pasteBtn.classList.remove("is-disabled");
    }
    setStatus(refs, `Copied prompt ${p}. Use the paste button on another prompt.`);
  });

  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button";
  pasteBtn.className = "AUN-setup-icon-btn" + (refs.clipboard ? "" : " is-disabled");
  pasteBtn.textContent = "⤍";
  pasteBtn.title = `Paste into prompt ${p}`;
  pasteBtn.addEventListener("click", () => {
    setEditedPrompt(refs, p);
    if (!refs.clipboard) {
      setStatus(refs, "Nothing copied yet — use the copy button first.");
      return;
    }
    node.__AUN_loraMultiSwapping = true;
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      writeSlotWidgets(node, p, s, refs.clipboard.slots[s - 1] || DEFAULT_SLOT);
    }
    setPromptLabel(node, p, refs.clipboard.label || "");
    node.__AUN_loraMultiSwapping = false;
    onChanged(node);
    refreshOrRebuild();
    setStatus(refs, `Pasted into prompt ${p}.`);
  });

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "AUN-setup-icon-btn";
  clearBtn.textContent = "✕";
  clearBtn.title = `Clear prompt ${p}`;
  clearBtn.addEventListener("click", () => {
    setEditedPrompt(refs, p);
    node.__AUN_loraMultiSwapping = true;
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      writeSlotWidgets(node, p, s, DEFAULT_SLOT);
    }
    setPromptLabel(node, p, "");
    node.__AUN_loraMultiSwapping = false;
    onChanged(node);
    refreshOrRebuild();
    setStatus(refs, `Cleared prompt ${p}.`);
  });

  actions.append(copyBtn, pasteBtn, clearBtn);
  head.append(num, labelInput, actions);

  const slotsWrap = document.createElement("div");
  slotsWrap.className = "AUN-setup-slots";
  const showClip = showClipStrength(node);
  slotsWrap.dataset.hideClip = String(!showClip);

  const header = document.createElement("div");
  header.className = "AUN-setup-slot-header";
  const headerCells = [
    { label: "Slot", center: true },
    { label: "LoRA" },
    { label: "Model", center: true },
  ];
  if (showClip) headerCells.push({ label: "Clip", center: true });
  headerCells.push({ label: "Trigger" }, { label: "On", center: true });
  for (const cell of headerCells) {
    const el = document.createElement("span");
    el.textContent = cell.label;
    if (cell.center) el.classList.add("is-center");
    header.appendChild(el);
  }
  slotsWrap.appendChild(header);

  const slotRefs = [];
  const slotValues = [];
  for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
    const value = String(getWidget(node, `p${p}_lora${s}`)?.value ?? "None");
    slotValues.push(value);
    if (dynamic && (!value || value === "None")) continue;
    const sr = buildSlot(node, p, s, onChanged, showClip, dynamic ? rebuild : null);
    slotsWrap.appendChild(sr.row);
    slotRefs.push(sr);
  }

  if (dynamic) {
    const nextEmpty = slotValues.findIndex((v) => !v || v === "None") + 1;
    if (nextEmpty) {
      slotsWrap.appendChild(buildAddRow(node, p, nextEmpty, rebuild));
    }
  }

  card.append(head, slotsWrap);
  return { p, card, labelInput, slotRefs, pasteBtn };
}

function refreshAll(refs) {
  const node = refs.node;
  if (!node) return;
  for (const card of refs.promptCards) {
    card.labelInput.value = getPromptLabel(node, card.p);
    for (const sr of card.slotRefs) {
      sr.loraLabelText.textContent = formatPromptLoraLabel(
        String(getWidget(node, `p${card.p}_lora${sr.s}`)?.value ?? "None"),
      );
      sr.modelInput.value = formatStrengthValue(
        getWidget(node, `p${card.p}_strength_model${sr.s}`)?.value,
      );
      if (sr.clipInput) {
        sr.clipInput.value = formatStrengthValue(
          getWidget(node, `p${card.p}_strength_clip${sr.s}`)?.value,
        );
      }
      sr.triggerInput.value = String(
        getWidget(node, `p${card.p}_trigger${sr.s}`)?.value ?? "",
      );
      sr.enabledInput.checked = !!getWidget(node, `p${card.p}_enabled${sr.s}`)?.value;
    }
  }
}

function setStatus(refs, message) {
  refs.status.textContent = message || "";
  refs.status.style.display = message ? "block" : "none";
}

function buildExportPayload(node) {
  const numPrompts = getNumPrompts(node);
  const labels = {};
  const prompts = {};
  for (let p = 1; p <= numPrompts; p++) {
    const label = getPromptLabel(node, p);
    if (label) labels[p] = label;
    prompts[p] = [];
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      prompts[p].push(readSlot(node, p, s));
    }
  }
  return JSON.stringify({ version: 1, num_prompts: numPrompts, labels, prompts }, null, 2);
}

function sanitizeConfigName(raw) {
  const name = String(raw || "").trim();
  const sanitized = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, "_").replace(/^[ .]+|[ .]+$/g, "");
  const base = sanitized.slice(0, 60) || "prompts";
  return base.endsWith(".json") ? base : `${base}.json`;
}

function buildConfigFilename(node) {
  return sanitizeConfigName(node?.title || node?.comfyClass || `node${node?.id ?? ""}`);
}

async function listConfigFiles() {
  try {
    const response = await api.fetchApi("/aun/lora-multi-setup/list", { method: "GET" });
    const data = await response.json();
    return Array.isArray(data?.files) ? data.files.map((f) => String(f?.name || "")) : [];
  } catch {
    return [];
  }
}

async function saveConfigToFolder(filename, content) {
  const response = await api.fetchApi("/aun/lora-multi-setup/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to save config.");
  }
  return data;
}

async function loadConfigFromFolder(filename) {
  const response = await api.fetchApi("/aun/lora-multi-setup/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to load config.");
  }
  return String(data?.content ?? "");
}

async function deleteConfigFromFolder(filename) {
  const response = await api.fetchApi("/aun/lora-multi-setup/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Failed to delete config.");
  }
}

function applyImport(refs, raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return "Invalid JSON.";
  }
  if (!data || data.version !== 1 || typeof data.prompts !== "object") {
    return "Unsupported format — expected version 1 prompt setup JSON.";
  }
  const node = refs.node;
  const current = getNumPrompts(node);
  const numPrompts = clampInt(Number(data.num_prompts) || current, 1, MAX_PROMPTS, current);
  const labels = data.labels && typeof data.labels === "object" ? data.labels : {};

  node.properties = node.properties || {};
  node.properties.AUN_promptLabels = {};
  for (let p = 1; p <= MAX_PROMPTS; p++) {
    if (labels[p] != null) {
      node.properties.AUN_promptLabels[p] = String(labels[p]);
    }
  }

  node.__AUN_loraMultiSwapping = true;
  for (let p = 1; p <= MAX_PROMPTS; p++) {
    const slotList = data.prompts[p];
    if (!Array.isArray(slotList)) continue;
    for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
      const slot = slotList[s - 1];
      if (!slot || typeof slot !== "object") continue;
      writeSlotWidgets(node, p, s, slot);
    }
  }
  node.__AUN_loraMultiSwapping = false;

  setWidgetValue(getWidget(node, "num_prompts"), numPrompts);
  refs.numPrompts = numPrompts;
  refs.options?.onChanged?.(node);
  return `Imported ${numPrompts} prompts.`;
}

function ensureModal() {
  ensureStyles();
  if (window[MODAL_KEY]) {
    return window[MODAL_KEY];
  }

  const overlay = document.createElement("div");
  overlay.className = "AUN-lora-multi-setup-overlay";

  const dialog = document.createElement("div");
  dialog.className = "AUN-lora-multi-setup-dialog";

  const header = document.createElement("div");
  header.className = "AUN-setup-header";

  const heading = document.createElement("div");
  heading.className = "AUN-setup-heading";

  const title = document.createElement("h2");
  title.className = "AUN-setup-title";
  title.textContent = "Setup Prompts";

  const subtitle = document.createElement("div");
  subtitle.className = "AUN-setup-subtitle";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "AUN-setup-close";
  closeButton.textContent = "x";

  heading.append(title, subtitle);
  header.append(heading, closeButton);

  const toolbar = document.createElement("div");
  toolbar.className = "AUN-setup-toolbar";

  const toolbarLabel = document.createElement("span");
  toolbarLabel.className = "AUN-setup-toolbar-label";
  toolbarLabel.textContent = "Prompts:";

  const stepper = document.createElement("span");
  stepper.className = "AUN-setup-stepper";
  const numDec = makeStepBtn("-", "Fewer prompts", null);
  const numInput = document.createElement("input");
  numInput.type = "text";
  numInput.inputMode = "numeric";
  const numInc = makeStepBtn("+", "More prompts", null);

  const setNumPrompts = (value) => {
    const node = refs.node;
    const next = clampInt(Number(value), 1, MAX_PROMPTS, refs.numPrompts);
    refs.numPrompts = next;
    numInput.value = String(next);
    setWidgetValue(getWidget(node, "num_prompts"), next);
    renderRows(refs);
    renderToolbar(refs);
  };

  numDec.addEventListener("click", () => setNumPrompts(refs.numPrompts - 1));
  numInc.addEventListener("click", () => setNumPrompts(refs.numPrompts + 1));
  numInput.addEventListener("change", () => setNumPrompts(numInput.value));
  stepper.append(numDec, numInput, numInc);

  const clipToggleBtn = document.createElement("button");
  clipToggleBtn.type = "button";
  clipToggleBtn.className = "AUN-setup-action";
  clipToggleBtn.title = "Show or hide clip strength inputs";
  clipToggleBtn.addEventListener("click", () => {
    const node = refs.node;
    if (!node) return;
    node.properties = node.properties || {};
    node.properties[SHOW_CLIP_PROP] = !showClipStrength(node);
    refs.options?.onChanged?.(node);
    renderToolbar(refs);
    renderRows(refs);
    setStatus(
      refs,
      showClipStrength(node) ? "Clip strength is now shown." : "Clip strength is now hidden (clip follows model).",
    );
  });

  const clearAllBtn = document.createElement("button");
  clearAllBtn.type = "button";
  clearAllBtn.className = "AUN-setup-action AUN-setup-action--danger";
  clearAllBtn.textContent = "Clear all";
  clearAllBtn.title = "Clear all configured prompts";
  clearAllBtn.addEventListener("click", () => {
    const node = refs.node;
    if (!window.confirm(`Clear all ${refs.numPrompts} prompts? This cannot be undone.`)) {
      return;
    }
    node.__AUN_loraMultiSwapping = true;
    for (let p = 1; p <= refs.numPrompts; p++) {
      for (let s = 1; s <= LORAS_PER_PROMPT; s++) {
        writeSlotWidgets(node, p, s, DEFAULT_SLOT);
      }
      setPromptLabel(node, p, "");
    }
    node.__AUN_loraMultiSwapping = false;
    refs.options?.onChanged?.(node);
    if (isDynamicSlotsNode(node)) {
      renderRows(refs);
      renderToolbar(refs);
    } else {
      refreshAll(refs);
    }
    setStatus(refs, `Cleared all ${refs.numPrompts} prompts.`);
  });

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "AUN-setup-action";
  exportBtn.textContent = "Export JSON";
  exportBtn.title = "Save the setup under the entered name and copy it to the clipboard";
  exportBtn.addEventListener("click", async () => {
    const payload = buildExportPayload(refs.node);
    const name = (refs.configNameInput?.value || "").trim() || buildConfigFilename(refs.node);
    const filename = sanitizeConfigName(name);
    const displayName = filename.replace(/\.json$/i, "");
    if ((refs.configFiles || []).includes(filename)) {
      const ok = window.confirm(
        `A saved set named "${displayName}" already exists. Overwrite it?`,
      );
      if (!ok) return;
    }
    const copied = await copyText(payload);
    let saved = null;
    try {
      const result = await saveConfigToFolder(filename, payload);
      saved = result?.path || null;
    } catch (err) {
      saved = null;
    }
    if (saved) {
      setStatus(refs, `Saved "${displayName}" to ${saved} and copied to clipboard.`);
      await refreshConfigSelect(refs);
      if (refs.configSelect && refs.configFiles.includes(filename)) {
        refs.configSelect.value = filename;
      }
    } else if (copied) {
      setStatus(refs, "Setup copied to clipboard (could not save to config folder).");
    } else {
      setStatus(refs, "Failed to copy or save setup JSON.");
    }
  });

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "AUN-setup-action";
  importBtn.textContent = "Import JSON";
  importBtn.title = "Paste a prompt setup JSON";
  importBtn.addEventListener("click", async () => {
    const raw = await readClipboard();
    if (!raw || !raw.trim()) {
      setStatus(refs, "Nothing to import.");
      return;
    }
    const message = applyImport(refs, raw);
    renderToolbar(refs);
    renderRows(refs);
    setStatus(refs, message);
  });

  const configSelect = document.createElement("select");
  configSelect.className = "AUN-setup-config-select";
  configSelect.title = "Load a saved prompt setup from the config folder";
  configSelect.append(new Option("Load saved…", ""));

  const configNameInput = document.createElement("input");
  configNameInput.type = "text";
  configNameInput.className = "AUN-setup-config-name";
  configNameInput.placeholder = "Set name";
  configNameInput.title = "Name for the exported prompt set (saved as <name>.json in the config folder)";
  configNameInput.maxLength = 60;

  const configDeleteBtn = document.createElement("button");
  configDeleteBtn.type = "button";
  configDeleteBtn.className = "AUN-setup-action AUN-setup-action--danger";
  configDeleteBtn.textContent = "✕";
  configDeleteBtn.title = "Delete the selected saved config";
  configDeleteBtn.disabled = true;
  configDeleteBtn.addEventListener("click", async () => {
    const filename = configSelect.value;
    if (!filename) return;
    if (!window.confirm(`Delete saved config "${filename}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteConfigFromFolder(filename);
      setStatus(refs, `Deleted saved config "${filename}".`);
      await refreshConfigSelect(refs);
    } catch (err) {
      setStatus(refs, String(err?.message || "Failed to delete config."));
    }
  });

  configSelect.addEventListener("change", async () => {
    const filename = configSelect.value;
    configSelect.title = filename || "Load a saved prompt setup from the config folder";
    configDeleteBtn.disabled = !filename;
    if (!filename) return;
    try {
      const content = await loadConfigFromFolder(filename);
      if (refs.configNameInput) {
        refs.configNameInput.value = filename.replace(/\.json$/i, "");
      }
      const message = applyImport(refs, content);
      renderToolbar(refs);
      renderRows(refs);
      setStatus(refs, message || `Loaded "${filename}".`);
    } catch (err) {
      setStatus(refs, String(err?.message || "Failed to load config."));
    }
  });

  async function refreshConfigSelect(refsRef) {
    const files = await listConfigFiles();
    refsRef.configFiles = files;
    const previous = refsRef.configSelect?.value || "";
    refsRef.configSelect.replaceChildren(new Option("Load saved…", ""));
    for (const name of files) {
      refsRef.configSelect.append(new Option(name, name));
    }
    if (previous && files.includes(previous)) {
      refsRef.configSelect.value = previous;
    }
    if (refsRef.configSelect) {
      refsRef.configSelect.title =
        refsRef.configSelect.value || "Load a saved prompt setup from the config folder";
    }
    if (refsRef.configDeleteBtn) {
      refsRef.configDeleteBtn.disabled = !refsRef.configSelect.value;
    }
  }

  const status = document.createElement("span");
  status.className = "AUN-setup-status";

  toolbar.append(
    toolbarLabel,
    stepper,
    clipToggleBtn,
    clearAllBtn,
    configNameInput,
    exportBtn,
    importBtn,
    configSelect,
    configDeleteBtn,
    status,
  );

  const body = document.createElement("div");
  body.className = "AUN-setup-body";

  const footer = document.createElement("div");
  footer.className = "AUN-setup-footer";
  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.className = "AUN-setup-action";
  doneButton.textContent = "Done";
  doneButton.addEventListener("click", closeModal);
  footer.appendChild(doneButton);

  dialog.append(header, toolbar, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const refs = {
    overlay,
    subtitle,
    numInput,
    numDec,
    numInc,
    clipToggleBtn,
    status,
    body,
    closeButton,
    configSelect,
    configDeleteBtn,
    configNameInput,
    refreshConfigSelect,
    node: null,
    options: null,
    numPrompts: 5,
    clipboard: null,
    promptCards: [],
    configFiles: [],
  };

  function closeModal() {
    refs.overlay.style.display = "none";
    document.body.classList.remove("AUN-setup-open");
    if (refs.options?.onChanged && refs.node) {
      refs.options.onChanged(refs.node);
    }
  }

  refs.closeButton.addEventListener("click", closeModal);
  doneButton.addEventListener("click", closeModal);

  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && refs.overlay.style.display === "flex") {
      closeModal();
    }
  });

  window[MODAL_KEY] = refs;
  return refs;
}

function renderRows(refs) {
  refs.body.replaceChildren();
  refs.promptCards = [];
  const node = refs.node;
  if (!node) return;
  const active = resolveActiveIndex(node);
  for (let p = 1; p <= refs.numPrompts; p++) {
    const card = buildPromptCard(node, p, refs);
    card.card.classList.toggle("is-active", p === active);
    refs.body.appendChild(card.card);
    refs.promptCards.push(card);
  }
}

function renderToolbar(refs) {
  const node = refs.node;
  refs.numInput.value = String(refs.numPrompts);
  refs.clipToggleBtn.textContent = showClipStrength(node) ? "Hide Clip" : "Show Clip";
  refs.clipToggleBtn.classList.toggle(
    "is-off",
    !showClipStrength(node),
  );
  const configured = countConfiguredPrompts(node, refs.numPrompts);
  const titleText = node?.title || node?.comfyClass || "LoRA Multi";
  refs.subtitle.textContent =
    `${titleText} — ${configured}/${refs.numPrompts} prompts configured. ` +
    "Changes apply to the node immediately.";
}

export function openPromptSetupDialog(node, options = {}) {
  if (!node) return;
  const refs = ensureModal();
  refs.node = node;
  refs.options = options;
  refs.numPrompts = getNumPrompts(node);
  renderToolbar(refs);
  renderRows(refs);
  setStatus(refs, "");
  if (refs.configNameInput) {
    refs.configNameInput.value = String(node.title || node.comfyClass || "").trim();
  }
  refs.refreshConfigSelect?.(refs);
  refs.overlay.style.display = "flex";
  document.body.classList.add("AUN-setup-open");
}
