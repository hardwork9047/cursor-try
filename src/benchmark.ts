import { aggregate } from "./aggregate";
import { generatePrompt, ensureModel, interruptEngine } from "./engine";
import type { ModelOption } from "./models";
import type { BenchProgress, BenchPrompt, PromptResult, RunRecord } from "./types";

function joinGpu(detected: string, vendor: string): string {
  const name = detected.trim();
  const extra = vendor.trim();
  if (name && extra && !name.toLowerCase().includes(extra.toLowerCase())) {
    return `${name}（vendor: ${extra}）`;
  }
  return name || extra || "WebGPU アダプタ（名称不明）";
}

export function explainFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/shader-f16|required feature/i.test(raw)) {
    return "このGPUはモデルが要求する機能に対応していません。Qwen3 0.6B か Llama 3.2 1B を試してください。";
  }
  if (/out of memory|device lost/i.test(raw)) {
    return "GPUメモリが足りず停止しました。Qwen3 0.6B か Llama 3.2 1B で再測定してください。";
  }
  return raw || "測定に失敗しました";
}

export async function runBenchmark(args: {
  model: ModelOption;
  prompts: BenchPrompt[];
  gpuName: string;
  signal: AbortSignal;
  onProgress: (progress: BenchProgress) => void;
}): Promise<RunRecord> {
  const onAbort = () => interruptEngine();
  args.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const loaded = await ensureModel(args.model.id, (report) => {
      args.onProgress({
        kind: "load",
        progress: report.progress,
        text: report.text,
      });
    });
    if (args.signal.aborted) throw new DOMException("中断しました", "AbortError");

    const parts: PromptResult[] = [];
    for (let index = 0; index < args.prompts.length; index += 1) {
      const prompt = args.prompts[index];
      args.onProgress({
        kind: "prompt",
        index,
        total: args.prompts.length,
        title: prompt.title,
        text: "",
      });
      const generated = await generatePrompt({
        prompt: prompt.text,
        signal: args.signal,
        onText: (text) => {
          args.onProgress({
            kind: "prompt",
            index,
            total: args.prompts.length,
            title: prompt.title,
            text,
          });
        },
      });
      parts.push({
        id: prompt.id,
        title: prompt.title,
        text: generated.text,
        ttftMs: generated.ttftMs,
        decodeTokPerS: generated.decodeTokPerS,
        prefillTokPerS: generated.prefillTokPerS,
        promptTokens: generated.promptTokens,
        completionTokens: generated.completionTokens,
      });
    }

    return {
      id: `run-${args.model.slug}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      modelId: args.model.id,
      modelLabel: args.model.label,
      demo: false,
      loadMs: loaded.loadMs,
      gpu: joinGpu(args.gpuName, loaded.gpuVendor),
      prompts: parts,
      ...aggregate(parts),
    };
  } finally {
    args.signal.removeEventListener("abort", onAbort);
  }
}
