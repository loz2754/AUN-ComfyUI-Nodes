/**
 * Graph traversal utilities.
 * Single source of truth for recursive graph/subgraph/node-inner-graph walking.
 */

import { app } from "../../scripts/app.js";

/**
 * Recursively collect all graphs (main + subgraphs + inner node graphs).
 * Returns a flat array with no duplicates.
 * Supports both legacy (`_nodes`/`_subgraphs`) and modern (`nodes`/`subgraphs`) shapes.
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

    // Walk graph-level subgraph collections (legacy + modern).
    for (const sub of getChildGraphsOfGraph(graph)) {
      walk(sub);
    }

    // Walk inner graphs from nodes.
    for (const node of getGraphNodes(graph)) {
      for (const inner of getInnerGraphsOfNode(node)) {
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

/**
 * Find a node by ID, title, or localized name across the node's graph tree.
 * Prefer the source node's graph so nested instances do not resolve against
 * a similarly numbered node in the main graph.
 */
export function findNodeByIdentifier(root, identifier, excludeNode) {
  const value = String(identifier ?? "").trim();
  if (!value) return null;

  const graphs = getAllGraphs(root);
  const matchesId = (node) => {
    const id = String(node?.id ?? "");
    return (
      id === value ||
      value.endsWith(`.${id}`) ||
      value.endsWith(`:${id}`) ||
      value.endsWith(`/${id}`)
    );
  };

  for (const graph of graphs) {
    for (const node of getGraphNodes(graph)) {
      if (!node || node === excludeNode) continue;
      if (matchesId(node)) return node;
    }
  }
  for (const graph of graphs) {
    for (const node of getGraphNodes(graph)) {
      if (!node || node === excludeNode) continue;
      if (node.title === value || node.localized_name === value) return node;
    }
  }
  return null;
}

/**
 * Return the nodes array of a graph, supporting Array/Map/Set/plain-object
 * storage under either `_nodes` (legacy) or `nodes` (modern).
 * @param {object} graph - A LiteGraph graph or subgraph.
 * @returns {object[]} Node instances (never null).
 */
export function getGraphNodes(graph) {
  if (!graph) return [];
  const storage = graph._nodes ?? graph.nodes;
  if (!storage) return [];
  if (Array.isArray(storage)) return storage;
  if (storage instanceof Map) return Array.from(storage.values());
  if (storage instanceof Set) return Array.from(storage.values());
  if (typeof storage === "object") return Object.values(storage);
  return [];
}

/**
 * Return the inner graphs owned by a node (subgraph wrapper / inner graph).
 * Covers `subgraph`, `getInnerGraph()`, and legacy `inner_graph` shapes.
 * String UUID type keys (ComfyUI core subgraph wrappers) are not graphs and
 * are skipped here; wrapper nodes expose the resolved object via `subgraph`.
 * @param {object} node - A graph node.
 * @returns {object[]} Inner graph objects.
 */
export function getInnerGraphsOfNode(node) {
  if (!node) return [];
  const candidates = [
    typeof node.getInnerGraph === "function" ? safeCallInnerGraph(node) : null,
    node.subgraph,
    node.inner_graph,
    node.innerGraph,
    node._subgraph,
  ];
  const graphs = [];
  const push = (value) => {
    if (!value || typeof value === "string") return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    if (value instanceof Map || value instanceof Set) {
      value.forEach((entry) => push(entry));
      return;
    }
    if (typeof value === "object") {
      // A graph has a node list; anything else is not a graph.
      if (value._nodes !== undefined || value.nodes !== undefined) {
        graphs.push(value);
      }
    }
  };
  candidates.forEach(push);
  return graphs;
}

function safeCallInnerGraph(node) {
  try {
    return node.getInnerGraph();
  } catch (_) {
    return null;
  }
}

/**
 * Return child graphs held directly on a graph object (not via nodes).
 * Handles `subgraphs`/`graphs` (modern) and `_subgraphs` (legacy Map/object).
 * @param {object} graph - A LiteGraph graph or subgraph.
 * @returns {object[]} Child graph objects.
 */
export function getChildGraphsOfGraph(graph) {
  if (!graph) return [];
  const out = [];
  const pushEntry = (entry) => {
    if (!entry || typeof entry === "string") return;
    const resolved = entry.graph || entry._graph || entry;
    if (resolved && typeof resolved === "object") out.push(resolved);
  };
  const pushCollection = (collection) => {
    if (!collection) return;
    if (collection instanceof Map || collection instanceof Set) {
      collection.forEach(pushEntry);
      return;
    }
    if (Array.isArray(collection)) {
      collection.forEach(pushEntry);
      return;
    }
    if (typeof collection === "object") {
      Object.values(collection).forEach(pushEntry);
    }
  };
  pushCollection(graph.subgraphs);
  pushCollection(graph.graphs);
  pushCollection(graph._subgraphs);
  return out;
}

/**
 * Walk every node in a graph tree, calling `cb(node, ownerGraph)`.
 * @param {object} root - Root graph to start from.
 * @param {Function} cb - Callback invoked per node.
 */
export function walkAllNodes(root, cb) {
  if (!root || typeof cb !== "function") return;
  for (const graph of getAllGraphs(root)) {
    for (const node of getGraphNodes(graph)) {
      if (node) cb(node, graph);
    }
  }
}

/**
 * Collect `{ node, graph }` entries across all graphs matching a predicate.
 * @param {object} root - Root graph to start from.
 * @param {Function} predicate - `(node, ownerGraph) => boolean`.
 * @returns {{node: object, graph: object}[]} Matches in traversal order.
 */
export function findNodesMatching(root, predicate) {
  const matches = [];
  if (!root || typeof predicate !== "function") return matches;
  walkAllNodes(root, (node, graph) => {
    let ok = false;
    try {
      ok = predicate(node, graph);
    } catch (_) {
      ok = false;
    }
    if (ok) matches.push({ node, graph });
  });
  return matches;
}

/**
 * Root (workflow-level) graph. Prefers `app.rootGraph` on the modern
 * frontend, falling back to legacy `app.graph`.
 * @returns {object|null} Root graph or null.
 */
export function getRootGraph() {
  try {
    return app.rootGraph ?? app.graph ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * Currently visible graph (follows subgraph navigation).
 * Falls back to the root graph when the canvas is unavailable.
 * @returns {object|null} Visible graph or null.
 */
export function getVisibleGraph() {
  try {
    return app.canvas?.graph ?? getRootGraph();
  } catch (_) {
    return getRootGraph();
  }
}

/**
 * Find the wrapper-node path from `root` down to `targetGraph`.
 * Each step is `{ subgraph, fromNode }` for `canvas.openSubgraph()`.
 * Returns `[]` when `targetGraph === root`, or `null` when unreachable
 * via wrapper nodes (caller may fall back to `canvas.setGraph()`).
 * @param {object} root - Root graph.
 * @param {object} targetGraph - Destination graph.
 * @returns {{subgraph: object, fromNode: object}[]|null} Path steps or null.
 */
export function findSubgraphPathToGraph(root, targetGraph) {
  if (!root || !targetGraph) return null;
  if (root === targetGraph) return [];

  const visited = new Set();
  const dfs = (graph, path) => {
    if (!graph || visited.has(graph)) return null;
    if (graph === targetGraph) return path;
    visited.add(graph);
    for (const node of getGraphNodes(graph)) {
      for (const inner of getInnerGraphsOfNode(node)) {
        const result = dfs(inner, [...path, { subgraph: inner, fromNode: node }]);
        if (result) return result;
      }
    }
    return null;
  };

  return dfs(root, []) ?? null;
}

/**
 * Navigate the canvas so `targetGraph` becomes visible.
 * Descends via `canvas.openSubgraph(subgraph, fromNode)`; exits to root
 * with `canvas.setGraph(root)` first when the target is not reachable by
 * descending from the currently visible graph.
 * @param {object} canvas - The LiteGraph canvas (`app.canvas`).
 * @param {object} root - Root graph.
 * @param {object} targetGraph - Destination graph.
 * @returns {boolean} True when the canvas now shows `targetGraph`.
 */
export function navigateToGraph(canvas, root, targetGraph) {
  if (!canvas || !targetGraph) return false;
  try {
    if (canvas.graph === targetGraph) return true;

    const canOpen = typeof canvas.openSubgraph === "function";
    const canSet = typeof canvas.setGraph === "function";

    const fullPath = (root && root !== targetGraph)
      ? findSubgraphPathToGraph(root, targetGraph)
      : (targetGraph === root ? [] : null);

    if (fullPath) {
      // If the visible graph sits on the path, only descend the suffix.
      const chain = [root, ...fullPath.map((s) => s.subgraph)];
      const currentIndex = chain.indexOf(canvas.graph);
      const steps = currentIndex >= 0 ? fullPath.slice(currentIndex) : null;

      if (steps) {
        for (const step of steps) {
          if (canvas.graph === step.subgraph) continue;
          if (canOpen && step.fromNode) canvas.openSubgraph(step.subgraph, step.fromNode);
          else if (canSet) canvas.setGraph(step.subgraph);
          else return false;
        }
        return canvas.graph === targetGraph;
      }

      // Otherwise exit to root first, then descend the full path.
      if (canvas.graph !== root && canSet) canvas.setGraph(root);
      for (const step of fullPath) {
        if (canvas.graph === step.subgraph) continue;
        if (canOpen && step.fromNode) canvas.openSubgraph(step.subgraph, step.fromNode);
        else if (canSet) canvas.setGraph(step.subgraph);
        else return false;
      }
      return canvas.graph === targetGraph;
    }

    // Reachable via graph collections but not wrapper nodes: direct set.
    if (canSet) {
      canvas.setGraph(targetGraph);
      return canvas.graph === targetGraph;
    }
    return false;
  } catch (_) {
    return false;
  }
}
