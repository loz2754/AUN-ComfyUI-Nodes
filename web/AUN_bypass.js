import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";
import { NODE_MODE, findNodeById } from "./index.js";

function applyRecursive(node, active) {
  if (!node) return;
  node.mode = active ? NODE_MODE.ACTIVE : NODE_MODE.BYPASSED;

  const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
  if (inner && inner._nodes) {
    for (const child of inner._nodes) {
      applyRecursive(child, active);
    }
  }
}

function setAUNBypassState(event) {
  const updates = event.detail.updates || [event.detail];

  for (const update of updates) {
    const node = findNodeById(app.graph, update.node_id);
    if (node) {
      applyRecursive(node, update.is_active);
    }
  }
  app.canvas.setDirty(true);
}

api.addEventListener("AUN_node_bypass_state", setAUNBypassState);
