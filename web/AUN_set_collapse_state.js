import { app } from "../../scripts/app.js";
import { findNodeById, forceGraphRedraw } from "./index.js";

function applyCollapseRecursive(node, collapse) {
  if (!node) return;
  // Directly set the collapsed flag without calling collapse() to avoid side effects on bypass/mute state
  if (!node.flags) node.flags = {};
  node.flags.collapsed = !!collapse;

  const inner = node.getInnerGraph?.() || node.subgraph || node.inner_graph;
  if (inner && inner._nodes) {
    for (const child of inner._nodes) {
      applyCollapseRecursive(child, collapse);
    }
  }
}

app.registerExtension({
  name: "AUN.SetCollapseState.Event",
  async setup(app) {
    app.api.addEventListener("AUN_set_collapse_state", (event) => {
      const updates = event.detail.updates || [event.detail];

      for (const update of updates) {
        if (typeof update.node_id !== "undefined" && typeof update.collapse !== "undefined") {
          const node = findNodeById(app.graph, update.node_id);
          if (node) {
            applyCollapseRecursive(node, update.collapse);
          }
        }
      }
      forceGraphRedraw(app);
    });
  },
});
