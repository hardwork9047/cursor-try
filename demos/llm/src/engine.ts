import {
  CreateWebWorkerMLCEngine,
  type CompletionUsage,
  type InitProgressReport,
  type WebWorkerMLCEngine,
} from "@mlc-ai/web-llm";
import { MAX_TOKENS, TEMPERATURE } from "./config";

let worker: Worker | null = null;
let engine: WebWorkerMLCEngine | null = null;
let loadedModel: string | null = null;

const SYSTEM =
  "あなたは生産技術のアシスタントです。簡潔に、事実だけを日本語で答えてください。";

export async function ensureModel(
  modelId: string,
  onProgress: (report: InitProgressReport) => void,
): Promise<{ loadMs: number; gpuVendor: string }> {
  const started = performance.now();
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
  }
  if (!engine) {
    engine = await CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: onProgress,
    });
    loadedModel = modelId;
  } else if (loadedModel !== modelId) {
    engine.setInitProgressCallback(onProgress);
    await engine.reload(modelId);
    loadedModel = modelId;
  } else {
    onProgress({
      progress: 1,
      timeElapsed: 0,
      text: "キャッシュ済みのモデルを使います",
    });
  }
  engine.setLogLevel("WARN");
  let gpuVendor = "";
  try {
    gpuVendor = await engine.getGPUVendor();
  } catch {
    gpuVendor = "";
  }
  return { loadMs: performance.now() - started, gpuVendor };
}

export function interruptEngine(): void {
  engine?.interruptGenerate();
}

export async function generatePrompt(args: {
  prompt: string;
  signal: AbortSignal;
  onText: (text: string) => void;
}): Promise<{
  text: string;
  ttftMs: number;
  promptTokens: number;
  completionTokens: number;
  decodeTokPerS: number;
  prefillTokPerS: number | null;
}> {
  if (!engine) throw new Error("モデルが読み込まれていません");
  if (args.signal.aborted) throw new DOMException("中断しました", "AbortError");
  await engine.resetChat(true);

  const started = performance.now();
  let firstTokenAt: number | null = null;
  let text = "";
  let usage: CompletionUsage | undefined;

  const stream = await engine.chat.completions.create({
    stream: true,
    stream_options: { include_usage: true },
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: args.prompt },
    ],
    extra_body: { enable_thinking: false },
  });

  const onAbort = () => {
    engine?.interruptGenerate();
  };
  args.signal.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const chunk of stream) {
      if (args.signal.aborted) {
        throw new DOMException("中断しました", "AbortError");
      }
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        if (firstTokenAt == null) firstTokenAt = performance.now();
        text += delta;
        args.onText(text);
      }
      if (chunk.usage) usage = chunk.usage;
    }
  } finally {
    args.signal.removeEventListener("abort", onAbort);
  }

  if (!usage || !usage.extra) {
    throw new Error(
      "エンジンから速度統計を取得できませんでした。数値は出していません。",
    );
  }
  const prefill = usage.extra.prefill_tokens_per_s;
  return {
    text,
    ttftMs: (firstTokenAt ?? performance.now()) - started,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    decodeTokPerS: usage.extra.decode_tokens_per_s,
    prefillTokPerS: prefill > 0 ? prefill : null,
  };
}
