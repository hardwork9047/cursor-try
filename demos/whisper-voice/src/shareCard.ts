import { formatMs, formatRtf, formatSeconds, formatWhen } from "./format";
import { MODEL_NAME, MODEL_REVISION, PAGE_URL } from "./model";

const WIDTH = 1200;
const HEIGHT = 675;
const FONT =
  "'Hiragino Sans', 'Noto Sans JP', 'Noto Sans CJK JP', 'Yu Gothic', 'WenQuanYi Micro Hei', 'Droid Sans Fallback', sans-serif";

export type CardRun = {
  transcript: string;
  transcribeMs: number;
  audioSec: number;
  loadMs: number;
  backend: string;
  ranAt: string;
  sourceLabel: string;
  adapterName: string;
};

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillText(text, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const chars = [...text];
  if (chars.length === 0) return ["（モデルの出力は空でした）"];
  const lines: string[] = [];
  let current = "";
  let index = 0;
  while (index < chars.length && lines.length < maxLines) {
    const next = current + chars[index];
    if (current && ctx.measureText(next).width > maxWidth) {
      if (lines.length === maxLines - 1) break;
      lines.push(current);
      current = "";
      continue;
    }
    current = next;
    index += 1;
  }
  if (index < chars.length) {
    let last = current;
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines.push(`${last}…`);
    return lines;
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["（モデルの出力は空でした）"];
}

export function renderShareCard(run: CardRun): HTMLCanvasElement {
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
  ctx.font = `700 34px ${FONT}`;
  line(ctx, "口頭の報告を文字にする", 36, 58);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = "#5f594e";
  line(ctx, `${MODEL_NAME}（多言語） · この端末の中だけ · 音声は送っていません`, 36, 90);

  ctx.strokeStyle = "#2c2822";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(36, 112);
  ctx.lineTo(WIDTH - 36, 112);
  ctx.stroke();

  const rows = [
    ["入力", run.sourceLabel || "—"],
    ["バックエンド", run.backend || "—"],
    ["モデル読込", formatMs(run.loadMs)],
    ["音声の長さ", formatSeconds(run.audioSec)],
    ["文字起こし", formatMs(run.transcribeMs)],
    ["実時間比", formatRtf(run.transcribeMs, run.audioSec)],
    ["GPU", run.adapterName || "—"],
    ["実行", formatWhen(run.ranAt)],
  ];
  rows.forEach((row, index) => {
    const y = 156 + index * 48;
    ctx.fillStyle = "#5f594e";
    ctx.font = `14px ${FONT}`;
    line(ctx, row[0] ?? "", 36, y);
    ctx.fillStyle = "#1a1814";
    ctx.font = `22px ${FONT}`;
    line(ctx, row[1] ?? "—", 36, y + 26);
  });

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(430, 132, 734, 430);
  ctx.strokeStyle = "#2c2822";
  ctx.strokeRect(430, 132, 734, 430);
  ctx.fillStyle = "#1a1814";
  ctx.font = `700 18px ${FONT}`;
  line(ctx, "文字起こし", 454, 166);
  ctx.font = `20px ${FONT}`;
  const body = run.transcript.trim() ? run.transcript.trim() : "";
  const lines = wrap(ctx, body, 686, 14);
  lines.forEach((text, index) => line(ctx, text, 454, 204 + index * 24));

  ctx.fillStyle = "#5f594e";
  ctx.font = `15px ${FONT}`;
  line(ctx, "このカードの数字は、保存したブラウザがその場で測ったものです。実時間比は文字起こしの秒数 ÷ 音声の長さです。", 36, 620);
  ctx.fillStyle = "#1a1814";
  ctx.font = `15px ${FONT}`;
  line(ctx, `${PAGE_URL}  ·  ${MODEL_REVISION.slice(0, 7)}`, 36, 650);
  return canvas;
}
