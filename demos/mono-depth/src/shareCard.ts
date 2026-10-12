import { colorize } from "./colormap";
import { formatMs } from "./format";
import { MODEL_LICENSE, MODEL_NAME, PAGE_URL } from "./model";
import type { DepthRun, GpuInfo, Photo } from "./types";

const WIDTH = 1200;
const HEIGHT = 760;
const FONT =
  "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'WenQuanYi Micro Hei', 'Droid Sans Fallback', sans-serif";

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillText(text, x, y);
}

function paint(ctx: CanvasRenderingContext2D, image: ImageData, x: number, y: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const scratch = document.createElement("canvas");
  scratch.width = image.width;
  scratch.height = image.height;
  scratch.getContext("2d")?.putImageData(image, 0, 0);
  ctx.drawImage(scratch, x, y, w, h);
  return { w, h };
}

export function renderShareCard(photo: Photo, run: DepthRun, gpu: GpuInfo | null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("共有カードを描けません");

  ctx.fillStyle = "#e4dccb";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#1a1814";
  ctx.fillRect(0, 0, WIDTH, 8);
  ctx.fillStyle = "#e2a30b";
  ctx.fillRect(0, 8, WIDTH, 8);

  ctx.fillStyle = "#1a1814";
  ctx.font = `700 36px ${FONT}`;
  line(ctx, "一枚の写真から奥行き", 36, 64);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = "#5f594e";
  line(ctx, `${MODEL_NAME} · ${MODEL_LICENSE} · 相対値で、メートルではありません`, 36, 94);

  const original = new ImageData(new Uint8ClampedArray(photo.pixels), photo.width, photo.height);
  const depth = colorize(run.relative, run.width, run.height);
  const left = paint(ctx, original, 36, 120, 520, 300);
  const right = paint(ctx, depth, 36 + left.w + 24, 120, 520, 300);
  ctx.fillStyle = "#1a1814";
  ctx.font = `700 16px ${FONT}`;
  line(ctx, "元画像", 36, 120 + left.h + 24);
  line(ctx, "奥行き（黄が手前）", 36 + left.w + 24, 120 + right.h + 24);

  const gpuName = gpu?.name || "—";
  const rows = [
    `バックエンド  ${run.backend === "webgpu" ? "WebGPU" : "WASM"}`,
    `モデル読込  ${formatMs(run.loadMs)}`,
    `推論  ${formatMs(run.inferMs)}`,
    `画像  ${run.width}×${run.height}`,
    `GPU  ${gpuName}`,
    run.ranAt.slice(0, 19).replace("T", " ") + " UTC",
  ];
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = "#1a1814";
  rows.forEach((text, index) => line(ctx, text, 36, 500 + index * 28));

  ctx.fillStyle = "#5f594e";
  ctx.font = `15px ${FONT}`;
  line(ctx, "このカードの数字は、保存したブラウザがその場で測ったものです。", 36, 690);
  ctx.fillStyle = "#1a1814";
  line(ctx, PAGE_URL, 36, 724);
  return canvas;
}
