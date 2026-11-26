// AUN Load Image Pro: the card rows, the source strip with file arrows and
// the live "going in → coming out" preview, in the style of AusBoss's Load
// Image (MIT, github.com/ausboss).

import { api } from "../../scripts/api.js";
import { app } from "../../scripts/app.js";
import { getWidget } from "./widgets.js";
import { collapsedSlotPos, syncCollapseVueLabels, withUESuppressed } from "./index.js";
import { THEME as T, FONT_UI } from "./aun_card_theme.js";
import { comboValues, mountCard } from "./aun_widget_card.js";
import {
  CROP_MODES, cropSideAt, changeText, keptPart, placeText, planLoadSize,
  shapeText, stepFile, thumbSizes,
} from "./aun_load_size.js";

const NODE_TYPE = "AUNImageLoaderPro";
const CSS_ID = "aun-load-image-pro-css";
const SIZES_KEPT = 200;
const sizes = new Map();

const isSource = (mode) => (values) => values.source_mode === mode;
const isFolder = isSource("Batch from Folder");
const isSingle = isSource("Single Image Upload");
const isMode = (...modes) => (values) => modes.includes(values.size);
const usesBox = (values) => ["fit inside", "fit + pad", "crop to fill", "crop", "stretch"].includes(values.size)
  || (values.size === "crop to ratio" && values.ratio === "width : height");

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement("style");
  style.id = CSS_ID;
  style.textContent = `
.aun-load-strip{display:flex;align-items:center;gap:6px;height:100%;min-width:0;font:500 11px/1 ${FONT_UI};color:${T.label}}
.aun-load-step{flex:none;width:26px;height:100%;padding:0;border:1px solid transparent;border-radius:6px;background:${T.fill};color:${T.label};font:600 11px/1 ${FONT_UI};cursor:pointer}
.aun-load-step:hover{background:${T.fillHover};color:${T.inkHover}}
.aun-load-step:focus-visible{outline:2px solid ${T.brand};outline-offset:1px}
.aun-load-step:disabled{opacity:.4;cursor:default}
.aun-load-place{flex:none;color:${T.faint};font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}
.aun-load-view{display:flex;align-items:center;justify-content:center;gap:10px;height:100%;min-width:0;font:500 10px/1.25 ${FONT_UI};color:${T.faint}}
.aun-load-thumb{position:relative;flex:none;overflow:hidden;border-radius:2px;background-color:${T.fill};background-repeat:no-repeat}
.aun-load-thumb.in{background-size:100% 100%}
.aun-load-thumb.in.pick{cursor:pointer}
.aun-load-thumb.out{outline:1px solid ${T.brand};outline-offset:0}
.aun-load-kept{position:absolute;box-sizing:border-box;border:1px solid ${T.brand};box-shadow:0 0 0 400px rgba(8,10,11,.68);pointer-events:none}
.aun-load-note{flex:0 1 auto;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;user-select:none}
.aun-load-note b{color:${T.inkSoft};font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.aun-load-note span{white-space:nowrap}
.aun-load-view[hidden]{display:none}
.aun-load-run{display:flex;flex-direction:column;justify-content:center;gap:1px;height:100%;min-width:0;overflow:hidden;color:${T.faint};font:500 10.5px/1.2 ${FONT_UI};font-variant-numeric:tabular-nums}
.aun-load-run .aun-load-run-dims{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aun-load-run .aun-load-run-dims i{color:${T.faint};font-style:normal;margin:0 4px}
.aun-load-run .aun-load-run-dims b{color:${T.brandInk};font-weight:700}
.aun-load-filename{display:block;height:100%;min-width:0;padding:0 8px;box-sizing:border-box;color:${T.label};font:600 12px/22px ${FONT_UI};text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
`;
  document.head.append(style);
}

function imageViewUrl(value) {
  const text = String(value ?? "");
  const tagged = /^(.*)\s+\[(input|output|temp)\]$/.exec(text);
  const name = tagged ? tagged[1] : text;
  const type = tagged ? tagged[2] : "input";
  const slash = name.lastIndexOf("/");
  const filename = slash >= 0 ? name.slice(slash + 1) : name;
  const subfolder = slash >= 0 ? name.slice(0, slash) : "";
  return api.apiURL(`/view?${new URLSearchParams({ filename, subfolder, type })}`);
}

function fileNameFromValue(value) {
  const text = String(value ?? "");
  const tagged = /^(.*)\s+\[(input|output|temp)\]$/.exec(text);
  const name = tagged ? tagged[1] : text;
  const base = name.split(/[\\/]/).pop() || "";
  return base.replace(/\.[^./\\]+$/, "");
}

// The same word limit the backend puts on the filename outputs, so the card
// shows the name the node will actually emit.
function limitFilenameWords(name, maxWords) {
  const limit = Math.trunc(Number(maxWords) || 0);
  if (limit <= 0) return name;
  const parts = String(name).split(/([_\s\-]+)/);
  let seen = 0;
  const kept = [];
  for (const part of parts) {
    if (part && !/^[_\s\-]+$/.test(part)) seen += 1;
    if (seen > limit) break;
    kept.push(part);
  }
  return kept.join("").replace(/[_\s\-]+$/, "");
}

/** The file's own size, read from the picture the browser shows. */
function readSize(file, done) {
  if (!file) return null;
  const known = sizes.get(file);
  if (known) return known;
  const picture = new Image();
  picture.onload = () => {
    if (sizes.size >= SIZES_KEPT) sizes.delete(sizes.keys().next().value);
    sizes.set(file, { width: picture.naturalWidth, height: picture.naturalHeight });
    if (typeof done === "function") done();
  };
  picture.src = imageViewUrl(file);
  return null;
}

function triggerUpload(node) {
  const upload = getWidget(node, "upload");
  if (typeof upload?.callback === "function") {
    upload.callback();
    return;
  }
  // Older frontends keep the upload button away from node.widgets: do it by hand.
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*";
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("type", "input");
      body.append("overwrite", "true");
      const response = await api.fetchApi("/upload/image", { method: "POST", body });
      const answer = await response.json();
      const value = answer.subfolder ? `${answer.subfolder}/${answer.name}` : answer.name;
      sizes.delete(value);
      const widget = getWidget(node, "image");
      if (widget) {
        widget.value = value;
        widget.callback?.(value, app.canvas, node);
      }
      node.__aunCard?.refresh?.();
    } catch (error) {
      console.warn("[AUN] Could not upload the image:", error);
    }
  };
  picker.click();
}

// The row under the file picker: arrows that step the input list and where
// the file sits in it.
function sourceStrip(node, card) {
  ensureCss();
  const root = document.createElement("div");
  root.className = "aun-load-strip";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "aun-load-step";
  back.textContent = "◀";
  back.title = "The picture before this one in the input folder";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "aun-load-step";
  next.textContent = "▶";
  next.title = "The next picture in the input folder";
  const place = document.createElement("span");
  place.className = "aun-load-place";
  place.title = "Where this picture is in the input folder's list";
  root.append(back, next, place);

  const step = (delta) => {
    const widget = getWidget(node, "image");
    if (!widget) return;
    const files = comboValues(widget);
    const value = stepFile(files, widget.value, delta);
    if (value === null || value === widget.value) return;
    card.setWidget("image", value);
  };
  back.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  let last = {};
  const sync = (values = last) => {
    last = values;
    const widget = getWidget(node, "image");
    const files = comboValues(widget);
    const file = String(values.image ?? "");
    place.textContent = placeText(files, file);
    const stuck = card.linked("image") || stepFile(files, file, 1) === null;
    back.disabled = stuck;
    next.disabled = stuck;
  };
  return { element: root, sync };
}

// The picture going in with the part that is kept lit, and the picture coming
// out, both on one scale, with what the size choice does in words. While the
// choice cuts something, a click on the first picture picks the part to keep.
function beforeAfter(node, card) {
  ensureCss();
  const root = document.createElement("div");
  root.className = "aun-load-view";
  const input = document.createElement("div");
  input.className = "aun-load-thumb in";
  const kept = document.createElement("div");
  kept.className = "aun-load-kept";
  input.append(kept);
  const note = document.createElement("div");
  note.className = "aun-load-note";
  const output = document.createElement("div");
  output.className = "aun-load-thumb out";
  root.append(input, note, output);

  input.addEventListener("click", (event) => {
    if (!input.classList.contains("pick") || card.linked("crop_from")) return;
    const box = input.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return;
    const side = cropSideAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    if (side !== getWidget(node, "crop_from")?.value) card.setWidget("crop_from", side);
  });

  const line = (tag, text) => {
    const item = document.createElement(tag);
    item.textContent = text;
    return item;
  };
  let last = {};
  const sync = (values = last) => {
    last = values;
    const file = String(values.image ?? "");
    const source = readSize(file, () => card.refresh());
    const plan = source ? planLoadSize(source.width, source.height, values) : null;
    root.hidden = !plan;
    if (!plan) return;
    const picture = `url(${JSON.stringify(imageViewUrl(file))})`;
    const boxes = thumbSizes(source.width, source.height, plan, 72, 68);
    const part = keptPart(plan);
    Object.assign(input.style, {
      width: `${boxes.input[0]}px`, height: `${boxes.input[1]}px`, backgroundImage: picture,
    });
    Object.assign(kept.style, {
      left: `${part.x * 100}%`, top: `${part.y * 100}%`,
      width: `${part.width * 100}%`, height: `${part.height * 100}%`,
    });
    const spareWide = plan.resizeWidth - plan.width;
    const spareHigh = plan.resizeHeight - plan.height;
    const padWide = plan.padLeft + plan.padRight;
    const padHigh = plan.padTop + plan.padBottom;
    Object.assign(output.style, {
      width: `${boxes.output[0]}px`, height: `${boxes.output[1]}px`, backgroundImage: picture,
      backgroundColor: padWide || padHigh ? "#000" : "",
      backgroundSize: `${(plan.resizeWidth / plan.width) * 100}% ${(plan.resizeHeight / plan.height) * 100}%`,
      backgroundPosition: `${spareWide > 0 ? (plan.cropX / spareWide) * 100 : padWide ? 50 : 0}% ${spareHigh > 0 ? (plan.cropY / spareHigh) * 100 : padHigh ? 50 : 0}%`,
    });
    const picks = CROP_MODES.includes(values.size) && !card.linked("crop_from");
    input.classList.toggle("pick", picks);
    input.title = picks
      ? "The picture going in. The lit part is kept. Click the part you want to keep."
      : "The picture going in. The lit part is kept.";
    output.title = "The picture coming out.";
    const from = shapeText(source.width, source.height);
    const to = shapeText(plan.width, plan.height);
    const change = changeText(source.width, source.height, plan);
    note.replaceChildren(
      line("b", from === to ? from : `${from} → ${to}`),
      ...(change ? change.split(" · ").map((text) => line("span", text)) : [line("span", "no change")]),
    );
  };
  return { element: root, sync };
}

// The filenames one run loaded. The backend sends this (and every other ui
// value) as a list, because ComfyUI concatenates ui values when it collects
// them; a bare string would arrive split into its characters.
function fileNameList(run) {
  const raw = run?.aun_filename;
  if (raw === null || raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((value) => (Array.isArray(value) ? value.join("") : String(value)))
    .filter(Boolean);
}

// Size read-out: live in single mode, the last run's size in folder mode.
// The file name lives in the label just above the result preview.
function runNote(node, card) {
  const root = document.createElement("div");
  root.className = "aun-load-run";
  let last = {};

  const show = (from, to, extra = "") => {
    root.replaceChildren();
    root.removeAttribute("title");
    const dims = document.createElement("span");
    dims.className = "aun-load-run-dims";
    if (from) {
      dims.append(document.createTextNode(`${from[0]} × ${from[1]}`));
      if (to && (to[0] !== from[0] || to[1] !== from[1])) {
        const arrow = document.createElement("i");
        arrow.textContent = "→";
        const out = document.createElement("b");
        out.textContent = `${to[0]} × ${to[1]}`;
        dims.append(arrow, out);
      }
    }
    if (extra) {
      const sep = document.createElement("i");
      sep.textContent = "·";
      dims.append(sep, document.createTextNode(extra));
    }
    root.append(dims);
    root.title = dims.textContent;
  };

  const sync = (values = last) => {
    last = values;
    if (values.source_mode === "Single Image Upload") {
      const file = String(values.image ?? "");
      if (!fileNameFromValue(file)) {
        root.textContent = "Pick an image to see its size.";
        return;
      }
      const source = readSize(file, () => card.refresh());
      const plan = source ? planLoadSize(source.width, source.height, values) : null;
      if (!source) {
        root.textContent = "";
        return;
      }
      show([source.width, source.height], plan ? [plan.width, plan.height] : null);
      return;
    }

    const run = node.__aunLastRun;
    if (!run) {
      root.textContent = "Run the node to see the size it loaded.";
      return;
    }
    const sizes = Array.isArray(run.aun_sizes) ? run.aun_sizes : [];
    const first = sizes[0];
    const position = Array.isArray(run.aun_position) ? run.aun_position : [];
    show(
      first ? [first[0], first[1]] : null,
      first ? [first[2], first[3]] : null,
      position.length === 2 ? `${position[0]} / ${position[1]}` : "",
    );
  };
  return { element: root, sync };
}

// The filename strip at the bottom of the card, directly above ComfyUI's
// result preview (the placement AUN's single/batch loader has). Single mode
// follows the file picker live; folder mode names the file the last run
// loaded.
function filenameBar(node) {
  ensureCss();
  const root = document.createElement("div");
  root.className = "aun-load-filename";
  let last = {};
  const sync = (values = last) => {
    last = values;
    let text = "";
    let title = "";
    if (values?.source_mode === "Single Image Upload") {
      const name = fileNameFromValue(values.image);
      text = limitFilenameWords(name, values.max_num_words);
      title = name;
    } else {
      const names = fileNameList(node.__aunLastRun);
      if (names.length) {
        text = names[0];
        if (names.length > 1) text += ` +${names.length - 1} more`;
        title = names.join("\n");
      }
    }
    root.textContent = text;
    root.title = title;
  };
  return { element: root, sync };
}

const ROWS = [
  { widget: "source_mode", label: "Source", kind: "segment", labels: { "Single Image Upload": "single", "Batch from Folder": "folder" } },
  {
    widget: "image", label: "Image", kind: "select", when: isSingle,
    button: { text: "Load", title: "Upload a picture into ComfyUI's input folder", onClick: triggerUpload },
  },
  { panel: sourceStrip, height: 24, when: isSingle },
  { panel: runNote, height: 20, when: isSingle },
  { panel: beforeAfter, height: 78, when: isSingle },
  { widget: "path_mode", label: "Folder from", kind: "segment", labels: { "Pre-defined": "list", Manual: "path" }, when: isFolder },
  { widget: "predefined_path", label: "Folder", kind: "select", when: (values) => isFolder(values) && values.path_mode === "Pre-defined" },
  { widget: "manual_path", label: "Path", kind: "text", when: (values) => isFolder(values) && values.path_mode === "Manual" },
  {
    widget: "batch_mode", label: "Batch", kind: "select", when: isFolder,
    labels: { increment: "next", decrement: "previous", random: "random", fixed: "fixed", range: "range", search: "search" },
  },
  { widget: "range_or_pattern", label: "Positions / find", kind: "text", when: isFolder },
  { widget: "output_is_list", label: "All matches", kind: "switch", when: isFolder },
  { panel: runNote, height: 20, when: isFolder },
  { widget: "size", label: "Size", kind: "select" },
  { widget: "megapixels", label: "Megapixels", suffix: "MP", decimals: 2, step: 0.1, when: isMode("megapixels") },
  { widget: "longest_side", label: "Longest side", suffix: "px", when: isMode("longest side") },
  { widget: "scale", label: "Scale", suffix: "×", decimals: 2, step: 0.05, when: isMode("scale") },
  { widget: "ratio", label: "Ratio", kind: "select", when: isMode("crop to ratio") },
  { pair: ["width", "height"], label: "Size", suffixes: ["px", "px"], sep: "×", when: usesBox },
  { widget: "base_resolution", label: "Bucket scale", suffix: "px", when: isMode("framepack bucket") },
  { widget: "crop_from", label: "Keep", kind: "select", when: isMode("crop to fill", "crop", "crop to ratio") },
  { widget: "multiple", label: "Round to", step: 8, snap: true, decimals: 0, when: (values) => values.size !== "off" },
  { group: "more", label: "More" },
  { widget: "method", label: "Method", kind: "select", group: "more" },
  { widget: "enlarge", label: "Enlarge", kind: "switch", onText: "allow", offText: "shrink only", group: "more" },
  { widget: "max_num_words", label: "Filename words", step: 1, decimals: 0, group: "more" },
  { widget: "preview", label: "Result preview", kind: "switch", onText: "on", offText: "off", group: "more", title: "Show ComfyUI's loaded result under the node. Off skips writing the preview file to the temp folder, which is faster for batch and list runs." },
  { widget: "set", label: "Bundle name", kind: "text", placeholder: "optional constant name" },
  { panel: filenameBar, height: 22 },
];

const PK = "collapse_connections";

// Collapse Connections for the card node: only the connection dots converge
// (and their labels hide). The card and every widget stay exactly where they
// are, and the node keeps its height.
function setupCollapse(node) {
  if (node.__aunLoadProCollapseHooked) return;
  node.__aunLoadProCollapseHooked = true;
  node.properties = node.properties || {};

  const isOn = () => Boolean(node.properties?.[PK]);

  const origGetOutputPos = typeof node.getOutputPos === "function" ? node.getOutputPos.bind(node) : null;
  const origGetInputPos = typeof node.getInputPos === "function" ? node.getInputPos.bind(node) : null;
  if (origGetOutputPos) {
    node.getOutputPos = function (index) {
      return isOn() ? collapsedSlotPos(this, false, origGetOutputPos) : origGetOutputPos(index);
    };
  }
  if (origGetInputPos) {
    node.getInputPos = function (index) {
      return isOn() ? collapsedSlotPos(this, true, origGetInputPos) : origGetInputPos(index);
    };
  }

  const origDrawFg = node.onDrawForeground;
  node.onDrawForeground = function (ctx) {
    origDrawFg?.apply(this, arguments);
    const collapsed = isOn();
    for (const slot of [...(this.inputs || []), ...(this.outputs || [])]) {
      // A widget-backed input draws its own dot on the card's row.
      if (this.widgets?.length && slot.widget) continue;
      if (!collapsed) {
        if ("__aun_collapse_origLabel" in slot) {
          slot.label = slot.__aun_collapse_origLabel;
          delete slot.__aun_collapse_origLabel;
        }
        if (slot.label === "" || slot.label === " ") delete slot.label;
        continue;
      }
      if (!("__aun_collapse_origLabel" in slot)) slot.__aun_collapse_origLabel = slot.label;
      // Falsy "" (not " ") so label || name readers fall back to the name.
      slot.label = "";
    }
  };

  const toggle = () => {
    node.properties[PK] = !isOn();
    node.graph?.setDirtyCanvas?.(true, true);
    syncCollapseVueLabels();
  };

  const origMenu = node.getExtraMenuOptions;
  node.getExtraMenuOptions = function (canvas, options) {
    try {
      origMenu?.apply(this, [canvas, options]);
    } catch (error) {
      console.warn("[AUN] menu hook failed", error);
    }
    options.push({
      content: isOn() ? "Show Connections" : "Collapse Connections",
      callback: () => toggle(),
    });
  };

  const origDblClick = node.onDblClick;
  node.onDblClick = function (event, pos) {
    origDblClick?.apply(this, arguments);
    if (Array.isArray(pos) && typeof pos[1] === "number" && pos[1] < 0) return;
    if (app?.canvas?.interacting_widget || app?.canvas?.active_widget) return;
    const active = document.activeElement;
    if (active && (
      active.tagName === "INPUT"
      || active.tagName === "TEXTAREA"
      || active.classList?.contains("litegraph")
      || active.id?.includes("widget")
    )) return;
    withUESuppressed(this, () => toggle());
  };

  // Remote control from AUNCollapseConnectionsController.
  node.__aun_remoteCollapse = (next) => {
    node.properties[PK] = Boolean(next);
    node.graph?.setDirtyCanvas?.(true, true);
    syncCollapseVueLabels();
  };
}

function setup(node) {
  if (node.__aunLoadImagePro) return node.__aunLoadImagePro;
  const card = mountCard(node, { rows: ROWS, minWidth: 340, hide: ["upload"] });
  node.__aunLoadImagePro = card;
  setupCollapse(node);
  return card;
}

app.registerExtension({
  name: "AUNNodes.LoadImagePro",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_TYPE) return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      setup(this);
      return result;
    };
    const onExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const result = onExecuted?.apply(this, arguments);
      this.__aunLastRun = message ?? null;
      this.__aunLoadImagePro?.refresh?.();
      return result;
    };
  },
  loadedGraphNode(node) {
    if (node?.comfyClass !== NODE_TYPE && node?.type !== NODE_TYPE) return;
    setup(node);
    node.__aunLoadImagePro?.refresh?.();
  },
});
