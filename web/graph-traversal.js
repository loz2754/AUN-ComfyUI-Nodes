/**
 * Graph traversal utilities.
 * Single source of truth for recursive graph/subgraph/node-inner-graph walking.
 */

import { app } from "../../scripts/app.js";

/**
 * Recursively collect all graphs (main + subgraphs + inner node graphs).
 * Returns a flat array with no duplicates.
 * @param {object} root - The root LiteGraph to start from.
 * @returns {object[]} Array of graph objects.
 */
export function getAllGraphs(root) {
  if (!root) return [];

  const visited = new Set();
  const result = [];

  const walk = (graph) => {
    if (!graph || visited.has(graph)) return;
    visited.add(graph);
    result.push(graph);

    // Walk subgraphs
    if (graph._subgraphs) {
      const subs = graph._subgraphs instanceof Map
        ? graph._subgraphs.values()
        : Object.values(graph._subgraphs);
      for (const sub of subs) {
        walk(sub?.graph || sub?._graph || sub);
      }
    }

    // Walk inner graphs from nodes
    if (graph._nodes) {
      for (const node of graph._nodes) {
        const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
        walk(inner);
      }
    }
  };

  walk(root);
  return result;
}

/**
 * Find a node by ID across all graphs (main + subgraphs + inner).
 * Supports two calling conventions:
 *   - findNodeById(nodeId) — uses app.graph as root (backward compatible with local copies)
 *   - findNodeById(root, nodeId) — explicit root graph
 * @param {object|number|string} rootOrNodeId - Either the root graph, or a node ID if called with one arg.
 * @param {number|string} [nodeId] - The node ID to find (required when first arg is a graph).
 * @returns {object|null} The node, or null if not found.
 */
export function findNodeById(rootOrNodeId, nodeId) {
  // If called with one argument that looks like a node ID (number or string), treat it as nodeId
  const hasTwoArgs = arguments.length === 2;
  const root = hasTwoArgs ? rootOrNodeId : app.graph;
  const id = hasTwoArgs ? nodeId : rootOrNodeId;
  const graphs = getAllGraphs(root);
  for (const graph of graphs) {
    const node = graph.getNodeById(id);
    if (node) return node;
  }
  return null;
}
