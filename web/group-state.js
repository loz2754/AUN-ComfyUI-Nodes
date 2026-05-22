/**
 * Shared utilities for AUNSetBypassStateGroup and AUNSetMuteStateGroup nodes.
 * Both files are nearly identical — this extracts the common logic.
 */

import { app } from "../../scripts/app.js";
import { getAllGraphs } from "./graph-traversal.js";

// ── Group watcher (shared between bypass & mute) ────────────────────

/**
 * Compute a signature of all groups across all graphs.
 * Used to detect when groups are added/removed/moved.
 */
export function computeGroupSignature() {
  const allGraphs = getAllGraphs(app.graph);
  const allGroups = allGraphs.flatMap((g) => g.groups || []);
  return allGroups
    .map((group, idx) => {
      const title = group?.title ?? "";
      const pos = group?.pos || [];
      const size = group?.size || [];
      return `${title}::${pos[0] ?? 0},${pos[1] ?? 0}::${size[0] ?? 0},${size[1] ?? 0}::${idx}`;
    })
    .sort()
    .join("|");
}

/**
 * Shared group watcher: polls for group changes and refreshes nodes.
 * Both bypass and mute register their node type here.
 */
const GROUP_NODE_TYPES = new Set();
let lastGroupSignature = "";
let watcherStarted = false;

export function registerGroupNodeType(nodeType) {
  GROUP_NODE_TYPES.add(nodeType);
}

function refreshNodesForGroupChanges() {
  const graph = app?.graph;
  if (!graph) return;
  const signature = computeGroupSignature();
  if (signature === lastGroupSignature) return;
  lastGroupSignature = signature;

  try {
    const allGraphs = getAllGraphs(app.graph);
    for (const g of allGraphs) {
      if (!g._nodes) continue;
      for (const node of g._nodes) {
        if (GROUP_NODE_TYPES.has(node?.type)) {
          node._setupMultiSelect?.();
          node.syncTogglesWithGraph?.();
        }
      }
    }
  } catch (_) {}
}

export function startGroupWatcher() {
  if (watcherStarted) return;
  watcherStarted = true;
  setInterval(() => {
    try {
      refreshNodesForGroupChanges();
    } catch (_) {}
  }, 400);
}

// ── Node-in-group geometry helpers ───────────────────────────────────

/**
 * Compute bounding box for a node, with fallback.
 */
export function getNodeBounds(node) {
  let b = node.getBounding?.();
  if (b && b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0) {
    const ctx = node.graph?.primaryCanvas?.canvas?.getContext?.("2d");
    if (ctx && node.updateArea) {
      try {
        node.updateArea(ctx);
      } catch (_) {}
      b = node.getBounding?.();
    }
  }
  return (
    b || [node.pos?.[0] ?? 0, node.pos?.[1] ?? 0, node.size?.[0] ?? 0, node.size?.[1] ?? 0]
  );
}

/**
 * Check if a node's center point is inside any of the given groups.
 */
export function isNodeInsideGroups(node, groups, boundsMap) {
  if (node.group && groups.some((g) => node.group === g)) return true;
  const b = boundsMap[String(node.id)];
  const cx = b[0] + b[2] * 0.5;
  const cy = b[1] + b[3] * 0.5;
  for (const g of groups) {
    const GB =
      g._bounding || [g.pos?.[0] ?? 0, g.pos?.[1] ?? 0, g.size?.[0] ?? 0, g.size?.[1] ?? 0];
    if (cx >= GB[0] && cx < GB[0] + GB[2] && cy >= GB[1] && cy < GB[1] + GB[3]) return true;
  }
  return false;
}

/**
 * Build a bounds map for all nodes in a graph.
 */
export function buildBoundsMap(graph) {
  const boundsMap = {};
  for (const n of graph._nodes || []) {
    boundsMap[String(n.id)] = getNodeBounds(n);
  }
  return boundsMap;
}

/**
 * Find groups by title across all graphs.
 */
export function findGroupsByTitles(graph, titles) {
  const groupsByTitle = new Map();
  for (const g of graph.groups || []) {
    if (!groupsByTitle.has(g.title)) groupsByTitle.set(g.title, []);
    groupsByTitle.get(g.title).push(g);
  }

  const selectedGroups = [];
  for (const t of titles) {
    const arr = groupsByTitle.get(t) || [];
    for (const g of arr) selectedGroups.push(g);
  }
  return selectedGroups;
}

// ── Factory: create the shared extension setup logic ────────────────

/**
 * Apply mode to all nodes inside selected groups.
 */
export function applyModeToNodesInGroups(graph, titles, isActive, inactiveMode) {
  const selectedGroups = findGroupsByTitles(graph, titles);
  if (!selectedGroups.length) return;

  const boundsMap = buildBoundsMap(graph);
  for (const node of graph._nodes || []) {
    if (isNodeInsideGroups(node, selectedGroups, boundsMap)) {
      node.mode = isActive ? 0 : inactiveMode; // 0 is always ACTIVE
    }
  }
}
