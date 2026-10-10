export type PromptResult = {
  id: string;
  title: string;
  text: string;
  ttftMs: number;
  decodeTokPerS: number;
  prefillTokPerS: number | null;
  promptTokens: number;
  completionTokens: number;
};

export type RunRecord = {
  id: string;
  createdAt: string;
  modelId: string;
  modelLabel: string;
  loadMs: number;
  ttftMs: number;
  decodeTokPerS: number;
  prefillTokPerS: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  gpu: string;
  prompts: PromptResult[];
};

export type BenchPrompt = {
  id: string;
  title: string;
  text: string;
};

export type BenchProgress =
  | { kind: "load"; progress: number; text: string }
  | {
      kind: "prompt";
      index: number;
      total: number;
      title: string;
      text: string;
    };

export type GpuStatus = {
  webgpu: boolean;
  name: string;
  detail: string;
};
