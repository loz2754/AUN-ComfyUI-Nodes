/**
 * Small DOM dialogs shared by AUN nodes.
 *
 * The bundle nodes open a plain overlay instead of a ComfyUI panel so the
 * same code works on the classic canvas and on Nodes 2.0, and so a dialog
 * can be opened from a node button or from the node's context menu.
 *
 * Nothing here touches the graph: callers read their state before opening
 * and write it on OK.
 */

/** Remove the open dialog of this kind, if any. */
export function closeDialog(className) {
  document.querySelector(`.${className}`)?.remove();
}

/** The overlay + panel + head/foot, styled the way the AUN dialogs look. */
export function createDialog(className, title, { width = 520 } = {}) {
  closeDialog(className);

  const overlay = document.createElement("div");
  overlay.className = className;
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:10000", "display:flex",
    "align-items:center", "justify-content:center",
    "background:rgba(0,0,0,.55)",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    `width:${width}px`, "max-height:78vh", "display:flex",
    "flex-direction:column", "background:#202020", "color:#ddd",
    "border:1px solid #4a4a4a", "border-radius:8px", "overflow:hidden",
    "box-shadow:0 12px 40px rgba(0,0,0,.55)",
    "font:14px/1.45 system-ui,-apple-system,sans-serif",
  ].join(";");

  const head = document.createElement("div");
  head.textContent = title;
  head.style.cssText = [
    "padding:12px 14px", "font-weight:600", "border-bottom:1px solid #3a3a3a",
  ].join(";");

  const foot = document.createElement("div");
  foot.style.cssText = [
    "display:flex", "align-items:center", "gap:8px",
    "padding:10px 14px", "border-top:1px solid #3a3a3a",
  ].join(";");

  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeDialog(className);
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeDialog(className);
    }
  });

  panel.append(head);
  overlay.append(panel);
  return {
    overlay,
    panel,
    head,
    foot,
    close: () => closeDialog(className),
  };
}

/** A styled button; `onClick` only fires when it is enabled. */
export function dialogButton(label, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = !!options.disabled;
  button.style.cssText = [
    "padding:5px 12px", "border-radius:5px",
    `border:1px solid ${options.accent ? "#4a7dbd" : "#555"}`,
    `background:${options.accent ? "#2f5b94" : "#333"}`,
    "color:#eee", "font:inherit",
    options.disabled ? "opacity:.45" : "cursor:pointer",
  ].join(";");
  if (!options.disabled) {
    button.addEventListener("click", onClick);
  }
  return button;
}

export function sectionLabel(text) {
  const label = document.createElement("div");
  label.textContent = text;
  label.style.cssText = [
    "padding:10px 14px 4px", "color:#9aa4af", "font-size:12px",
    "letter-spacing:.04em", "text-transform:uppercase",
  ].join(";");
  return label;
}

export function emptyHint(text) {
  const hint = document.createElement("div");
  hint.textContent = text;
  hint.style.cssText = "padding:6px 14px;color:#999";
  return hint;
}

/** The grip shown at the left of a row the user can drag. */
export function dragGrip() {
  const grip = document.createElement("span");
  grip.textContent = "⠿";
  grip.title = "Drag to reorder";
  grip.style.cssText = "color:#777;cursor:grab;user-select:none;font-size:15px";
  return grip;
}

/**
 * Turn a container of `data-drag-index` rows into a drag-to-reorder list.
 * The rows are rebuilt by the caller; the index is read when a drag
 * starts, so a redraw in between cannot point at the wrong row.
 */
export function enableDragReorder(container, onMove) {
  let from = -1;
  const rowOf = (target) => target?.closest?.("[data-drag-index]") ?? null;
  const rows = () => [...container.querySelectorAll("[data-drag-index]")];

  const clear = () => {
    for (const row of rows()) {
      row.style.opacity = "";
      row.style.boxShadow = "";
    }
  };

  container.addEventListener("dragstart", (event) => {
    const row = rowOf(event.target);
    if (!row || !container.contains(row)) return;
    from = Number(row.dataset.dragIndex);
    row.style.opacity = "0.5";
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(from));
    } catch (err) {
      /* older browsers: the index is already in `from` */
    }
  });

  container.addEventListener("dragover", (event) => {
    const row = rowOf(event.target);
    if (!row || from < 0) return;
    event.preventDefault();
    try {
      event.dataTransfer.dropEffect = "move";
    } catch (err) {
      /* ignore */
    }
    for (const other of rows()) {
      other.style.boxShadow = other === row ? "inset 0 2px 0 #4a7dbd" : "";
    }
  });

  container.addEventListener("drop", (event) => {
    const row = rowOf(event.target);
    if (!row || from < 0) return;
    event.preventDefault();
    const to = Number(row.dataset.dragIndex);
    clear();
    if (Number.isFinite(to) && to !== from) onMove(from, to);
    from = -1;
  });

  container.addEventListener("dragend", () => {
    from = -1;
    clear();
  });
}
