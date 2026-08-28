import { app } from "../../scripts/app.js";
import { registerLegacyExtension } from "./aun-compat.js";
import { aunAddSetting, aunGetSettingValue } from "./aun-settings.js";

const STORAGE_KEY = "AUN.BookmarkJump.Buttons";

const STYLES = `
  .aun-jump-btn {
    position: fixed;
    z-index: 5;
    padding: 5px 10px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    background: rgba(51, 65, 85, 0.88);
    color: #cbd5e1;
    font: 12px Arial, sans-serif;
    cursor: grab;
    user-select: none;
    transition: background 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
    white-space: nowrap;
    backdrop-filter: blur(4px);
  }
  .aun-jump-btn:hover { background: rgba(71, 85, 105, 0.95); border-color: rgba(255,255,255,0.15); }
  .aun-jump-btn:active { cursor: grabbing; }

  .aun-jump-ctx {
    position: fixed;
    z-index: 999;
    background: #1e1e1e;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 4px 0;
    font: 12px Arial, sans-serif;
    color: #eee;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    min-width: 140px;
  }
  .aun-jump-ctx-item {
    padding: 6px 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .aun-jump-ctx-item:hover { background: rgba(255,255,255,0.1); }

  .aun-jump-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .aun-jump-modal {
    background: #1e1e1e;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 16px;
    font: 12px Arial, sans-serif;
    color: #eee;
    min-width: 220px;
    box-shadow: 0 6px 30px rgba(0,0,0,0.6);
  }
  .aun-jump-modal label {
    display: block;
    margin-bottom: 6px;
    color: #aaa;
    font-size: 11px;
  }
  .aun-jump-modal input[type="text"] {
    width: 100%;
    padding: 6px 8px;
    background: #111;
    color: #eee;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 13px;
    margin-bottom: 12px;
    box-sizing: border-box;
  }
  .aun-jump-modal input[type="text"]:focus {
    border-color: #1a6fb5;
    outline: none;
  }
  .aun-jump-modal-btns {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .aun-jump-modal-btns button {
    padding: 5px 14px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }
  .aun-jump-modal-ok {
    background: #1a6fb5;
    color: #fff;
  }
  .aun-jump-modal-ok:hover { filter: brightness(1.2); }
  .aun-jump-modal-cancel {
    background: #333;
    color: #aaa;
  }
  .aun-jump-modal-cancel:hover { background: #444; color: #fff; }
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const s = document.createElement("style");
  s.id = "aun-jump-btn-styles";
  s.textContent = STYLES;
  document.head.appendChild(s);
  stylesInjected = true;
}

let buttonsData = [];
const buttonEls = new Map();

function loadButtons() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    buttonsData = raw ? JSON.parse(raw) : [];
  } catch {
    buttonsData = [];
  }
}

function saveButtons() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buttonsData));
}

function genId() {
  return "jmp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function simulateKeypress(key) {
  window.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    code: "Key" + key.toUpperCase(),
    bubbles: true,
    cancelable: true,
  }));
}

function findBookmarkNodeByKey(key) {
  const graph = app.canvas?.graph ?? app.graph;
  if (!graph || !graph._nodes) return null;
  return graph._nodes.find((n) => {
    if (n.comfyClass !== "AUNBookmark") return false;
    const w = n.widgets.find((w) => w.name === "shortcut_key");
    return (w?.value || "").toLowerCase().trim() === key.toLowerCase().trim();
  }) || null;
}

function findBookmarkTitleByKey(key) {
  const node = findBookmarkNodeByKey(key);
  if (!node) return null;
  const title = node.title || "";
  return title === "\ud83d\udd16" ? null : title;
}

function defaultLabelForKey(key) {
  return "Bookmark " + key;
}

function getButtonLabel(data) {
  if (data.label) return data.label;
  const bmTitle = findBookmarkTitleByKey(data.key);
  return bmTitle || defaultLabelForKey(data.key);
}

function updateButtonLabel(el, data) {
  const label = getButtonLabel(data);
  el.textContent = label;
  el.title = "Key: " + data.key;
}

function removeButton(id) {
  const state = buttonEls.get(id);
  if (state && state.el && state.el.parentNode) state.el.remove();
  buttonEls.delete(id);
  buttonsData = buttonsData.filter((b) => b.id !== id);
  saveButtons();
}

function worldToScreen(wx, wy) {
  const canvas = app.canvas;
  if (!canvas) return { x: 0, y: 0 };
  const ds = canvas.ds;
  const rect = canvas.canvas.getBoundingClientRect();
  return {
    x: rect.left + (wx + ds.offset[0]) * ds.scale,
    y: rect.top + (wy + ds.offset[1]) * ds.scale,
  };
}

function screenToWorld(sx, sy) {
  const canvas = app.canvas;
  if (!canvas) return { x: 0, y: 0 };
  const ds = canvas.ds;
  const rect = canvas.canvas.getBoundingClientRect();
  return {
    x: (sx - rect.left) / ds.scale - ds.offset[0],
    y: (sy - rect.top) / ds.scale - ds.offset[1],
  };
}

function getCanvasScale() {
  return app.canvas?.ds?.scale || 1;
}

function promptForKey(currentKey) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "aun-jump-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "aun-jump-modal";

    const label = document.createElement("label");
    label.textContent = "Trigger key (1-9, 0, a-z)";
    modal.appendChild(label);

    const input = document.createElement("input");
    input.type = "text";
    input.value = currentKey || "";
    input.maxLength = 1;
    input.placeholder = "e.g. 4";
    modal.appendChild(input);

    const btns = document.createElement("div");
    btns.className = "aun-jump-modal-btns";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "aun-jump-modal-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => { overlay.remove(); resolve(null); });

    const okBtn = document.createElement("button");
    okBtn.className = "aun-jump-modal-ok";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", () => {
      const val = input.value.trim().toLowerCase();
      overlay.remove();
      resolve(val || null);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") okBtn.click();
      if (e.key === "Escape") cancelBtn.click();
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(okBtn);
    modal.appendChild(btns);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    input.focus();
    input.select();
  });
}

function promptForLabel(currentLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "aun-jump-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "aun-jump-modal";

    const label = document.createElement("label");
    label.textContent = "Button label";
    modal.appendChild(label);

    const input = document.createElement("input");
    input.type = "text";
    input.value = currentLabel || "";
    input.placeholder = "e.g. My Shot";
    modal.appendChild(input);

    const btns = document.createElement("div");
    btns.className = "aun-jump-modal-btns";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "aun-jump-modal-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => { overlay.remove(); resolve(undefined); });

    const okBtn = document.createElement("button");
    okBtn.className = "aun-jump-modal-ok";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", () => {
      const val = input.value.trim();
      overlay.remove();
      resolve(val || null);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") okBtn.click();
      if (e.key === "Escape") cancelBtn.click();
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(okBtn);
    modal.appendChild(btns);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    input.focus();
    input.select();
  });
}

function showContextMenu(x, y, id) {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "aun-jump-ctx";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const changeItem = document.createElement("div");
  changeItem.className = "aun-jump-ctx-item";
  changeItem.textContent = "Change Key";
  changeItem.addEventListener("click", async () => {
    closeContextMenu();
    const data = buttonsData.find((b) => b.id === id);
    if (!data) return;
    const newKey = await promptForKey(data.key);
    if (newKey && newKey !== data.key) {
      data.key = newKey;
      saveButtons();
      const state = buttonEls.get(id);
      if (state) updateButtonLabel(state.el, data);
    }
  });

  const renameItem = document.createElement("div");
  renameItem.className = "aun-jump-ctx-item";
  renameItem.textContent = "Rename";
  renameItem.addEventListener("click", async () => {
    closeContextMenu();
    const data = buttonsData.find((b) => b.id === id);
    if (!data) return;
    const currentLabel = getButtonLabel(data);
    const newLabel = await promptForLabel(currentLabel);
    if (newLabel !== undefined && newLabel !== currentLabel) {
      data.label = newLabel || null;
      saveButtons();
      const state = buttonEls.get(id);
      if (state) updateButtonLabel(state.el, data);
    }
  });

  const removeItem = document.createElement("div");
  removeItem.className = "aun-jump-ctx-item";
  removeItem.textContent = "Remove";
  removeItem.addEventListener("click", () => {
    closeContextMenu();
    removeButton(id);
  });

  menu.appendChild(changeItem);
  menu.appendChild(renameItem);
  menu.appendChild(removeItem);
  document.body.appendChild(menu);

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + "px";
  });
}

function closeContextMenu() {
  document.querySelectorAll(".aun-jump-ctx").forEach((el) => el.remove());
}

document.addEventListener("mousedown", (e) => {
  if (!e.target.closest(".aun-jump-ctx")) closeContextMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeContextMenu();
});

function positionButton(el, data) {
  const scale = getCanvasScale();
  const screen = worldToScreen(data.x, data.y);
  const pad = 4 * scale;
  el.style.left = screen.x + "px";
  el.style.top = screen.y + "px";
  el.style.display = "block";
}

let rafRunning = false;

function startRafLoop() {
  if (rafRunning) return;
  rafRunning = true;

  function tick() {
    for (const [id, state] of buttonEls) {
      const data = buttonsData.find((b) => b.id === id);
      if (!data || !state.el) continue;
      if (state.dragging) continue;
      if (findBookmarkNodeByKey(data.key)) {
        updateButtonLabel(state.el, data);
        positionButton(state.el, data);
      } else {
        state.el.style.display = "none";
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function createJumpButtonEl(data) {
  const el = document.createElement("button");
  el.className = "aun-jump-btn";
  updateButtonLabel(el, data);

  let dragging = false;
  let didMove = false;
  let startScreenX = 0;
  let startScreenY = 0;
  let startWorldX = 0;
  let startWorldY = 0;

  el.addEventListener("click", (e) => {
    if (didMove) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    simulateKeypress(data.key);
  });

  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, data.id);
  });

  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    didMove = false;
    startScreenX = e.clientX;
    startScreenY = e.clientY;
    startWorldX = data.x;
    startWorldY = data.y;
    el.style.cursor = "grabbing";

    const onMove = (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startScreenX;
      const dy = ev.clientY - startScreenY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove = true;
      const scale = getCanvasScale();
      data.x = startWorldX + dx / scale;
      data.y = startWorldY + dy / scale;
      positionButton(el, data);
    };

    const onUp = () => {
      dragging = false;
      el.style.cursor = "grab";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (didMove) saveButtons();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  document.body.appendChild(el);
  buttonEls.set(data.id, { el, data, dragging: false });
}

function getDefaultWorldPos() {
  const canvas = app.canvas;
  if (!canvas) return { x: 200, y: 200 };
  const ds = canvas.ds;
  const rect = canvas.canvas.getBoundingClientRect();
  const existing = buttonsData.length;
  const screenX = rect.width - 160;
  const screenY = rect.height - 100 - existing * 40;
  return screenToWorld(
    rect.left + Math.max(20, screenX),
    rect.top + Math.max(20, screenY)
  );
}

async function addButton() {
  const key = await promptForKey("");
  if (!key) return;
  const pos = getDefaultWorldPos();
  const data = { id: genId(), key, x: pos.x, y: pos.y };
  buttonsData.push(data);
  saveButtons();
  createJumpButtonEl(data);
}

let menuBtn = null;
let showMenuBtn = true;

function ensureMenuButton() {
  if (!showMenuBtn) return;
  const group = app.menu?.actionsGroup;
  if (!group?.element) return;

  if (menuBtn) {
    if (menuBtn.isConnected) return;
    group.update();
    return;
  }

  menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "comfyui-button";
  menuBtn.textContent = "+\u2B07";
  menuBtn.title = "Add bookmark jump button";
  menuBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    addButton();
  });

  group.insert(menuBtn, 0);
}

function removeMenuButton() {
  if (menuBtn?.isConnected) menuBtn.remove();
}

function init() {
  injectStyles();
  loadButtons();
  for (const data of buttonsData) {
    createJumpButtonEl(data);
  }
  ensureMenuButton();
  startRafLoop();
}

registerLegacyExtension({
  name: "AUN.BookmarkJump",
  setup() {
    const setting = aunAddSetting({
      id: "AUN.BookmarkJump.ShowMenuButton",
      name: "Bookmark Jump: show '+' button in menu bar",
      tooltip: "Shows a '+' button in the top action bar to add bookmark jump buttons.",
      type: "boolean",
      defaultValue: true,
      onChange: (value) => {
        showMenuBtn = !!value;
        if (showMenuBtn) {
          ensureMenuButton();
        } else {
          removeMenuButton();
        }
      },
    });
    showMenuBtn = aunGetSettingValue("AUN.BookmarkJump.ShowMenuButton", true) !== false;
    init();
  },
});
