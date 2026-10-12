import { PAGE_URL } from "./params";
import { formatMs, formatSpeedup } from "./stats";
import type { BenchResult, Pair } from "./types";

const WIDTH = 1200;
const HEIGHT = 760;
const FONT =
  "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'WenQuanYi Micro Hei', 'Droid Sans Fallback', sans-serif";
const JS_YELLOW = "#e2a30b";
const RUST_ORANGE = "#e25b12";
const INK = "#1a1814";
const PAPER = "#fffdf8";

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillText(text, x, y);
}

function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  color: string,
): number {
  ctx.font = `700 18px ${FONT}`;
  const width = ctx.measureText(text).width + 18;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y - 18, width, 26);
  ctx.fillStyle = color;
  line(ctx, text, x + 9, y);
  return width;
}

function block(ctx: CanvasRenderingContext2D, title: string, pair: Pair, x: number, y: number): number {
  ctx.fillStyle = INK;
  ctx.font = `700 22px ${FONT}`;
  line(ctx, title, x, y);
  ctx.font = `700 16px ${FONT}`;
  const mark = pair.match ? "一致" : "不一致";
  ctx.fillStyle = pair.match ? "#1d4f3a" : "#a33b32";
  line(ctx, mark, x + 220, y);

  const jsWidth = chip(ctx, "JavaScript", x, y + 36, JS_YELLOW, INK);
  ctx.fillStyle = INK;
  ctx.font = `16px ${FONT}`;
  line(
    ctx,
    `計算だけ ${formatMs(pair.jsCompute.median)}    コピー込み ${formatMs(pair.jsTransfer.median)}`,
    x + jsWidth + 12,
    y + 36,
  );

  const rustWidth = chip(ctx, "Rust（WebAssembly）", x, y + 70, RUST_ORANGE, PAPER);
  ctx.fillStyle = INK;
  ctx.font = `16px ${FONT}`;
  line(
    ctx,
    `計算だけ ${formatMs(pair.wasmCompute.median)}    コピー込み ${formatMs(pair.wasmTransfer.median)}`,
    x + rustWidth + 12,
    y + 70,
  );

  ctx.font = `700 18px ${FONT}`;
  ctx.fillStyle = INK;
  line(ctx, `計算だけ  ${formatSpeedup(pair.jsCompute.median, pair.wasmCompute.median)}`, x, y + 106);
  line(ctx, `コピー込み  ${formatSpeedup(pair.jsTransfer.median, pair.wasmTransfer.median)}`, x, y + 132);
  return y + 156;
}

export function renderShareCard(result: BenchResult): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("共有カードを描けません");

  ctx.fillStyle = "#e4dccb";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, WIDTH, 8);
  ctx.fillStyle = JS_YELLOW;
  ctx.fillRect(0, 8, WIDTH / 2, 8);
  ctx.fillStyle = RUST_ORANGE;
  ctx.fillRect(WIDTH / 2, 8, WIDTH / 2, 8);

  ctx.fillStyle = INK;
  ctx.font = `700 36px ${FONT}`;
  line(ctx, "JavaScript と Rust の速度", 36, 64);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = "#5f594e";
  line(ctx, "Rust のコードは WebAssembly にコンパイルして、ブラウザの中で動かします。", 36, 94);
  const cores = result.cores === null ? "—" : String(result.cores);
  line(ctx, `論理コア ${cores}    ${result.userAgent.slice(0, 110)}`, 36, 122);
  line(ctx, result.ranAt.slice(0, 19).replace("T", " ") + " UTC", 36, 146);

  let y = block(ctx, "外観検査", result.image, 36, 186);
  y = block(ctx, "ライン", result.line, 36, y);
  block(ctx, "センサ列", result.sensors, 36, y);

  ctx.fillStyle = "#5f594e";
  ctx.font = `15px ${FONT}`;
  line(ctx, "中央値。ウォームアップは含まない。速さの文は、測った時間から作っています。", 36, 690);
  line(ctx, "このカードの数字は、保存したブラウザがその場で測ったものです。", 36, 714);
  ctx.fillStyle = INK;
  line(ctx, PAGE_URL, 36, 742);
  return canvas;
}
