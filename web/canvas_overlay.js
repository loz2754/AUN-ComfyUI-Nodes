/**
 * Shared canvas overlay layer for DOM elements pinned to nodes.
 *
 * Frontend 1.61 moved the ComfyUI shell into its own stacking contexts
 * (`GraphView.vue` now uses `.comfyui-body isolate` with the side panels at
 * `z-1`..`z-3`). A `position: fixed` element appended to `document.body` can
 * therefore never paint below those panels — node overlays used to show
 * through the Workflows/Apps/Console panels.
 *
 * All node-pinned overlays are mounted here instead: a single layer element
 * living inside the canvas (`canvas.parentElement`, which is both isolated
 * and clipped), so they stack and clip with the graph area. The layer keeps
 * its children when the Vue shell re-renders — it is re-parented, never
 * recreated.
 *
 * Keep menus, tooltips, popups and modal dialogs on `document.body`: they are
 * *supposed* to float above the panels.
 *
 * Element coordinates are viewport based, the same space the canvas rect uses:
 *   const origin = canvasOverlayOrigin();
 *   el.style.left = `${clientX - origin.left}px`;
 *
 * On frontends without the canvas wrapper the layer falls back to a
 * viewport-sized `position: fixed` layer on `document.body` (origin 0,0), so
 * existing coordinate math is unchanged.
 */

import { app } from "../../scripts/app.js";
import { injectStyles } from "./utils.js";

export const CANVAS_OVERLAY_LAYER_ID = "AUN-canvas-overlay-layer";

const LAYER_STYLE_KEY = "__AUN_canvas_overlay_layer_styles";

const LAYER_CSS = `
#${CANVAS_OVERLAY_LAYER_ID} {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
/* Legacy frontends: viewport layer on <body>, no z-index so the children's
   own z-index values keep stacking in the root context like before. */
#${CANVAS_OVERLAY_LAYER_ID}[data-aun-mount="body"] {
  position: fixed;
  z-index: auto;
}
/* Overlays are clickable by default (as they were on document.body).
   Zero-specificity so any element/class that sets pointer-events wins. */
:where(#${CANVAS_OVERLAY_LAYER_ID} > *) {
  pointer-events: auto;
}
`;

let layer = null;
let layerMount = null;

function resolveMount() {
  const canvasEl = app?.canvas?.canvas;
  const parent = canvasEl?.parentElement;
  if (parent?.isConnected) return parent;
  return document.getElementById("graph-canvas-container") ?? document.body;
}

/**
 * Return the shared overlay layer, mounting/re-parenting it as needed.
 */
export function ensureCanvasOverlayLayer() {
  injectStyles(LAYER_STYLE_KEY, LAYER_CSS);

  if (!layer) {
    layer = document.createElement("div");
    layer.id = CANVAS_OVERLAY_LAYER_ID;
  }

  const mount = resolveMount();
  if (layerMount !== mount || layer.parentElement !== mount) {
    layerMount = mount;
    mount.appendChild(layer);
    layer.dataset.aunMount = mount === document.body ? "body" : "canvas";
  }
  return layer;
}

/**
 * Append an element to the canvas overlay layer.
 */
export function attachCanvasOverlay(el) {
  ensureCanvasOverlayLayer().appendChild(el);
  return el;
}

/**
 * Remove an element from the canvas overlay layer (detached elements are fine).
 */
export function detachCanvasOverlay(el) {
  if (el?.parentElement?.id === CANVAS_OVERLAY_LAYER_ID) el.remove();
  return el;
}

/**
 * Viewport origin of the overlay layer. Subtract it from client coordinates
 * before assigning `left`/`top` on an absolutely positioned overlay.
 */
export function canvasOverlayOrigin() {
  const rect = ensureCanvasOverlayLayer().getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}
