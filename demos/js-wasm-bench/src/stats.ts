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
  if (!(wasmMs > 0) || !(jsMs > 0) || !Number.isFinite(jsMs) || !Number.isFinite(wasmMs)) return null;
  return jsMs / wasmMs;
}

function times(ratio: number): string {
  if (ratio >= 100) return ratio.toFixed(0);
  return ratio.toFixed(2);
}

/** Plain sentence from the two medians. 「—」 until both times are real. */
export function formatSpeedup(jsMs: number, wasmMs: number): string {
  const ratio = speedup(jsMs, wasmMs);
  if (ratio === null) return "—";
  if (ratio >= 1.005) return `Rustは JavaScript の ${times(ratio)} 倍速い`;
  if (ratio <= 0.995) return `JavaScript は Rust の ${times(1 / ratio)} 倍速い`;
  return "JavaScript と Rust は同じくらい";
}

export function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatInt(value: bigint | null): string {
  if (value === null) return "—";
  return value.toLocaleString("ja-JP");
}
