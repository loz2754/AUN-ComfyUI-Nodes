// The size a picture comes out at, worked out in the browser so the node can
// show it before a run. This repeats plan_load_size in
// aun_load_image_shared.py; tools/check_load_size_parity.py holds both to the
// same answers. No DOM in here.
//
// Adapted from AusBoss's load_size.mjs (MIT, github.com/ausboss).

export const SIZE_MODES = Object.freeze([
  "off", "megapixels", "longest side", "scale", "fit inside", "fit + pad",
  "crop to fill", "crop", "crop to ratio", "stretch", "framepack bucket",
]);

export const CROP_SIDES = Object.freeze([
  "center", "top", "bottom", "left", "right",
  "top left", "top right", "bottom left", "bottom right",
]);

export const RATIOS = Object.freeze([
  "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "5:4", "4:5",
  "21:9", "9:21", "2:1", "1:2", "width : height",
]);

// The FramePack buckets, ascending so a tie picks the same one as the
// backend's sorted tuple.
const BUCKETS = Object.freeze([
  [416, 960], [448, 864], [480, 832], [512, 768], [544, 704], [576, 672],
  [608, 640], [640, 608], [672, 576], [704, 544], [768, 512], [832, 480],
  [864, 448], [960, 416],
]);

export const CROP_MODES = Object.freeze(["crop to fill", "crop", "crop to ratio"]);

const roundHalfUp = (value) => Math.floor(value + 0.5);
const whole = (value, fallback) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
const nearest = (value, step) => Math.max(step, roundHalfUp(value / step) * step);
const below = (value, step) => Math.max(1, Math.floor(value / step) * step);
const inside = (value, step) => (value >= step ? Math.floor(value / step) * step : value);
const cropStart = (spare, side, low, high) => (side.includes(low) ? 0 : side.includes(high) ? spare : Math.floor(spare / 2));

function ratioTerms(ratio, width, height) {
  if (ratio === "width : height") return [Math.max(1, width), Math.max(1, height)];
  const [across, down] = String(ratio ?? "1:1").split(":").map((term) => Math.trunc(Number(term)));
  return [Math.max(1, across || 1), Math.max(1, down || 1)];
}

export function nearestBucket(height, width, resolution = 640) {
  let metric = Infinity;
  let best = null;
  for (const [bucketH, bucketW] of BUCKETS) {
    const value = Math.abs(height * bucketW - width * bucketH);
    if (value <= metric) { metric = value; best = [bucketH, bucketW]; }
  }
  if (!best) return [Math.max(16, Math.round(height / 16) * 16), Math.max(16, Math.round(width / 16) * 16)];
  if (resolution !== 640) {
    const scale = resolution / 640;
    best = [
      Math.max(16, Math.round((best[0] * scale) / 16) * 16),
      Math.max(16, Math.round((best[1] * scale) / 16) * 16),
    ];
  }
  return best;
}

/**
 * What one picture is resized to and where it is cropped or padded.
 * Returns null when the source size is unknown.
 */
export function planLoadSize(sourceWidth, sourceHeight, values = {}) {
  const sourceW = whole(sourceWidth, 0);
  const sourceH = whole(sourceHeight, 0);
  const size = values.size ?? "off";
  if (sourceW <= 0 || sourceH <= 0 || !SIZE_MODES.includes(size)) return null;

  const same = {
    resizeWidth: sourceW, resizeHeight: sourceH,
    cropX: 0, cropY: 0, padLeft: 0, padTop: 0, padRight: 0, padBottom: 0,
    width: sourceW, height: sourceH,
  };
  if (size === "off") return same;

  const step = Math.max(1, whole(values.multiple, 8));
  const enlarge = values.enlarge !== false;
  const boxW = Math.max(1, whole(values.width, 1024));
  const boxH = Math.max(1, whole(values.height, 1024));
  const side = CROP_SIDES.includes(values.crop_from) ? values.crop_from : "center";

  const cut = (resizeWidth, resizeHeight, width, height) => ({
    resizeWidth, resizeHeight,
    cropX: cropStart(resizeWidth - width, side, "left", "right"),
    cropY: cropStart(resizeHeight - height, side, "top", "bottom"),
    padLeft: 0, padTop: 0, padRight: 0, padBottom: 0,
    width, height,
  });

  const padTo = (canvasWidth, canvasHeight) => {
    const canvasW = Math.max(1, Math.trunc(canvasWidth));
    const canvasH = Math.max(1, Math.trunc(canvasHeight));
    let fit = Math.min(canvasW / sourceW, canvasH / sourceH);
    if (!enlarge) fit = Math.min(fit, 1);
    const resizeW = Math.min(canvasW, Math.max(1, roundHalfUp(sourceW * fit)));
    const resizeH = Math.min(canvasH, Math.max(1, roundHalfUp(sourceH * fit)));
    const left = Math.floor((canvasW - resizeW) / 2);
    const top = Math.floor((canvasH - resizeH) / 2);
    return {
      resizeWidth: resizeW, resizeHeight: resizeH,
      cropX: 0, cropY: 0,
      padLeft: left, padTop: top,
      padRight: canvasW - resizeW - left,
      padBottom: canvasH - resizeH - top,
      width: canvasW, height: canvasH,
    };
  };

  if (size === "crop") {
    return cut(sourceW, sourceH, Math.max(1, inside(Math.min(boxW, sourceW), step)), Math.max(1, inside(Math.min(boxH, sourceH), step)));
  }

  if (size === "crop to ratio") {
    const [across, down] = ratioTerms(values.ratio, boxW, boxH);
    let width;
    let height;
    if (sourceW * down >= sourceH * across) {
      width = Math.min(sourceW, Math.max(1, roundHalfUp((sourceH * across) / down)));
      height = sourceH;
    } else {
      height = Math.min(sourceH, Math.max(1, roundHalfUp((sourceW * down) / across)));
      width = sourceW;
    }
    return cut(sourceW, sourceH, Math.max(1, inside(width, step)), Math.max(1, inside(height, step)));
  }

  if (size === "crop to fill") {
    let canvasW = boxW;
    let canvasH = boxH;
    if (!enlarge) {
      const grow = Math.max(canvasW / sourceW, canvasH / sourceH);
      if (grow > 1) {
        canvasW = Math.max(1, Math.floor(canvasW / grow + 1e-6));
        canvasH = Math.max(1, Math.floor(canvasH / grow + 1e-6));
      }
      canvasW = Math.min(below(canvasW, step), Math.max(step, sourceW));
      canvasH = Math.min(below(canvasH, step), Math.max(step, sourceH));
    } else {
      canvasW = nearest(canvasW, step);
      canvasH = nearest(canvasH, step);
    }
    const cover = Math.max(canvasW / sourceW, canvasH / sourceH);
    const resizeW = Math.max(canvasW, Math.ceil(sourceW * cover - 1e-6));
    const resizeH = Math.max(canvasH, Math.ceil(sourceH * cover - 1e-6));
    return cut(resizeW, resizeH, canvasW, canvasH);
  }

  if (size === "stretch") {
    return cut(below(boxW, step), below(boxH, step), below(boxW, step), below(boxH, step));
  }

  if (size === "framepack bucket") {
    const [bucketH, bucketW] = nearestBucket(sourceH, sourceW, Math.max(64, whole(values.base_resolution, 640)));
    return padTo(bucketW, bucketH);
  }

  if (size === "fit + pad") {
    const canvasW = enlarge ? nearest(boxW, step) : Math.min(below(boxW, step), Math.max(step, sourceW));
    const canvasH = enlarge ? nearest(boxH, step) : Math.min(below(boxH, step), Math.max(step, sourceH));
    return padTo(canvasW, canvasH);
  }

  let targetW;
  let targetH;
  if (size === "megapixels") {
    const amount = Number(values.megapixels);
    if (!(amount > 0)) {
      targetW = sourceW; targetH = sourceH;
    } else {
      const factor = Math.sqrt((amount * 1e6) / (sourceW * sourceH));
      targetW = Math.max(1, roundHalfUp(sourceW * factor));
      targetH = Math.max(1, roundHalfUp(sourceH * factor));
    }
  } else if (size === "longest side") {
    const edge = whole(values.longest_side, 0);
    if (edge <= 0) {
      targetW = sourceW; targetH = sourceH;
    } else {
      const factor = edge / Math.max(sourceW, sourceH);
      targetW = Math.max(1, roundHalfUp(sourceW * factor));
      targetH = Math.max(1, roundHalfUp(sourceH * factor));
    }
  } else if (size === "scale") {
    const factor = Number(values.scale);
    if (!(factor > 0)) {
      targetW = sourceW; targetH = sourceH;
    } else {
      targetW = Math.max(1, roundHalfUp(sourceW * factor));
      targetH = Math.max(1, roundHalfUp(sourceH * factor));
    }
  } else {
    const fit = Math.min(boxW / sourceW, boxH / sourceH);
    targetW = Math.max(1, roundHalfUp(sourceW * fit));
    targetH = Math.max(1, roundHalfUp(sourceH * fit));
  }

  let width = nearest(targetW, step);
  let height = nearest(targetH, step);
  if (size === "fit inside") {
    if (width > boxW) width = below(boxW, step);
    if (height > boxH) height = below(boxH, step);
  }
  if (!enlarge) {
    if (width > sourceW) width = below(sourceW, step);
    if (height > sourceH) height = below(sourceH, step);
  }
  return cut(width, height, width, height);
}

// "912 × 1632" or "912 × 1632 → 1144 × 2048".
export function sizeText(sourceWidth, sourceHeight, plan) {
  if (!(sourceWidth > 0 && sourceHeight > 0)) return "";
  const from = `${sourceWidth} × ${sourceHeight}`;
  if (!plan || (plan.width === sourceWidth && plan.height === sourceHeight)) return from;
  return `${from} → ${plan.width} × ${plan.height}`;
}

// What a plan does to the picture, in a few words: "77% size", "cuts 449 px of height".
export function changeText(sourceWidth, sourceHeight, plan) {
  if (!plan || !(sourceWidth > 0 && sourceHeight > 0)) return "";
  const parts = [];
  const percent = Math.round((plan.resizeWidth / sourceWidth) * 100);
  if (plan.resizeWidth !== sourceWidth || plan.resizeHeight !== sourceHeight) parts.push(`${percent}% size`);
  const cutWide = Math.round(((plan.resizeWidth - plan.width) * sourceWidth) / plan.resizeWidth);
  const cutHigh = Math.round(((plan.resizeHeight - plan.height) * sourceHeight) / plan.resizeHeight);
  if (cutWide > 0 && cutHigh > 0) parts.push(`cuts ${cutWide} × ${cutHigh} px`);
  else if (cutWide > 0) parts.push(`cuts ${cutWide} px of width`);
  else if (cutHigh > 0) parts.push(`cuts ${cutHigh} px of height`);
  const padWide = plan.padLeft + plan.padRight;
  const padHigh = plan.padTop + plan.padBottom;
  if (padWide > 0 && padHigh > 0) parts.push(`pads ${padWide} × ${padHigh} px`);
  else if (padWide > 0) parts.push(`pads ${padWide} px of width`);
  else if (padHigh > 0) parts.push(`pads ${padHigh} px of height`);
  return parts.join(" · ");
}

const SHAPES = [[1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9]];

export function shapeText(width, height) {
  if (!(width > 0 && height > 0)) return "";
  const wide = width >= height;
  const value = wide ? width / height : height / width;
  const near = SHAPES.find(([across, down]) => Math.abs(value - across / down) <= (across / down) * 0.01);
  if (near) return wide ? `${near[0]}:${near[1]}` : `${near[1]}:${near[0]}`;
  const rounded = Math.round(value * 100) / 100;
  return wide ? `~${rounded}:1` : `~1:${rounded}`;
}

export function keptPart(plan) {
  if (!plan) return { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: plan.cropX / plan.resizeWidth,
    y: plan.cropY / plan.resizeHeight,
    width: Math.min(1, plan.width / plan.resizeWidth),
    height: Math.min(1, plan.height / plan.resizeHeight),
  };
}

export function thumbSizes(sourceWidth, sourceHeight, plan, maxWidth, maxHeight, least = 10) {
  const outW = plan?.width ?? sourceWidth;
  const outH = plan?.height ?? sourceHeight;
  const scale = Math.min(maxWidth / Math.max(sourceWidth, outW), maxHeight / Math.max(sourceHeight, outH));
  const at = (value) => Math.max(least, Math.round(value * scale));
  return { input: [at(sourceWidth), at(sourceHeight)], output: [at(outW), at(outH)] };
}

const THIRD = (value) => (value < 1 / 3 ? 0 : value < 2 / 3 ? 1 : 2);
const SIDE_GRID = [
  "top left", "top", "top right",
  "left", "center", "right",
  "bottom left", "bottom", "bottom right",
];

export function cropSideAt(x, y) {
  return SIDE_GRID[THIRD(y) * 3 + THIRD(x)];
}

export function stepFile(files, current, delta) {
  const list = (Array.isArray(files) ? files : []).filter((name) => name !== "" && name != null);
  if (!list.length) return null;
  const at = list.indexOf(current);
  if (at < 0) return delta < 0 ? list[list.length - 1] : list[0];
  if (list.length === 1) return null;
  return list[(at + (delta < 0 ? -1 : 1) + list.length) % list.length];
}

export function placeText(files, current) {
  const list = (Array.isArray(files) ? files : []).filter((name) => name !== "" && name != null);
  if (!list.length) return "";
  const at = list.indexOf(current);
  return `${at < 0 ? "–" : at + 1} / ${list.length}`;
}
