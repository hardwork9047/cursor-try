import { aggregate } from "./aggregate";
import { SAMPLE_GPU } from "./config";
import { modelById, type ModelOption } from "./models";
import type { BenchProgress, BenchPrompt, PromptResult, RunRecord } from "./types";

const SAMPLE_ANSWERS: Record<string, string> = {
  setup:
    "内段取りは機械を止めて行う型替えです。外段取りは、止める前に済ませられる準備です。",
  takt: "出来高 = 3600÷12×0.85 = 255個/時です。",
  stop: "1. アラームコードを確認する\n2. 直前のワークとセンサを見る\n3. エア・電源・安全扉を確認する",
  custom:
    "サンプル応答です。この文章はモデルの生成ではなく、録画用の台本です。",
};

type Stat = {
  ttftMs: number;
  decodeTokPerS: number;
  prefillTokPerS: number;
  promptTokens: number;
  completionTokens: number;
};

const LIVE: Record<string, Record<string, Stat>> = {
  qwen: {
    setup: { ttftMs: 118, decodeTokPerS: 84.0, prefillTokPerS: 1020, promptTokens: 42, completionTokens: 64 },
    takt: { ttftMs: 136, decodeTokPerS: 79.0, prefillTokPerS: 940, promptTokens: 38, completionTokens: 64 },
    stop: { ttftMs: 129, decodeTokPerS: 82.0, prefillTokPerS: 980, promptTokens: 46, completionTokens: 64 },
    custom: { ttftMs: 154, decodeTokPerS: 76.0, prefillTokPerS: 860, promptTokens: 40, completionTokens: 48 },
  },
  llama: {
    setup: { ttftMs: 198, decodeTokPerS: 48.5, prefillTokPerS: 670, promptTokens: 44, completionTokens: 64 },
    takt: { ttftMs: 214, decodeTokPerS: 44.2, prefillTokPerS: 610, promptTokens: 39, completionTokens: 64 },
    stop: { ttftMs: 206, decodeTokPerS: 46.8, prefillTokPerS: 640, promptTokens: 47, completionTokens: 64 },
    custom: { ttftMs: 230, decodeTokPerS: 42.0, prefillTokPerS: 560, promptTokens: 36, completionTokens: 48 },
  },
  gemma: {
    setup: { ttftMs: 172, decodeTokPerS: 55.4, prefillTokPerS: 740, promptTokens: 43, completionTokens: 64 },
    takt: { ttftMs: 188, decodeTokPerS: 51.1, prefillTokPerS: 690, promptTokens: 38, completionTokens: 64 },
    stop: { ttftMs: 181, decodeTokPerS: 53.6, prefillTokPerS: 710, promptTokens: 46, completionTokens: 64 },
    custom: { ttftMs: 205, decodeTokPerS: 49.0, prefillTokPerS: 620, promptTokens: 34, completionTokens: 48 },
  },
  phi: {
    setup: { ttftMs: 312, decodeTokPerS: 24.2, prefillTokPerS: 310, promptTokens: 41, completionTokens: 64 },
    takt: { ttftMs: 348, decodeTokPerS: 21.6, prefillTokPerS: 270, promptTokens: 37, completionTokens: 64 },
    stop: { ttftMs: 330, decodeTokPerS: 22.8, prefillTokPerS: 290, promptTokens: 45, completionTokens: 64 },
    custom: { ttftMs: 360, decodeTokPerS: 20.4, prefillTokPerS: 250, promptTokens: 33, completionTokens: 48 },
  },
};

const SEED: Record<string, { at: string; loadMs: number; stats: Record<string, Stat> }> = {
  qwen: {
    at: "2026-10-09T07:22:00.000Z",
    loadMs: 4620,
    stats: {
      setup: { ttftMs: 132, decodeTokPerS: 76.4, prefillTokPerS: 960, promptTokens: 42, completionTokens: 64 },
      takt: { ttftMs: 148, decodeTokPerS: 71.8, prefillTokPerS: 890, promptTokens: 38, completionTokens: 64 },
      stop: { ttftMs: 141, decodeTokPerS: 74.5, prefillTokPerS: 920, promptTokens: 46, completionTokens: 64 },
    },
  },
  llama: {
    at: "2026-10-08T02:05:00.000Z",
    loadMs: 6140,
    stats: {
      setup: { ttftMs: 220, decodeTokPerS: 47.2, prefillTokPerS: 640, promptTokens: 44, completionTokens: 64 },
      takt: { ttftMs: 236, decodeTokPerS: 43.5, prefillTokPerS: 590, promptTokens: 39, completionTokens: 64 },
      stop: { ttftMs: 228, decodeTokPerS: 45.9, prefillTokPerS: 615, promptTokens: 47, completionTokens: 64 },
    },
  },
  gemma: {
    at: "2026-10-07T05:40:00.000Z",
    loadMs: 5380,
    stats: {
      setup: { ttftMs: 186, decodeTokPerS: 53.2, prefillTokPerS: 710, promptTokens: 43, completionTokens: 64 },
      takt: { ttftMs: 202, decodeTokPerS: 49.4, prefillTokPerS: 660, promptTokens: 38, completionTokens: 64 },
      stop: { ttftMs: 194, decodeTokPerS: 51.8, prefillTokPerS: 690, promptTokens: 46, completionTokens: 64 },
    },
  },
  phi: {
    at: "2026-10-06T00:12:00.000Z",
    loadMs: 11840,
    stats: {
      setup: { ttftMs: 340, decodeTokPerS: 22.8, prefillTokPerS: 290, promptTokens: 41, completionTokens: 64 },
      takt: { ttftMs: 372, decodeTokPerS: 20.4, prefillTokPerS: 255, promptTokens: 37, completionTokens: 64 },
      stop: { ttftMs: 356, decodeTokPerS: 21.5, prefillTokPerS: 275, promptTokens: 45, completionTokens: 64 },
    },
  },
};

const LIVE_LOAD_MS: Record<string, number> = {
  qwen: 3840,
  llama: 5120,
  gemma: 4460,
  phi: 9720,
};

function promptsFromStats(
  stats: Record<string, Stat>,
  order: BenchPrompt[],
  withText: boolean,
): PromptResult[] {
  return order
    .filter((prompt) => stats[prompt.id])
    .map((prompt) => {
      const stat = stats[prompt.id];
      return {
        id: prompt.id,
        title: prompt.title,
        text: withText ? (SAMPLE_ANSWERS[prompt.id] ?? SAMPLE_ANSWERS.custom) : "",
        ttftMs: stat.ttftMs,
        decodeTokPerS: stat.decodeTokPerS,
        prefillTokPerS: stat.prefillTokPerS,
        promptTokens: stat.promptTokens,
        completionTokens: stat.completionTokens,
      };
    });
}

export function makeSampleRun(
  model: ModelOption,
  loadMs: number,
  parts: PromptResult[],
  createdAt: string,
  id: string,
): RunRecord {
  return {
    id,
    createdAt,
    modelId: model.id,
    modelLabel: model.label,
    demo: true,
    loadMs,
    gpu: SAMPLE_GPU,
    prompts: parts,
    ...aggregate(parts),
  };
}

export function buildSeedHistory(): RunRecord[] {
  return ["qwen", "llama", "gemma", "phi"].map((slug) => {
    const model = modelById(
      slug === "qwen"
        ? "Qwen3-0.6B-q4f16_1-MLC"
        : slug === "llama"
          ? "Llama-3.2-1B-Instruct-q4f16_1-MLC"
          : slug === "gemma"
            ? "gemma3-1b-it-q4f16_1-MLC"
            : "Phi-3.5-mini-instruct-q4f16_1-MLC-1k",
    );
    const seed = SEED[slug];
    const parts = promptsFromStats(seed.stats, [
      { id: "setup", title: "内段取りと外段取り", text: "" },
      { id: "takt", title: "タクトから出来高", text: "" },
      { id: "stop", title: "突発停止の切り分け", text: "" },
    ], false);
    return makeSampleRun(model, seed.loadMs, parts, seed.at, `seed-${slug}`);
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("中断しました", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("中断しました", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function playDemo(args: {
  model: ModelOption;
  prompts: BenchPrompt[];
  signal: AbortSignal;
  onProgress: (progress: BenchProgress) => void;
}): Promise<RunRecord> {
  const started = performance.now();
  const duration = 1900;
  while (performance.now() - started < duration) {
    const progress = Math.min(1, (performance.now() - started) / duration);
    args.onProgress({
      kind: "load",
      progress,
      text: `サンプル再生 · 立ち上げの演出 ${Math.round(progress * 100)}%`,
    });
    await wait(70, args.signal);
  }
  args.onProgress({
    kind: "load",
    progress: 1,
    text: "サンプル再生 · 立ち上げの演出が終わりました",
  });

  const table = LIVE[args.model.slug] ?? LIVE.qwen;
  const parts: PromptResult[] = [];
  for (let index = 0; index < args.prompts.length; index += 1) {
    const prompt = args.prompts[index];
    const stat = table[prompt.id] ?? table.custom;
    const answer = SAMPLE_ANSWERS[prompt.id] ?? SAMPLE_ANSWERS.custom;
    let text = "";
    for (const ch of answer) {
      text += ch;
      args.onProgress({
        kind: "prompt",
        index,
        total: args.prompts.length,
        title: prompt.title,
        text,
      });
      await wait(ch === "\n" ? 36 : 24, args.signal);
    }
    parts.push({
      id: prompt.id,
      title: prompt.title,
      text,
      ttftMs: stat.ttftMs,
      decodeTokPerS: stat.decodeTokPerS,
      prefillTokPerS: stat.prefillTokPerS,
      promptTokens: stat.promptTokens,
      completionTokens: stat.completionTokens,
    });
    await wait(180, args.signal);
  }

  return makeSampleRun(
    args.model,
    LIVE_LOAD_MS[args.model.slug] ?? 4000,
    parts,
    new Date().toISOString(),
    `demo-${args.model.slug}-${Date.now()}`,
  );
}
