export type ModelOption = {
  id: string;
  slug: string;
  label: string;
  family: string;
  params: string;
  quant: string;
  vram: string;
  context: string;
  note: string;
};

/** Prebuilt WebLLM model ids from @mlc-ai/web-llm 0.2.85 (`prebuiltAppConfig`). */
export const MODELS: ModelOption[] = [
  {
    id: "Qwen3-0.6B-q4f16_1-MLC",
    slug: "qwen",
    label: "Qwen3 0.6B",
    family: "Qwen",
    params: "0.6B",
    quant: "q4f16",
    vram: "約 1.4 GB",
    context: "4k",
    note: "小さい。まずここで測る",
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    slug: "llama",
    label: "Llama 3.2 1B",
    family: "Llama",
    params: "1B",
    quant: "q4f16",
    vram: "約 0.9 GB",
    context: "4k",
    note: "軽量で載りやすい",
  },
  {
    id: "gemma3-1b-it-q4f16_1-MLC",
    slug: "gemma",
    label: "Gemma 3 1B",
    family: "Gemma",
    params: "1B",
    quant: "q4f16",
    vram: "約 0.7 GB",
    context: "4k",
    note: "Gemma 3 の最小級",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC-1k",
    slug: "phi",
    label: "Phi-3.5 mini",
    family: "Phi",
    params: "3.8B",
    quant: "q4f16 · 1k",
    vram: "約 2.5 GB",
    context: "1k",
    note: "メモリに余裕があるとき",
  },
];

export function modelById(id: string): ModelOption {
  return MODELS.find((model) => model.id === id) ?? MODELS[0];
}
