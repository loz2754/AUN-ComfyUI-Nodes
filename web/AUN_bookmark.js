import { app } from "../../scripts/app.js";
import {
  findNodesMatching,
  getRootGraph,
  getVisibleGraph,
  navigateToGraph,
} from "./index.js";

function getBookmarkKey(node) {
  const w = node.widgets?.find?.((w) => w.name === "shortcut_key");
  return (w?.value ?? "").toLowerCase().trim();
}

function findBookmarkCandidatesByKey(key) {
  const norm = (key ?? "").toLowerCase().trim();
  if (!norm) return [];
  const root = getRootGraph();
  if (!root) return [];
  return findNodesMatching(
    root,
    (n) => n.comfyClass === "AUNBookmark" && getBookmarkKey(n) === norm,
  );
}

function resolveBookmarkWinner(candidates) {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0].node;
  const visible = getVisibleGraph();
  const inVisible = candidates.find((c) => c.graph === visible);
  return (inVisible || candidates[0]).node;
}

function applyBookmarkViewport(canvas, node) {
  if (!canvas || !canvas.ds || !node) return;
  const zoomWidget = node.widgets?.find?.((w) => w.name === "zoom");
  const zoom = parseFloat(zoomWidget?.value || 1);

  // rgthree style: place node at top-left
  // LiteGraph coordinate system: screen_pos = (world_pos * scale) + offset
  // To have world_pos at (16, 40) on screen:
  // 16 = (this.pos[0] * zoom) + offset[0]  => offset[0] = 16 - (this.pos[0] * zoom)

  canvas.ds.scale = zoom;
  canvas.ds.offset[0] = 16 - node.pos[0] * zoom;
  canvas.ds.offset[1] = 40 - node.pos[1] * zoom;

  canvas.setDirty(true, true);
}

app.registerExtension({
  name: "AUN.Bookmark",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name === "AUNBookmark") {
      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        if (onNodeCreated) onNodeCreated.apply(this, arguments);

        this.title = "🔖";

        // Ensure zoom widget has correct precision
        const zoomWidget = this.widgets.find((w) => w.name === "zoom");
        if (zoomWidget) {
          zoomWidget.options = zoomWidget.options || {};
          zoomWidget.options.precision = 3;
          zoomWidget.options.step = 0.001;
        }

        // Keypress handler
        this.__AUN_onKeypress = (event) => {
          // Don't trigger if typing in an input
          const target = event.target;
          if (
            target?.tagName === "INPUT" ||
            target?.tagName === "TEXTAREA" ||
            target?.isContentEditable
          ) {
            return;
          }

          const shortcut = getBookmarkKey(this);
          if (!shortcut) return;

          // Support single character or "Digit1", "KeyA" etc if needed, but let's keep it simple
          if (event.key.toLowerCase() === shortcut) {
            // With duplicate keys across graph levels, only the winning
            // instance jumps: prefer the bookmark in the visible graph.
            const winner = resolveBookmarkWinner(
              findBookmarkCandidatesByKey(shortcut),
            );
            if (winner && winner !== this) return;
            this.__AUN_goToBookmark();
            event.preventDefault();
            event.stopPropagation();
          }
        };

        this.__AUN_goToBookmark = () => {
          const canvas = app.canvas;
          if (!canvas || !canvas.ds) return;

          // The bookmark may live inside a subgraph while the canvas shows
          // another graph level. Navigate there first so this.pos is valid.
          const ownerGraph =
            this.graph || getVisibleGraph() || getRootGraph();
          if (ownerGraph && canvas.graph !== ownerGraph) {
            const root = getRootGraph();
            navigateToGraph(canvas, root || ownerGraph, ownerGraph);
          }

          // Defer one frame: entering a subgraph restores its cached
          // viewport asynchronously, which would overwrite ds otherwise.
          requestAnimationFrame(() => applyBookmarkViewport(canvas, this));
        };

        window.addEventListener("keydown", this.__AUN_onKeypress);
      };

      const onRemoved = nodeType.prototype.onRemoved;
      nodeType.prototype.onRemoved = function () {
        if (onRemoved) onRemoved.apply(this, arguments);
        if (this.__AUN_onKeypress) {
          window.removeEventListener("keydown", this.__AUN_onKeypress);
        }
      };
    }
  },
});
