export const INPUT_SIZE = 640;

export type Box = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
};

export type Letterbox = {
  gain: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
};

export function letterbox(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  size = INPUT_SIZE,
): { tensor: Float32Array; meta: Letterbox } {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("前処理のキャンバスを初期化できませんでした");

  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, size, size);

  const gain = Math.min(size / srcH, size / srcW);
  const padX = (size - srcW * gain) / 2;
  const padY = (size - srcH * gain) / 2;
  const newW = Math.max(1, Math.round(srcW * gain));
  const newH = Math.max(1, Math.round(srcH * gain));
  const left = Math.round(padX - 0.1);
  const top = Math.round(padY - 0.1);
  ctx.drawImage(source, left, top, newW, newH);

  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  const plane = size * size;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    tensor[i] = data[p] / 255;
    tensor[plane + i] = data[p + 1] / 255;
    tensor[2 * plane + i] = data[p + 2] / 255;
  }
  return { tensor, meta: { gain, padX, padY, srcW, srcH } };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const inter = w * h;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

function nms(boxes: Box[], iouThresh: number): Box[] {
  const byClass = new Map<number, Box[]>();
  for (const box of boxes) {
    const list = byClass.get(box.classId);
    if (list) list.push(box);
    else byClass.set(box.classId, [box]);
  }
  const kept: Box[] = [];
  for (const list of byClass.values()) {
    list.sort((a, b) => b.score - a.score);
    const selected: Box[] = [];
    for (const box of list) {
      if (selected.every((other) => iou(box, other) <= iouThresh)) {
        selected.push(box);
      }
    }
    kept.push(...selected);
  }
  kept.sort((a, b) => b.score - a.score);
  return kept.slice(0, 100);
}

function mapBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  score: number,
  classId: number,
  meta: Letterbox,
): Box | null {
  const left = clamp((x1 - meta.padX) / meta.gain, 0, meta.srcW);
  const top = clamp((y1 - meta.padY) / meta.gain, 0, meta.srcH);
  const right = clamp((x2 - meta.padX) / meta.gain, 0, meta.srcW);
  const bottom = clamp((y2 - meta.padY) / meta.gain, 0, meta.srcH);
  if (right - left < 1 || bottom - top < 1) return null;
  return { x1: left, y1: top, x2: right, y2: bottom, score, classId };
}

function decodeOneToMany(
  output: Float32Array,
  channels: number,
  anchors: number,
  channelFirst: boolean,
  meta: Letterbox,
  conf: number,
): Box[] {
  const numClasses = channels - 4;
  const at = (channel: number, anchor: number) =>
    channelFirst
      ? output[channel * anchors + anchor]
      : output[anchor * channels + channel];
  const boxes: Box[] = [];
  for (let i = 0; i < anchors; i++) {
    let best = 0;
    let bestScore = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = at(4 + c, i);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (bestScore < conf) continue;
    const cx = at(0, i);
    const cy = at(1, i);
    const w = at(2, i);
    const h = at(3, i);
    const box = mapBox(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, bestScore, best, meta);
    if (box) boxes.push(box);
  }
  return boxes;
}

function decodeEndToEnd(
  output: Float32Array,
  count: number,
  meta: Letterbox,
  conf: number,
): Box[] {
  const boxes: Box[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * 6;
    const score = output[o + 4];
    if (score < conf) continue;
    const classId = Math.round(output[o + 5]);
    const box = mapBox(output[o], output[o + 1], output[o + 2], output[o + 3], score, classId, meta);
    if (box) boxes.push(box);
  }
  return boxes;
}

export function decode(
  output: Float32Array,
  dims: readonly number[],
  meta: Letterbox,
  conf: number,
  iou: number,
): Box[] {
  if (dims.length !== 3 || dims[0] !== 1) {
    throw new Error(`未対応の出力形状です (${dims.join("×")})`);
  }
  const a = dims[1];
  const b = dims[2];
  let candidates: Box[];
  if (b === 6 && a <= 300) {
    candidates = decodeEndToEnd(output, a, meta, conf);
  } else if (a === 6 && b <= 300) {
    throw new Error("端到端の出力が列優先です。この書き出しには対応していません");
  } else if (a < b) {
    candidates = decodeOneToMany(output, a, b, true, meta, conf);
  } else {
    candidates = decodeOneToMany(output, b, a, false, meta, conf);
  }
  return nms(candidates, iou);
}
