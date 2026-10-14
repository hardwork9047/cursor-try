export const DASH = "—";

export function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return DASH;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} 秒`;
}

export function formatSeconds(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return DASH;
  if (sec < 60) return `${sec.toFixed(2)} 秒`;
  const minutes = Math.floor(sec / 60);
  const rest = sec - minutes * 60;
  return `${minutes} 分 ${rest.toFixed(1)} 秒`;
}

export function formatRtf(transcribeMs: number | null, audioSec: number | null): string {
  if (transcribeMs === null || audioSec === null) return DASH;
  if (!Number.isFinite(transcribeMs) || !Number.isFinite(audioSec) || audioSec <= 0) return DASH;
  const ratio = transcribeMs / 1000 / audioSec;
  if (!Number.isFinite(ratio)) return DASH;
  return ratio.toFixed(2);
}

export function formatWhen(iso: string | null): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}
