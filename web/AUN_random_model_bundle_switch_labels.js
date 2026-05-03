import { app } from "../../scripts/app.js";

const NODE_CLASS = "AUNRandomModelBundleSwitch";
const MAX_SLOTS = 10;

function getOriginNodeFromInputLink(graph, inputSlot) {
  if (!graph || !inputSlot || inputSlot.link == null) return null;

  const links = graph.links;
  let link = null;
  if (Array.isArray(links)) {
    link =
      links.find(
        (entry) => Array.isArray(entry) && entry[0] === inputSlot.link,
      ) || null;
    if (Array.isArray(link) && link.length >= 2) {
      return graph.getNodeById(link[1]);
    }
    return null;
  }

  link = links?.[inputSlot.link] ?? null;
  if (!link) return null;
  const originId = link.origin_id ?? link[1];
  if (originId == null) return null;
  return graph.getNodeById(originId);
}

function updateModelInputLabels(node) {
  if (!node || node.comfyClass !== NODE_CLASS) return;

  for (let i = 1; i <= MAX_SLOTS; i++) {
    const inputName = `model_${i}`;
    const inputSlot = node.inputs?.find((slot) => slot.name === inputName);
    if (!inputSlot) continue;

    // Keep stable slot labels for clarity; backend derives human-readable titles.
    inputSlot.label = inputName;
  }

  node.setDirtyCanvas?.(true, true);
}

function updateAllBundleSwitchNodes() {
  const graph = app.graph;
  if (!graph?._nodes) return;
  for (const node of graph._nodes) {
    if (node?.comfyClass === NODE_CLASS) {
      updateModelInputLabels(node);
    }
  }
}

app.registerExtension({
  name: "AUN.RandomModelBundleSwitch.Labels",

  nodeCreated(node) {
    if (node.comfyClass === NODE_CLASS) {
      updateModelInputLabels(node);
    }
  },

  loadedGraphNode(node) {
    if (node.comfyClass === NODE_CLASS) {
      updateModelInputLabels(node);
    }
  },

  nodeInputConnected(node) {
    if (node.comfyClass === NODE_CLASS) {
      updateModelInputLabels(node);
    }
  },

  nodeInputDisconnected(node) {
    if (node.comfyClass === NODE_CLASS) {
      updateModelInputLabels(node);
    }
  },
});

// Keep labels synced when connected node titles are renamed.
const lastTitles = Object.create(null);
function pollForTitleChanges() {
  const graph = app.graph;
  if (graph?._nodes) {
    let changed = false;
    for (const node of graph._nodes) {
      const key = String(node.id);
      const currentTitle = node.title || "";
      if (lastTitles[key] !== currentTitle) {
        lastTitles[key] = currentTitle;
        changed = true;
      }
    }
    if (changed) {
      updateAllBundleSwitchNodes();
    }
  }
  requestAnimationFrame(pollForTitleChanges);
}

pollForTitleChanges();
