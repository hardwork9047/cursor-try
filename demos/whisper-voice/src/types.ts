export type LanguageChoice = "japanese" | "auto";

export type WorkerIn =
  | { type: "transcribe"; samples: ArrayBuffer; durationSec: number; language: LanguageChoice };

export type WorkerOut =
  | { type: "progress"; text: string }
  | { type: "ready"; loadMs: number; backend: string; note: string }
  | { type: "result"; transcript: string; transcribeMs: number }
  | { type: "error"; message: string };

export type GpuInfo = {
  name: string;
  detail: string;
};
