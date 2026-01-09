// Minimal inline media preview for AUNSaveVideo
// This mirrors the ComfyUI-JNodes behavior but is scoped to AUN nodes only.

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const PREVIEW_REGISTRY = new WeakMap();

function updateWidgetVisibility(widget, hidden, node) {
  if (!widget) return;
  widget.isHidden = hidden;
  if (widget.inputEl) {
    widget.inputEl.hidden = hidden;
    widget.inputEl.style.display = hidden ? "none" : "block";
  }
  if (hidden && widget.mediaEl?.pause) {
    widget.mediaEl.pause();
  } else if (!hidden && widget.mediaEl?.play && widget.type === "video") {
    widget.mediaEl.play().catch(() => {});
  }
  if (node?.setSize && node?.computeSize) {
    node.setSize(node.computeSize(node.size));
  }
  node?.graph?.setDirtyCanvas(true);
}

function chainCallback(target, property, callback) {
  if (!target) return;
  const previous = target[property];
  target[property] = function (...args) {
    const result = previous?.apply(this, args);
    const chained = callback?.apply(this, args);
    return chained ?? result;
  };
}

function forwardPreviewEvents(element) {
  if (!element || !app?.canvas) return;
  const forwarders = [
    ["contextmenu", "_mousedown_callback"],
    ["pointerdown", "_mousedown_callback"],
    ["pointermove", "_mousemove_callback"],
    ["pointerup", "_mouseup_callback"],
    ["mousewheel", "_mousewheel_callback"],
  ];
  forwarders.forEach(([eventName, handlerName]) => {
    element.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      const handler = app.canvas?.[handlerName];
      handler?.call(app.canvas, event);
    }, true);
  });
}

function getPreviewState(node) {
  let state = PREVIEW_REGISTRY.get(node);
  if (!state) {
    state = { widgets: [], hidden: false };
    PREVIEW_REGISTRY.set(node, state);
  }
  return state;
}

function offsetDOMWidget(widget, ctx, node, widgetWidth, widgetY, height) {
  const margin = 10;      // outer vertical spacing inside the node's widget area
  const padding = 15;     // inner horizontal padding inside the node

  // Compose canvas->CSS transform
  const elRect = ctx.canvas.getBoundingClientRect();
  const M = new DOMMatrix()
    .scaleSelf(elRect.width / ctx.canvas.width, elRect.height / ctx.canvas.height)
    .multiplySelf(ctx.getTransform());

  // Compute top-left and bottom-right corners of the inner content rect in CSS pixels
  const y1 = widgetY + margin;
  const h = Math.max(0, height || 160) - margin; // subtract bottom margin
  const y2 = y1 + Math.max(0, h);

  const p1 = new DOMPoint(padding, y1).matrixTransform(M);
  const p2 = new DOMPoint(Math.max(0, widgetWidth - padding), y2).matrixTransform(M);

  Object.assign(widget.inputEl.style, {
    transformOrigin: "0 0",
    transform: "none", // width/height/pos are absolute in CSS pixels already
  left: `${elRect.left + p1.x}px`,
  top: `${elRect.top + p1.y}px`,
    width: `${Math.max(0, p2.x - p1.x)}px`,
    height: `${Math.max(0, p2.y - p1.y)}px`,
    position: "absolute",
    zIndex: 5,
  });
}

function createMediaWidget(name, url, format, node) {
  const type = (format || "image/webp").split("/")[0];

  const widget = {
    name,
    type,
    value: url,
    inputEl: null,
    aspectRatio: null,
    mediaEl: null,
    isHidden: false,
  draw(ctx, node, widgetWidth, widgetY) {
      if (!this.inputEl || this.isHidden) return;
      let desiredHeight = 160;
      if (this.aspectRatio && this.aspectRatio > 0) {
        const innerW = Math.max(0, widgetWidth - 30);
        desiredHeight = Math.max(0, innerW / this.aspectRatio) + 10;
      }
      offsetDOMWidget(this, ctx, node, widgetWidth, widgetY, desiredHeight);
    },
    computeSize(width) {
      if (this.isHidden || this.inputEl?.hidden) {
        return [width, 0];
      }
      if (this.aspectRatio && !this.inputEl?.hidden) {
        const h = (node.size[0] - 30) / this.aspectRatio;
        return [width, h > 0 ? h : 0];
      }
      // Reserve sensible space so the preview is visible before metadata loads
      return [width, 160];
    },
    onRemoved() {
      this.inputEl?.remove();
      this.inputEl = null;
    },
  };

  const isVideo = type === "video";
  const el = document.createElement(isVideo ? "video" : "img");
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.objectFit = "contain"; // keep aspect and center within the container
  el.draggable = false;

  if (isVideo) {
    el.muted = true;
    el.autoplay = true;
    el.loop = true;
    el.controls = true;
    el.addEventListener("loadedmetadata", () => {
      if (el.videoWidth && el.videoHeight) {
        widget.aspectRatio = el.videoWidth / el.videoHeight;
  node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]]);
        node.graph.setDirtyCanvas(true);
      }
    });
  } else {
    el.addEventListener("load", () => {
      if (el.naturalWidth && el.naturalHeight) {
        widget.aspectRatio = el.naturalWidth / el.naturalHeight;
  node.setSize([node.size[0], node.computeSize([node.size[0], node.size[1]])[1]]);
        node.graph.setDirtyCanvas(true);
      }
    });
  }

  el.src = url;

  const container = document.createElement("div");
  container.style.display = "block";
  container.style.maxHeight = "100%";
  container.style.position = "absolute";
  container.style.width = "0px";
  container.style.overflow = "hidden"; // keep media within computed node bounds
  container.appendChild(el);
  forwardPreviewEvents(container);

  widget.inputEl = container;
  widget.mediaEl = el;
  widget.parent = node;
  document.body.appendChild(container);

  return widget;
}

const AUNMediaPreview = {
  name: "AUN.media_preview",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "AUNSaveVideo") return;

    const originalOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const r = originalOnExecuted ? originalOnExecuted.apply(this, message) : undefined;
      const node = this;
      const prefix = "AUN_media_preview_";
      const previewState = getPreviewState(node);

      if (node.widgets) {
        const pos = node.widgets.findIndex((w) => w.name === `${prefix}_0`);
        if (pos !== -1) {
          for (let i = pos; i < node.widgets.length; i++) node.widgets[i].onRemoved?.();
          node.widgets.length = pos;
        }

        previewState.widgets = previewState.widgets.filter((w) => !!w?.inputEl);
        if (previewState.widgets.length && pos === -1) {
          // Widgets were removed outside of this handler; ensure state matches real nodes.
          previewState.widgets.forEach((w) => w.onRemoved?.());
          previewState.widgets = [];
        } else if (pos !== -1) {
          previewState.widgets = [];
        }

        const imgs = message?.images;
        if (Array.isArray(imgs) && imgs.length > 0) {
          imgs.forEach((params, i) => {
            const url = api.apiURL('/view?' + new URLSearchParams(params).toString());
            const fmt = params.format || 'image/webp';
            const widget = createMediaWidget(`${prefix}_${i}`, url, fmt, node);
            updateWidgetVisibility(widget, previewState.hidden, node);
            node.addCustomWidget(widget);
            previewState.widgets.push(widget);
          });
        }
      }

      const originalOnRemoved = node.onRemoved;
      node.onRemoved = () => {
        if (node.widgets) node.widgets.forEach((w) => w.onRemoved?.());
        PREVIEW_REGISTRY.delete(node);
        return originalOnRemoved?.();
      };

      return r;
    };

    chainCallback(nodeType.prototype, "getExtraMenuOptions", function (_, options) {
      const menu = options ?? [];
      const previewState = PREVIEW_REGISTRY.get(this);
      if (!previewState || !previewState.widgets.length) return menu;

      const hideLabel = `${previewState.hidden ? "Show" : "Hide"} preview`;
      menu.unshift({
        content: hideLabel,
        callback: () => {
          previewState.hidden = !previewState.hidden;
          const node = this;
          previewState.widgets.forEach((w) => updateWidgetVisibility(w, previewState.hidden, node));
          app.graph?.setDirtyCanvas(true, true);
        },
      });
      return menu;
    });
  },
};

app.registerExtension(AUNMediaPreview);
