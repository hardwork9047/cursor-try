import { YOLO_PAGE_URL } from "../config";
import { formatDate, formatMs } from "../format";
import { className } from "./classes";
import { drawScene } from "./draw";
import type { BackendName } from "./protocol";
import type { Box } from "./postprocess";

const WIDTH = 1200;
const HEIGHT = 675;

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function formatFps(fps: number | null): string {
  if (fps == null || !Number.isFinite(fps) || fps <= 0) return "—";
  return fps >= 10 ? fps.toFixed(1) : fps.toFixed(2);
}

export type CardInput = {
  image: CanvasImageSource;
  srcW: number;
  srcH: number;
  boxes: Box[];
  lineY: number | null;
  modelLabel: string;
  backend: BackendName;
  loadMs: number;
  preprocessMs: number;
  inferenceMs: number;
  postprocessMs: number;
  fps: number | null;
  fpsNote: string;
  gpuName: string;
  crossTotal: number | null;
  createdAt: string;
};

async function readyFonts() {
  await Promise.race([
    (async () => {
      await document.fonts.load("700 28px 'IBM Plex Sans JP'");
      await document.fonts.load("500 42px 'IBM Plex Mono'");
      await document.fonts.ready;
    })(),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
}

export async function renderYoloCard(input: CardInput): Promise<Blob> {
  await readyFonts();
  const frame = document.createElement("canvas");
  frame.width = input.srcW;
  frame.height = input.srcH;
  const frameCtx = frame.getContext("2d");
  if (!frameCtx) throw new Error("PNGを作成できませんでした");
  drawScene(frameCtx, input.image, input.srcW, input.srcH, input.boxes, input.lineY);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PNGを作成できませんでした");

  ctx.fillStyle = "#16140f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#e2a30b";
  ctx.fillRect(0, 0, 14, HEIGHT);

  ctx.fillStyle = "#e2a30b";
  ctx.font = "700 18px 'IBM Plex Sans JP'";
  ctx.fillText("生産技術メモ", 36, 36);
  ctx.fillStyle = "#f4efe4";
  ctx.font = "400 18px 'IBM Plex Sans JP'";
  ctx.fillText("YOLO26 ブラウザ検出", 168, 36);
  ctx.textAlign = "right";
  ctx.fillStyle = "#8fd0a8";
  ctx.font = "700 18px 'IBM Plex Sans JP'";
  ctx.fillText("実測", WIDTH - 32, 36);
  ctx.textAlign = "left";

  const photoX = 32;
  const photoY = 56;
  const photoW = 760;
  const photoH = 470;
  const scale = Math.min(photoW / input.srcW, photoH / input.srcH);
  const drawW = input.srcW * scale;
  const drawH = input.srcH * scale;
  const dx = photoX + (photoW - drawW) / 2;
  const dy = photoY + (photoH - drawH) / 2;
  ctx.fillStyle = "#0e0d0b";
  ctx.fillRect(photoX, photoY, photoW, photoH);
  ctx.drawImage(frame, dx, dy, drawW, drawH);

  const summary = input.boxes
    .slice(0, 8)
    .map((box) => `${className(box.classId)} ${(box.score * 100).toFixed(0)}%`)
    .join("  ");
  ctx.fillStyle = "#d9d3c6";
  ctx.font = "400 16px 'IBM Plex Sans JP'";
  ctx.fillText(
    ellipsize(
      ctx,
      summary || "検出 0 件",
      photoW,
    ),
    photoX,
    550,
  );
  if (input.crossTotal != null) {
    ctx.fillText(`ライン通過 ${input.crossTotal}`, photoX, 574);
  }

  const columns = [
    { value: formatMs(input.inferenceMs).replace(" ", ""), label: "推論" },
    { value: formatMs(input.preprocessMs).replace(" ", ""), label: "前処理" },
    { value: formatMs(input.postprocessMs).replace(" ", ""), label: "後処理" },
    { value: formatFps(input.fps), label: "FPS" },
  ];
  columns.forEach((column, index) => {
    const x = 820;
    const y = 92 + index * 92;
    ctx.fillStyle = "#f7f3ea";
    ctx.font = "500 40px 'IBM Plex Mono'";
    ctx.fillText(column.value, x, y);
    ctx.fillStyle = "#e2a30b";
    ctx.font = "700 16px 'IBM Plex Sans JP'";
    ctx.fillText(column.label, x, y + 24);
  });

  ctx.fillStyle = "#8d877c";
  ctx.font = "400 15px 'IBM Plex Sans JP'";
  const meta = [
    input.modelLabel,
    input.backend === "webgpu" ? "WebGPU" : "WASM",
    `読込 ${formatMs(input.loadMs)}`,
    input.fpsNote,
    input.gpuName || "アダプタ名なし",
  ].join(" · ");
  ctx.fillText(ellipsize(ctx, meta, 340), 820, 500);

  ctx.fillStyle = "#b7b1a4";
  ctx.font = "400 16px 'IBM Plex Sans JP'";
  ctx.fillText(`${formatDate(input.createdAt)}    ${YOLO_PAGE_URL}`, 32, 630);
  ctx.font = "400 14px 'IBM Plex Mono'";
  ctx.fillStyle = "#8d877c";
  ctx.fillText("Ultralytics YOLO26 · AGPL-3.0 · 検出数は書き出し時点のフレーム", 32, 654);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png");
  });
  if (!blob) throw new Error("PNGを作成できませんでした");
  return blob;
}
