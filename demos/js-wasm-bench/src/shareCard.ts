import { PAGE_URL } from "./params";
import { formatMs, formatRatio, speedup } from "./stats";
import type { BenchResult, Pair } from "./types";

const WIDTH = 1200;
const HEIGHT = 675;
const FONT =
  "'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'WenQuanYi Micro Hei', 'Droid Sans Fallback', sans-serif";

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillText(text, x, y);
}

function block(ctx: CanvasRenderingContext2D, title: string, pair: Pair, x: number, y: number) {
  ctx.fillStyle = "#1a1814";
  ctx.font = `700 22px ${FONT}`;
  line(ctx, title, x, y);
  ctx.font = `16px ${FONT}`;
  const mark = pair.match ? "一致" : "不一致";
  ctx.fillStyle = pair.match ? "#1d4f3a" : "#a33b32";
  line(ctx, mark, x + 250, y);
  ctx.fillStyle = "#1a1814";
  ctx.font = `15px ${FONT}`;
  const rows = [
    `計算だけ  JS ${formatMs(pair.jsCompute.median)}   WASM ${formatMs(pair.wasmCompute.median)}   ${formatRatio(speedup(pair.jsCompute.median, pair.wasmCompute.median))}`,
    `コピー込み  JS ${formatMs(pair.jsTransfer.median)}   WASM ${formatMs(pair.wasmTransfer.median)}   ${formatRatio(speedup(pair.jsTransfer.median, pair.wasmTransfer.median))}`,
  ];
  rows.forEach((text, index) => line(ctx, text, x, y + 28 + index * 24));
}

export function renderShareCard(result: BenchResult): HTMLCanvasElement {
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
  ctx.font = `700 40px ${FONT}`;
  line(ctx, "JS と WebAssembly の速度", 36, 78);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = "#5f594e";
  const cores = result.cores === null ? "—" : String(result.cores);
  line(ctx, `論理コア ${cores}    ${result.userAgent.slice(0, 110)}`, 36, 112);
  line(ctx, result.ranAt.slice(0, 19).replace("T", " ") + " UTC", 36, 136);

  block(ctx, "外観検査", result.image, 36, 190);
  block(ctx, "ライン", result.line, 36, 310);
  block(ctx, "センサ列", result.sensors, 36, 430);

  ctx.fillStyle = "#5f594e";
  ctx.font = `15px ${FONT}`;
  line(ctx, "中央値。ウォームアップは含まない。倍率は JS ÷ WASM。", 36, 560);
  line(ctx, "このカードの数字は、保存したブラウザがその場で測ったものです。", 36, 586);
  ctx.fillStyle = "#1a1814";
  line(ctx, PAGE_URL, 36, 630);
  return canvas;
}
