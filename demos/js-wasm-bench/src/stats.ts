export type Summary = {
  median: number;
  min: number;
  max: number;
};

export function summarize(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) >> 1;
  return {
    median: sorted[mid],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export function speedup(jsMs: number, wasmMs: number): number | null {
  if (!(wasmMs > 0) || !Number.isFinite(jsMs) || !Number.isFinite(wasmMs)) return null;
  return jsMs / wasmMs;
}

export function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatRatio(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  if (ratio >= 100) return `${ratio.toFixed(0)}×`;
  return `${ratio.toFixed(2)}×`;
}

export function formatInt(value: bigint | null): string {
  if (value === null) return "—";
  return value.toLocaleString("ja-JP");
}
