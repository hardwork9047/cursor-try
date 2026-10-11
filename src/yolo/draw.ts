import { className } from "./classes";
import type { Box } from "./postprocess";

const STROKES = ["#e2a30b", "#f4efe4", "#8fd0a8", "#f0c36a", "#d7e3ea", "#e7a090"];

export function drawScene(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  srcW: number,
  srcH: number,
  boxes: Box[],
  lineY: number | null,
) {
  ctx.clearRect(0, 0, srcW, srcH);
  ctx.drawImage(image, 0, 0, srcW, srcH);
  const weight = Math.max(2, srcW / 480);
  for (const box of boxes) {
    const color = STROKES[box.classId % STROKES.length];
    ctx.lineWidth = weight;
    ctx.strokeStyle = color;
    ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
    const label = `${className(box.classId)} ${(box.score * 100).toFixed(0)}%`;
    const font = Math.max(14, Math.round(srcW / 52));
    ctx.font = `700 ${font}px "IBM Plex Sans JP", sans-serif`;
    const pad = Math.round(font * 0.28);
    const textW = ctx.measureText(label).width;
    const boxH = font + pad * 2;
    const top = box.y1 - boxH < 0 ? box.y1 : box.y1 - boxH;
    ctx.fillStyle = "rgba(22, 20, 15, 0.88)";
    ctx.fillRect(box.x1, top, textW + pad * 2, boxH);
    ctx.fillStyle = color;
    ctx.fillText(label, box.x1 + pad, top + font + pad * 0.15);
  }
  if (lineY == null) return;
  ctx.save();
  ctx.lineWidth = Math.max(2, weight);
  ctx.strokeStyle = "rgba(18, 17, 14, 0.75)";
  ctx.beginPath();
  ctx.moveTo(0, lineY);
  ctx.lineTo(srcW, lineY);
  ctx.stroke();
  ctx.strokeStyle = "#e2a30b";
  ctx.setLineDash([14, 10]);
  ctx.stroke();
  ctx.restore();
  const font = Math.max(13, Math.round(srcW / 58));
  ctx.font = `700 ${font}px "IBM Plex Sans JP", sans-serif`;
  const tag = "計数ライン";
  const pad = 6;
  const textW = ctx.measureText(tag).width;
  const tagY = lineY < font + 16 ? lineY + 8 : lineY - font - 10;
  ctx.fillStyle = "#e2a30b";
  ctx.fillRect(8, tagY, textW + pad * 2, font + 8);
  ctx.fillStyle = "#1a1814";
  ctx.fillText(tag, 8 + pad, tagY + font);
}
