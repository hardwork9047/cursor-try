export function formatTok(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatLoad(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const seconds = ms / 1000;
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
}

export function formatCycle(tokPerS: number): string {
  if (!Number.isFinite(tokPerS) || tokPerS <= 0) return "—";
  return `${(1000 / tokPerS).toFixed(1)} ms/token`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
