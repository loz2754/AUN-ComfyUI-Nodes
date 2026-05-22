/**
 * Shared utilities entry point for AUN web extensions.
 * Import from here instead of duplicating helpers in every file.
 */

export { NODE_MODE, PROP, MAX_SLOTS, MAX_INPUTS, MIN_INPUTS } from "./constants.js";
export { getAllGraphs, findNodeById } from "./graph-traversal.js";
export { EventBus, initEventBus } from "./event-bus.js";
export {
  getWidget,
  getWidgetByNames,
  ensureHiddenAware,
  applyWidgetHiddenState,
  chainWidgetCallback,
  setWidgetValue,
} from "./widgets.js";
export {
  clamp,
  clampFloat,
  parsePositiveInt,
  isCompact,
  setCompact,
  isNodeCollapsed,
  forceRedraw,
  forceGraphRedraw,
  matchesTarget,
  parseNodeIds,
  injectStyles,
} from "./utils.js";
export {
  computeGroupSignature,
  registerGroupNodeType,
  startGroupWatcher,
  getNodeBounds,
  isNodeInsideGroups,
  buildBoundsMap,
  findGroupsByTitles,
  applyModeToNodesInGroups,
} from "./group-state.js";
