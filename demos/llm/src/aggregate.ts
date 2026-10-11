import type { PromptResult } from "./types";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function aggregate(parts: PromptResult[]): {
  ttftMs: number;
  decodeTokPerS: number;
  prefillTokPerS: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const promptTokens = parts.reduce((sum, part) => sum + part.promptTokens, 0);
  const completionTokens = parts.reduce(
    (sum, part) => sum + part.completionTokens,
    0,
  );
  const decodeTime = parts.reduce((sum, part) => {
    if (part.decodeTokPerS > 0 && part.completionTokens > 0) {
      return sum + part.completionTokens / part.decodeTokPerS;
    }
    return sum;
  }, 0);
  const prefillParts = parts.filter(
    (part) => part.prefillTokPerS != null && part.prefillTokPerS > 0,
  );
  const prefillTokens = prefillParts.reduce(
    (sum, part) => sum + part.promptTokens,
    0,
  );
  const prefillTime = prefillParts.reduce(
    (sum, part) => sum + part.promptTokens / (part.prefillTokPerS as number),
    0,
  );

  return {
    ttftMs: median(parts.map((part) => part.ttftMs)),
    decodeTokPerS: decodeTime > 0 ? completionTokens / decodeTime : 0,
    prefillTokPerS: prefillTime > 0 ? prefillTokens / prefillTime : null,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
