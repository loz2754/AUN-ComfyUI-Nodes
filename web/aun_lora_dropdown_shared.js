import { showTooltip, hideTooltip, formatLoraTooltip } from "./tooltip.js";

let __AUN_dropdown_styles_loaded = false;

function ensureDropdownStyles() {
  if (__AUN_dropdown_styles_loaded) return;
  __AUN_dropdown_styles_loaded = true;

  const style = document.createElement("style");
  style.textContent = `
    .AUN-lora-dropdown-label {
      width: 100%;
      min-width: 0;
      height: 20px;
      display: flex;
      align-items: center;
      padding: 0 6px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 5px;
      background: #242424;
      color: #d8d8d8;
      box-sizing: border-box;
      font: 11px sans-serif;
      cursor: pointer;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      gap: 4px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }
    .AUN-lora-dropdown-label:hover {
      border-color: rgba(255,255,255,0.25);
    }
    .AUN-lora-dropdown-popup {
      position: fixed;
      z-index: 1000;
      background: #2a2a2a;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      overflow: hidden;
      font: 11px sans-serif;
      color: #d8d8d8;
    }
    .AUN-lora-dropdown-list {
      max-height: 300px;
      overflow-y: auto;
      padding: 4px 0;
    }
    .AUN-lora-dropdown-list::-webkit-scrollbar {
      width: 5px;
    }
    .AUN-lora-dropdown-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .AUN-lora-dropdown-list::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
    }
    .AUN-lora-dropdown-list::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.35);
    }
    .AUN-lora-dropdown-item {
      padding: 4px 12px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .AUN-lora-dropdown-item:hover {
      background: rgba(255,255,255,0.08);
      color: #fff;
    }
    .AUN-lora-dropdown-item.selected {
      background: rgba(100, 170, 255, 0.15);
      color: #8cb4ff;
    }
    .AUN-lora-dropdown-section-header {
      padding: 2px 12px;
      color: rgba(255,255,255,0.35);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .AUN-lora-dropdown-folder-header {
      padding: 4px 12px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 4px;
      user-select: none;
    }
    .AUN-lora-dropdown-folder-header:hover {
      background: rgba(255,255,255,0.06);
      color: #fff;
    }
    .AUN-lora-dropdown-folder-icon {
      display: inline-block;
      width: 12px;
      font-size: 9px;
      color: rgba(255,255,255,0.4);
    }
  `;
  document.head.appendChild(style);
}

function getWidget(node, name) {
  return node?.widgets?.find((w) => w?.name === name) ?? null;
}

function setWidgetValue(widget, value) {
  if (!widget) return;
  widget.value = value;
  widget.callback?.call(widget, value);
}

function stopCanvasEvent(event) {
  event?.stopPropagation?.();
}

function loraBasename(value) {
  if (!value || typeof value !== "string") return null;
  const stripped = value.replace(/\\/g, "/").split("/").pop() ?? value;
  return stripped.replace(/\.[^.]+$/, "");
}

function defaultFormatLabel(value) {
  const base = loraBasename(value) ?? String(value ?? "").trim();
  if (!base) return "";
  if (base === "None") return "None";
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function makeLoraLabelClickable(node, slotName, loraLabel, loraLabelText, options = {}) {
  const { formatLabel = defaultFormatLabel, onChanged = null } = options;

  ensureDropdownStyles();

  // Add hover tooltip to loraLabelText (shown when dropdown is closed)
  const attachTooltip = (el) => {
    el.addEventListener("mouseenter", () => {
      const w = getWidget(node, slotName);
      const val = String(w?.value ?? "None");
      showTooltip(el, formatLoraTooltip(val));
    });
    el.addEventListener("mouseleave", () => hideTooltip());
  };

  attachTooltip(loraLabelText);

  let active = false;
  let trigger = null;
  let popup = null;

  const close = (selectedValue) => {
    if (!active) return;
    active = false;
    loraLabel.draggable = true;

    if (popup) {
      if (popup.__AUN_cleanup) popup.__AUN_cleanup();
      popup.remove();
      popup = null;
    }

    if (trigger) {
      trigger.replaceWith(loraLabelText);
      trigger = null;
    }

    if (selectedValue !== undefined) {
      const w = getWidget(node, slotName);
      if (w && String(w.value) !== selectedValue) {
        setWidgetValue(w, selectedValue);
      }
      if (onChanged) onChanged(node, selectedValue);
    }
  };

  const show = () => {
    if (active) return;
    const widget = getWidget(node, slotName);
    const values = widget?.options?.values;
    if (!Array.isArray(values) || values.length === 0) return;
    active = true;
    loraLabel.draggable = false;
    const currentValue = String(widget.value ?? "None");

    // Build tree from flat path values
    const buildTree = (items) => {
      const root = { type: "folder", name: "", children: [] };
      for (const item of items) {
        if (item === "None") continue;
        const normalized = item.replace(/\\/g, "/");
        const parts = normalized.split("/");
        let walk = root;
        for (let i = 0; i < parts.length; i++) {
          if (i === parts.length - 1) {
            walk.children.push({ type: "file", name: parts[i], value: item });
          } else {
            let child = walk.children.find((c) => c.type === "folder" && c.name === parts[i]);
            if (!child) {
              child = { type: "folder", name: parts[i], children: [] };
              walk.children.push(child);
            }
            walk = child;
          }
        }
      }
      return root;
    };

    const sortChildren = (children) => {
      children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const c of children) {
        if (c.type === "folder") sortChildren(c.children);
      }
    };

    const hasInTree = (node, target) => {
      if (node.type === "file") return node.value === target;
      return node.children.some((c) => hasInTree(c, target));
    };

    const makeItem = (value, text, depth) => {
      const el = document.createElement("div");
      el.className = "AUN-lora-dropdown-item" + (value === currentValue ? " selected" : "");
      el.style.paddingLeft = `${12 + depth * 12}px`;
      el.textContent = text;
      el.dataset.value = value;
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        close(value);
      });
      return el;
    };

    const renderTree = (container, node, depth) => {
      if (node.type === "file") {
        container.appendChild(makeItem(node.value, node.name, depth));
      } else if (node.type === "folder" && node.name) {
        const expanded = hasInTree(node, currentValue);

        const header = document.createElement("div");
        header.className = "AUN-lora-dropdown-folder-header" + (expanded ? " expanded" : " collapsed");
        header.style.paddingLeft = `${12 + depth * 12}px`;

        const icon = document.createElement("span");
        icon.className = "AUN-lora-dropdown-folder-icon";
        icon.textContent = expanded ? "▼" : "▶";

        const label = document.createElement("span");
        label.textContent = node.name;

        header.append(icon, label);

        const body = document.createElement("div");
        body.className = "AUN-lora-dropdown-folder-items";
        body.style.display = expanded ? "block" : "none";

        header.addEventListener("click", (event) => {
          event.stopPropagation();
          const isExpanded = body.style.display !== "none";
          body.style.display = isExpanded ? "none" : "block";
          icon.textContent = isExpanded ? "▶" : "▼";
          header.className = "AUN-lora-dropdown-folder-header" + (isExpanded ? " collapsed" : " expanded");
        });

        container.appendChild(header);
        container.appendChild(body);

        for (const child of node.children) {
          renderTree(body, child, depth + 1);
        }
      }
    };

    const tree = buildTree(values);
    sortChildren(tree.children);

    // Create trigger
    trigger = document.createElement("div");
    trigger.className = "AUN-lora-dropdown-label";
    trigger.textContent = currentValue === "None" ? "None" : formatLabel(currentValue);

    // Hover tooltip for full path
    trigger.addEventListener("mouseenter", () => {
      showTooltip(trigger, formatLoraTooltip(currentValue));
    });
    trigger.addEventListener("mouseleave", () => {
      hideTooltip();
    });

    loraLabelText.replaceWith(trigger);

    // Create popup
    popup = document.createElement("div");
    popup.className = "AUN-lora-dropdown-popup";

    const list = document.createElement("div");
    list.className = "AUN-lora-dropdown-list";

    list.appendChild(makeItem("None", "None", 0));

    const rootFiles = tree.children.filter((c) => c.type === "file");
    const rootFolders = tree.children.filter((c) => c.type === "folder");

    if (rootFiles.length > 0) {
      const sectionHeader = document.createElement("div");
      sectionHeader.className = "AUN-lora-dropdown-section-header";
      sectionHeader.textContent = "Root files";
      list.appendChild(sectionHeader);

      for (const file of rootFiles) {
        renderTree(list, file, 0);
      }
    }

    for (const folder of rootFolders) {
      renderTree(list, folder, 0);
    }

    popup.appendChild(list);
    document.body.appendChild(popup);

    // Position
    const triggerRect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    popup.style.minWidth = `${Math.max(triggerRect.width, 200)}px`;
    popup.style.left = `${triggerRect.left}px`;
    popup.style.top = `${triggerRect.bottom + 2}px`;

    const pr = popup.getBoundingClientRect();
    if (pr.right > vw) {
      popup.style.left = `${Math.max(4, vw - pr.width - 4)}px`;
    }
    if (pr.bottom > vh) {
      popup.style.top = `${Math.max(4, triggerRect.top - pr.height - 2)}px`;
    }

    // Event handlers
    const outsideHandler = (event) => {
      if (popup.contains(event.target) || event.target === trigger) return;
      cleanupListeners();
      close();
    };

    const escHandler = (event) => {
      if (event.key === "Escape") {
        cleanupListeners();
        close();
      }
    };

    const blurHandler = () => {
      cleanupListeners();
      close();
    };

    const cleanupListeners = () => {
      document.removeEventListener("click", outsideHandler, true);
      document.removeEventListener("keydown", escHandler);
      window.removeEventListener("blur", blurHandler);
    };

    popup.__AUN_cleanup = cleanupListeners;

    setTimeout(() => {
      document.addEventListener("click", outsideHandler, true);
      document.addEventListener("keydown", escHandler);
      window.addEventListener("blur", blurHandler);
    }, 0);
  };

  loraLabelText.addEventListener("click", (event) => {
    stopCanvasEvent(event);
    show();
  });
}
