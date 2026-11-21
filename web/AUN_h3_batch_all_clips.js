import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { fitNodeSize } from "./index.js";

// All-clips preview for batched MiniMax H3 video saves.
//
// Save Video / VHS Video Combine emit one animated image per clip when a batch
// is split by MiniMax H3 Split Video Batch. Their stock preview only shows a
// single clip, so this adds a grid of every clip from the run.
//
// It deliberately touches NOTHING unless it has attached its own widget to the
// node: resizing every output node after execution would clobber user-set and
// workflow-restored heights on other custom nodes (and, for nodes that persist
// their height on onResize, write the shrunken height back into the workflow).

const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv)$/i;

function isVideoEntry(entry, animated) {
  const filename = entry?.filename ?? "";
  const extOk = VIDEO_EXT_RE.test(filename);
  if (animated !== undefined) {
    return animated && extOk;
  }
  const format = entry?.format ?? "";
  if (format.startsWith("video/")) return true;
  return extOk;
}

function buildClipList(message) {
  const clips = [];
  if (!message) return clips;

  if (Array.isArray(message.images)) {
    const animatedArr = Array.isArray(message.animated) ? message.animated : [];
    message.images.forEach((entry, i) => {
      const animated = animatedArr[i] ?? false;
      if (isVideoEntry(entry, animated)) {
        clips.push({
          filename: entry.filename,
          subfolder: entry.subfolder,
          type: entry.type,
        });
      }
    });
  }

  if (Array.isArray(message.gifs)) {
    message.gifs.forEach((entry) => {
      if (isVideoEntry(entry, undefined)) {
        clips.push({
          filename: entry.filename,
          subfolder: entry.subfolder,
          type: entry.type,
        });
      }
    });
  }

  return clips;
}

function clipUrl(clip, t) {
  const params = new URLSearchParams({
    filename: clip.filename,
    subfolder: clip.subfolder ?? "",
    type: clip.type ?? "output",
  });
  return api.apiURL("/view?" + params.toString() + "&t=" + t);
}

function ensureWidget(node) {
  if (node.__aunH3AllClips) return node.__aunH3AllClips;

  const root = document.createElement("div");
  root.style.boxSizing = "border-box";
  root.style.width = "100%";
  root.style.padding = "4px";
  root.style.font = "12px sans-serif";
  root.style.color = "var(--input-text, #ddd)";
  root.style.display = "none";

  const widget = node.addDOMWidget("aun_h3_all_clips", "aun_h3_all_clips", root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => {
      const h = root.scrollHeight;
      return h > 0 ? h : 0;
    },
  });

  node.__aunH3AllClips = { widget, root };

  // The stock preview widget is rebuilt after outputs change; re-hide it on draw.
  const origDraw = node.onDrawForeground;
  node.onDrawForeground = function () {
    const r = origDraw?.apply(this, arguments);
    if (root.style.display !== "none" && setStockPreviewHidden(node, true)) {
      fitNodeSize(node);
    }
    return r;
  };
  return node.__aunH3AllClips;
}

function setStockPreviewHidden(node, hidden) {
  try {
    const w = node.widgets?.find((x) => x.name === "video-preview");
    if (!w) return;

    if (hidden) {
      if (w.__aunH3OrigLayout !== undefined) return false;
      w.__aunH3OrigLayout = w.computeLayoutSize ?? null;
      w.computeLayoutSize = () => ({ minHeight: 0, minWidth: 0 });
      if (w.element) {
        w.element.style.display = "none";
      }
      return true;
    }

    if (w.__aunH3OrigLayout !== undefined) {
      w.computeLayoutSize = w.__aunH3OrigLayout ?? undefined;
      delete w.__aunH3OrigLayout;
    }
    if (w.element) {
      w.element.style.display = "";
    }
  } catch (e) {
    // ignore
  }
}

function clearClips(node) {
  const { root } = node.__aunH3AllClips;
  root.replaceChildren();
  root.style.display = "none";
  setStockPreviewHidden(node, false);
  fitNodeSize(node);
}

function showClips(node, message) {
  try {
    const clips = buildClipList(message);

    if (clips.length < 2) {
      // Nothing of ours on this node -> leave its size and preview alone.
      if (!node.__aunH3AllClips) return;
      if (node.__aunH3AllClips.root.style.display === "none") return;
      clearClips(node);
      return;
    }

    const { root } = ensureWidget(node);
    root.style.display = "";
    root.replaceChildren();
    setStockPreviewHidden(node, true);

    const header = document.createElement("div");
    header.textContent = `All ${clips.length} clips from this run`;
    root.appendChild(header);

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${Math.min(clips.length, 2)}, 1fr)`;
    grid.style.gap = "6px";
    root.appendChild(grid);

    const t = Date.now();

    clips.forEach((clip, i) => {
      const cell = document.createElement("div");
      cell.style.background = "rgba(0,0,0,0.25)";
      cell.style.borderRadius = "4px";
      cell.style.padding = "4px";

      const label = document.createElement("div");
      label.textContent = `Clip ${i + 1} of ${clips.length}`;
      label.style.cursor = "pointer";
      label.addEventListener("click", () => {
        window.open(clipUrl(clip, t), "_blank");
      });
      cell.appendChild(label);

      const filenameLine = document.createElement("div");
      filenameLine.textContent = clip.filename;
      filenameLine.style.fontSize = "10px";
      filenameLine.style.opacity = "0.7";
      filenameLine.style.whiteSpace = "nowrap";
      filenameLine.style.overflow = "hidden";
      filenameLine.style.textOverflow = "ellipsis";
      cell.appendChild(filenameLine);

      const video = document.createElement("video");
      video.controls = true;
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.style.width = "100%";
      video.style.display = "block";
      video.src = clipUrl(clip, t);

      video.addEventListener("loadedmetadata", () => {
        setStockPreviewHidden(node, true);
        fitNodeSize(node);
      });

      video.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
      });

      cell.appendChild(video);
      grid.appendChild(cell);
    });

    [300, 1000, 2500].forEach((ms) =>
      setTimeout(() => {
        if (node.__aunH3AllClips?.root.style.display !== "none") {
          setStockPreviewHidden(node, true);
          fitNodeSize(node);
        }
      }, ms),
    );

    fitNodeSize(node);
  } catch (err) {
    console.warn("[AUN] h3 all-clips preview:", err);
  }
}

app.registerExtension({
  name: "AUNNodes.H3BatchAllClips",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!nodeData.output_node) return;

    const orig = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      orig?.apply(this, arguments);
      showClips(this, message);
    };
  },
});
