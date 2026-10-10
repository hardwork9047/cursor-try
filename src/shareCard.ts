import { MAX_TOKENS, PAGE_URL, TEMPERATURE } from "./config";
import { formatCycle, formatDate, formatLoad, formatMs, formatTok } from "./format";
import type { RunRecord } from "./types";

const WIDTH = 1200;
const HEIGHT = 675;

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

export async function renderShareCard(run: RunRecord): Promise<Blob> {
  await Promise.race([
    (async () => {
      await document.fonts.load("700 64px 'IBM Plex Sans JP'");
      await document.fonts.load("400 28px 'IBM Plex Sans JP'");
      await document.fonts.load("500 72px 'IBM Plex Mono'");
      await document.fonts.ready;
    })(),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PNGを作成できませんでした");

  ctx.fillStyle = "#16140f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#e2a30b";
  ctx.fillRect(0, 0, 18, HEIGHT);

  ctx.fillStyle = "#e2a30b";
  ctx.font = "700 18px 'IBM Plex Sans JP'";
  ctx.fillText("生産技術メモ", 48, 58);
  ctx.fillStyle = "#f4efe4";
  ctx.font = "400 18px 'IBM Plex Sans JP'";
  ctx.fillText("ブラウザ内ローカルLLMベンチ", 196, 58);

  ctx.textAlign = "right";
  ctx.fillStyle = "#8fd0a8";
  ctx.font = "700 18px 'IBM Plex Sans JP'";
  ctx.fillText("実測", WIDTH - 48, 58);
  ctx.textAlign = "left";

  ctx.fillStyle = "#f7f3ea";
  ctx.font = "700 64px 'IBM Plex Sans JP'";
  ctx.fillText(run.modelLabel, 48, 168);
  ctx.fillStyle = "#b7b1a4";
  ctx.font = "400 20px 'IBM Plex Mono'";
  ctx.fillText(ellipsize(ctx, run.modelId, 820), 48, 210);

  const columns = [
    {
      value: formatTok(run.decodeTokPerS),
      unit: "tok/s",
      label: "スループット",
      sub: "decode",
    },
    {
      value: formatMs(run.ttftMs).replace(" ", ""),
      unit: "",
      label: "段取り時間",
      sub: "TTFT",
    },
    {
      value: formatLoad(run.loadMs),
      unit: "",
      label: "立ち上げ",
      sub: "load",
    },
  ];
  columns.forEach((column, index) => {
    const x = 48 + index * 360;
    ctx.fillStyle = "#f7f3ea";
    ctx.font = "500 68px 'IBM Plex Mono'";
    ctx.fillText(column.value, x, 330);
    ctx.fillStyle = "#e2a30b";
    ctx.font = "700 22px 'IBM Plex Sans JP'";
    ctx.fillText(column.label, x, 372);
    ctx.fillStyle = "#8d877c";
    ctx.font = "400 16px 'IBM Plex Mono'";
    ctx.fillText(column.sub, x, 398);
  });

  ctx.fillStyle = "#d9d3c6";
  ctx.font = "400 22px 'IBM Plex Sans JP'";
  const secondary = `サイクルタイム ${formatCycle(run.decodeTokPerS)}    前工程 ${formatTok(run.prefillTokPerS ?? 0)} tok/s    出来高 ${run.totalTokens} tok`;
  ctx.fillText(secondary, 48, 470);

  ctx.strokeStyle = "#3a362f";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, 508);
  ctx.lineTo(WIDTH - 48, 508);
  ctx.stroke();

  ctx.fillStyle = "#8d877c";
  ctx.font = "400 16px 'IBM Plex Sans JP'";
  ctx.fillText("設備", 48, 548);
  ctx.fillStyle = "#f4efe4";
  ctx.font = "400 24px 'IBM Plex Sans JP'";
  ctx.fillText(ellipsize(ctx, run.gpu, 1080), 48, 582);

  ctx.fillStyle = "#b7b1a4";
  ctx.font = "400 18px 'IBM Plex Sans JP'";
  const footer = `${formatDate(run.createdAt)}    ${PAGE_URL}`;
  ctx.fillText(footer, 48, 630);
  ctx.fillStyle = "#8d877c";
  ctx.font = "400 14px 'IBM Plex Mono'";
  ctx.fillText(
    `max_tokens ${MAX_TOKENS}  ·  temperature ${TEMPERATURE}  ·  入力 ${run.promptTokens} + 生成 ${run.completionTokens}`,
    48,
    656,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png");
  });
  if (!blob) throw new Error("PNGを作成できませんでした");
  return blob;
}
