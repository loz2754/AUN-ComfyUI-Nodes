import { app } from "../../scripts/app.js";
import { getWidget as sharedGetWidget } from "./index.js";

const ADVANCED_WIDGETS = new Set([
  "show_overlay",
  "overlay_text",
  "background_color",
  "text_color",
  "box_color",
]);

const COLOR_WIDGET_DEFAULTS = {
  background_color: "#181818",
  text_color: "#E6E6E6",
  box_color: "#000000",
};

const normalizeHexColor = (value, fallback = "#000000") => {
  const raw = String(value ?? "").trim();
  const compact = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(compact)) {
    return `#${compact.toUpperCase()}`;
  }
  return fallback.toUpperCase();
};

const getWidget = sharedGetWidget;

const offsetColorInput = (inputEl, ctx, node, widget) => {
  if (!inputEl || !ctx || !node || !widget || !Number.isFinite(widget.last_y)) {
    return;
  }

  const elRect = ctx.canvas.getBoundingClientRect();
  const matrix = new DOMMatrix()
    .scaleSelf(
      elRect.width / ctx.canvas.width,
      elRect.height / ctx.canvas.height,
    )
    .multiplySelf(ctx.getTransform());

  const rowHeight = LiteGraph?.NODE_WIDGET_HEIGHT ?? 20;
  const swatchWidth = Math.max(24, Math.min(34, rowHeight + 8));
  const swatchHeight = Math.max(16, Math.min(20, rowHeight - 4));
  const swatchX = (node.size?.[0] ?? 240) - swatchWidth - 10;
  const swatchY = widget.last_y + Math.max(2, (rowHeight - swatchHeight) / 2);

  const topLeft = new DOMPoint(swatchX, swatchY).matrixTransform(matrix);
  const bottomRight = new DOMPoint(
    swatchX + swatchWidth,
    swatchY + swatchHeight,
  ).matrixTransform(matrix);

  Object.assign(inputEl.style, {
    position: "absolute",
    left: `${elRect.left + topLeft.x}px`,
    top: `${elRect.top + topLeft.y}px`,
    width: `${Math.max(12, bottomRight.x - topLeft.x)}px`,
    height: `${Math.max(12, bottomRight.y - topLeft.y)}px`,
    display: "block",
  });
};

const pruneLegacyPickerWidgets = (node) => {
  if (!Array.isArray(node.widgets)) return;
  node.widgets = node.widgets.filter((widget) => {
    if (!widget?._AUN_colorPickerButton) return true;
    widget.onRemoved?.();
    return false;
  });
};

const attachColorPicker = (node, widgetName) => {
  const widget = getWidget(node, widgetName);
  if (!widget || widget.__AUN_colorPickerAttached) return;

  widget.__AUN_colorPickerAttached = true;
  const fallback = COLOR_WIDGET_DEFAULTS[widgetName] || "#000000";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = normalizeHexColor(widget.value, fallback);
  colorInput.title = `Pick ${widgetName.replace(/_/g, " ")}`;
  Object.assign(colorInput.style, {
    position: "absolute",
    width: "30px",
    height: "18px",
    padding: "0",
    border: "1px solid #666666",
    borderRadius: "4px",
    background: "transparent",
    boxSizing: "border-box",
    cursor: "pointer",
    zIndex: 8,
  });
  document.body.appendChild(colorInput);
  widget.__AUN_colorInput = colorInput;

  widget.options = widget.options || {};
  widget.options.read_only = true;

  const syncColorValue = (nextValue) => {
    const normalized = normalizeHexColor(nextValue, fallback);
    widget.value = normalized;
    colorInput.value = normalized;
    if (typeof widget.callback === "function") {
      widget.callback(normalized);
    }
    node.setDirtyCanvas?.(true, true);
  };

  colorInput.addEventListener("input", (event) => {
    syncColorValue(event.target.value);
  });

  widget.draw = function drawColorPickerRow(
    ctx,
    nodeRef,
    widgetWidth,
    widgetY,
    widgetHeight,
  ) {
    this.last_y = widgetY;
    if (this.hidden || this.options?.noDraw) return;

    const rowHeight = widgetHeight ?? LiteGraph?.NODE_WIDGET_HEIGHT ?? 20;
    const width = widgetWidth ?? nodeRef?.size?.[0] ?? 240;
    const radius = Math.max(8, Math.floor(rowHeight / 2));
    const label = String(this.name || "").replace(/_/g, " ");

    ctx.save();
    ctx.fillStyle = "#2a2a2a";
    ctx.beginPath();
    ctx.roundRect(10, widgetY, Math.max(40, width - 20), rowHeight, radius);
    ctx.fill();

    ctx.fillStyle = "#cfcfcf";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 22, widgetY + rowHeight / 2);
    ctx.restore();
  };

  const originalMouse = widget.mouse;
  widget.mouse = function blockTextEditing(event) {
    const eventType = typeof event === "string" ? event : event?.type;
    if (
      eventType === "pointerdown" ||
      eventType === "mousedown" ||
      eventType === "pointerup" ||
      eventType === "mouseup"
    ) {
      return true;
    }
    return originalMouse?.apply(this, arguments);
  };

  const originalOnRemoved = widget.onRemoved;
  widget.onRemoved = function onRemoved() {
    colorInput.remove();
    return originalOnRemoved?.apply(this, arguments);
  };

  syncColorValue(widget.value || fallback);
};

const attachColorPickers = (node) => {
  Object.keys(COLOR_WIDGET_DEFAULTS).forEach((widgetName) => {
    attachColorPicker(node, widgetName);
  });
};

const PK = "collapse_connections";

const applyCollapse = (node) => {
  const collapsed = !!node.properties?.[PK];
  for (const widget of node.widgets || []) {
    if (!ADVANCED_WIDGETS.has(widget.name)) continue;
    widget.hidden = collapsed;
    widget.options = widget.options || {};
    widget.options.noDraw = collapsed;

    if (COLOR_WIDGET_DEFAULTS[widget.name] && widget.__AUN_colorInput) {
      widget.__AUN_colorInput.style.display = collapsed ? "none" : "block";
    }
  }

  if (!collapsed) {
    for (const slot of [...(node.inputs || []), ...(node.outputs || [])]) {
      if (node.widgets?.length && slot.widget) continue;
      if (slot.__aun_collapse_origLabel != null) {
        slot.label = slot.__aun_collapse_origLabel;
        delete slot.__aun_collapse_origLabel;
      }
    }
  }

  const width = node.size?.[0] ?? 240;
  if (typeof node.computeSize === "function") {
    const computed = node.computeSize([width, 0]);
    if (Array.isArray(computed) && Number.isFinite(computed[1])) {
      node.setSize?.([width, computed[1]]);
    }
  }
  node.setDirtyCanvas?.(true, true);
};

const setupCollapseOverrides = (node) => {
  if (node.__aun_collapse_setup_done) return;
  node.__aun_collapse_setup_done = true;

  const origGetOutputPos = node.getOutputPos.bind(node);
  node.getOutputPos = function (index) {
    if (this.properties?.[PK]) return origGetOutputPos(0);
    return origGetOutputPos(index);
  };

  const origGetInputPos = node.getInputPos.bind(node);
  node.getInputPos = function (index) {
    if (this.properties?.[PK]) return origGetInputPos(0);
    return origGetInputPos(index);
  };

  const origComputeSize = (node.computeSize || (() => node.size)).bind(node);
  node.computeSize = function (out) {
    const s = origComputeSize(out);
    if (this.properties?.[PK]) {
      const ni = this.inputs?.filter((i) => !(this.widgets?.length && i.widget)).length || 0;
      const no = this.outputs?.length || 0;
      const rows = Math.max(ni, no);
      s[1] -= Math.max(0, rows - 1) * LiteGraph.NODE_SLOT_HEIGHT;
    }
    return s;
  };

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    if (origDrawFg) origDrawFg.apply(this, arguments);
    const c = !!this.properties?.[PK];
    if (!c) return;
    for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
      if (this.widgets?.length && slot.widget) continue;
      if (!slot.__aun_collapse_origLabel && slot.label && slot.label !== " ") {
        slot.__aun_collapse_origLabel = slot.label;
      }
      slot.label = " ";
    }
  };
};

app.registerExtension({
  name: "AUN.ManualAutoImageSwitch.Compact",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "AUNManualAutoImageSwitch") return;

    const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function onNodeCreated() {
      originalOnNodeCreated?.apply(this, arguments);
      this.properties = this.properties || {};
      if (typeof this.properties[PK] !== "boolean") {
        this.properties[PK] = true;
      }
      setupCollapseOverrides(this);
      setTimeout(() => {
        pruneLegacyPickerWidgets(this);
        attachColorPickers(this);
        applyCollapse(this);
      }, 0);
    };

    const originalOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function onConfigure() {
      originalOnConfigure?.apply(this, arguments);
      this.properties = this.properties || {};
      if (typeof this.properties[PK] !== "boolean") {
        this.properties[PK] = true;
      }
      setupCollapseOverrides(this);
      setTimeout(() => {
        pruneLegacyPickerWidgets(this);
        attachColorPickers(this);
        applyCollapse(this);
      }, 0);
    };

    const originalDrawBackground = nodeType.prototype.onDrawBackground;
    nodeType.prototype.onDrawBackground = function onDrawBackground(ctx) {
      originalDrawBackground?.apply(this, arguments);
      Object.keys(COLOR_WIDGET_DEFAULTS).forEach((widgetName) => {
        const widget = getWidget(this, widgetName);
        if (!widget?.__AUN_colorInput) return;
        if (widget.hidden || widget.options?.noDraw) {
          widget.__AUN_colorInput.style.display = "none";
          return;
        }
        widget.__AUN_colorInput.value = normalizeHexColor(
          widget.value,
          COLOR_WIDGET_DEFAULTS[widgetName],
        );
        offsetColorInput(widget.__AUN_colorInput, ctx, this, widget);
      });
    };

    const originalDblClick = nodeType.prototype.onDblClick;
    nodeType.prototype.onDblClick = function onDblClick(event, pos) {
      originalDblClick?.apply(this, arguments);
      if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) {
        return;
      }
      if (app?.canvas?.interacting_widget || app?.canvas?.active_widget) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.classList?.contains("litegraph") || el.id?.includes("widget"))) return;
      this.properties = this.properties || {};
      this.properties[PK] = !this.properties[PK];
      applyCollapse(this);
    };

    const originalMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function getExtraMenuOptions(
      _,
      options,
    ) {
      originalMenu?.apply(this, arguments);
      const on = !!this.properties?.[PK];
      options.push({
        content: on ? "Show Connections" : "Collapse Connections",
        callback: () => {
          this.properties = this.properties || {};
          this.properties[PK] = !on;
          applyCollapse(this);
        },
      });
    };
  },
});
