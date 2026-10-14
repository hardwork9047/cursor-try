import { MAX_AUDIO_SEC, SAMPLE_RATE } from "./model";

export function recorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export async function decodeToPcm(blob: Blob): Promise<{ samples: Float32Array; durationSec: number }> {
  if (blob.size === 0) throw new Error("音声が空です");
  const bytes = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error("このブラウザでは、この音声を開けません");
  } finally {
    await ctx.close();
  }
  const durationSec = decoded.duration;
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error("音声の長さを読めません");
  const length = Math.max(1, Math.ceil(durationSec * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return { samples: new Float32Array(rendered.getChannelData(0)), durationSec };
}

export function overPageLimit(durationSec: number): boolean {
  return durationSec > MAX_AUDIO_SEC;
}

export function drawWave(canvas: HTMLCanvasElement, samples: Float32Array | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#12110e";
  ctx.fillRect(0, 0, width, height);
  if (!samples || samples.length === 0) return;
  ctx.strokeStyle = "#e2a30b";
  ctx.lineWidth = Math.max(1, devicePixelRatio);
  ctx.beginPath();
  const step = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * step;
    const end = Math.min(samples.length, start + step);
    for (let i = start; i < end; i += 1) {
      const value = samples[i] ?? 0;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const y1 = ((1 - max) * 0.5) * height;
    const y2 = ((1 - min) * 0.5) * height;
    ctx.moveTo(x + 0.5, y1);
    ctx.lineTo(x + 0.5, y2);
  }
  ctx.stroke();
}
