import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { CHUNK_SEC, MODEL_ID, MODEL_REVISION, STRIDE_SEC } from "./model";
import type { LanguageChoice, WorkerOut } from "./types";

env.allowLocalModels = false;
env.useBrowserCache = true;

type Attempt = {
  device: "webgpu" | "wasm";
  dtype: "fp32" | { encoder_model: "fp32"; decoder_model_merged: "q4" | "q8" };
};

type HubProgress = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

const WEBGPU: Attempt = {
  device: "webgpu",
  dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
};
const WASM_Q8: Attempt = {
  device: "wasm",
  dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
};
const WASM_FP32: Attempt = { device: "wasm", dtype: "fp32" };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loadedDevice: Attempt["device"] | null = null;
let busy = false;

function post(message: WorkerOut) {
  self.postMessage(message);
}

function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean(navigator.gpu);
}

function fileLabel(file: string | undefined): string {
  if (!file) return "";
  const parts = file.split("/");
  return parts[parts.length - 1] ?? file;
}

function percent(data: HubProgress): number | null {
  if (typeof data.progress === "number" && Number.isFinite(data.progress)) {
    return Math.min(100, Math.max(0, data.progress));
  }
  if (typeof data.loaded === "number" && typeof data.total === "number" && data.total > 0) {
    return Math.min(100, Math.max(0, (data.loaded / data.total) * 100));
  }
  return null;
}

function progressText(data: HubProgress): string {
  const file = fileLabel(data.file);
  const value = percent(data);
  if (value !== null && data.status === "progress") {
    const shown = `${Math.round(value)}%`;
    return file ? `${file} ${shown}` : shown;
  }
  if (data.status === "initiate") return file ? `${file} を確認` : "モデルを確認";
  if (data.status === "download") return file ? `${file} を取得` : "モデルを取得";
  if (data.status === "done") return file ? `${file} を受け取りました` : "受け取りました";
  if (data.status === "ready") return "セッションを作っています";
  return file ? `${file} を準備` : "モデルを準備しています";
}

function backendLabel(pipe: AutomaticSpeechRecognitionPipeline): string {
  const sessions = pipe.model?.sessions ?? {};
  const devices = Object.values(sessions)
    .map((session) => {
      const config = (session as { config?: { device?: string } }).config;
      return config?.device;
    })
    .filter((device): device is string => Boolean(device));
  const unique = [...new Set(devices)];
  if (unique.length === 0) return "";
  const names = unique.map((device) => (device === "webgpu" ? "WebGPU" : device === "wasm" ? "WASM" : device));
  return names.join(" と ");
}

async function disposeCurrent() {
  const current = transcriber;
  transcriber = null;
  loadedDevice = null;
  if (!current) return;
  try {
    await current.dispose();
  } catch {
    // 失敗したセッションは、捨てられなくても次の読み込みを続ける。
  }
}

async function loadAttempt(attempt: Attempt, note: string) {
  const started = performance.now();
  const created = await pipeline("automatic-speech-recognition", MODEL_ID, {
    revision: MODEL_REVISION,
    device: attempt.device,
    dtype: attempt.dtype,
    progress_callback: (data: HubProgress) => {
      post({ type: "progress", text: progressText(data) });
    },
  });
  const loadMs = performance.now() - started;
  const backend = backendLabel(created);
  if (!backend) {
    await created.dispose();
    throw new Error("セッションの装置名を読めませんでした");
  }
  transcriber = created;
  loadedDevice = attempt.device;
  post({ type: "ready", loadMs, backend, note });
}

async function ensureModel(allowWebGpu: boolean, because: "first" | "infer") {
  if (transcriber) return;
  const canTryWebGpu = allowWebGpu && hasWebGpu();
  const attempts: Attempt[] = [];
  if (canTryWebGpu) attempts.push(WEBGPU);
  attempts.push(WASM_Q8, WASM_FP32);
  let webGpuFailed = false;
  let last: unknown;
  for (const attempt of attempts) {
    try {
      let note = "";
      if (attempt.device === "wasm" && webGpuFailed) {
        note =
          because === "infer"
            ? "WebGPU の文字起こしに失敗したので、WASM で読み直しました。読込時間は、成功した WASM の分だけです。"
            : "WebGPU では用意できなかったので、WASM で読み直しました。読込時間は、成功した WASM の分だけです。";
      } else if (attempt.device === "wasm" && !canTryWebGpu) {
        note = "このワーカーからは WebGPU を使えないので、WASM です。";
      }
      await loadAttempt(attempt, note);
      return;
    } catch (error) {
      last = error;
      if (attempt.device === "webgpu") webGpuFailed = true;
      await disposeCurrent();
    }
  }
  throw last instanceof Error ? last : new Error("モデルを用意できません");
}

function textOf(output: unknown): string {
  if (output && typeof output === "object" && "text" in output && typeof output.text === "string") return output.text;
  if (Array.isArray(output) && output[0] && typeof output[0] === "object" && "text" in output[0]) {
    const text = (output[0] as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  throw new Error("モデルの出力を読めません");
}

async function transcribe(samples: Float32Array, durationSec: number, language: LanguageChoice) {
  const pipe = transcriber;
  if (!pipe) throw new Error("モデルがありません");
  const options: {
    task: "transcribe";
    return_timestamps: false;
    language?: "japanese";
    chunk_length_s?: number;
    stride_length_s?: number;
  } = { task: "transcribe", return_timestamps: false };
  if (language === "japanese") options.language = "japanese";
  if (durationSec > CHUNK_SEC) {
    options.chunk_length_s = CHUNK_SEC;
    options.stride_length_s = STRIDE_SEC;
  }
  const started = performance.now();
  const output = await pipe(samples, options);
  return { transcript: textOf(output), transcribeMs: performance.now() - started };
}

self.onmessage = (event: MessageEvent<{ type?: string; samples?: ArrayBuffer; durationSec?: number; language?: LanguageChoice }>) => {
  const data = event.data;
  if (data?.type !== "transcribe" || !(data.samples instanceof ArrayBuffer) || typeof data.durationSec !== "number") {
    post({ type: "error", message: "音声を渡せません" });
    return;
  }
  if (busy) {
    post({ type: "error", message: "前の文字起こしがまだ終わっていません" });
    return;
  }
  busy = true;
  const samples = new Float32Array(data.samples);
  const durationSec = data.durationSec;
  const language = data.language === "auto" ? "auto" : "japanese";
  void (async () => {
    try {
      post({ type: "progress", text: transcriber ? "文字にしています" : "モデルを用意しています" });
      await ensureModel(true, "first");
      post({ type: "progress", text: "文字にしています" });
      let result: { transcript: string; transcribeMs: number };
      try {
        result = await transcribe(samples, durationSec, language);
      } catch (error) {
        if (loadedDevice !== "webgpu") throw error;
        await disposeCurrent();
        post({ type: "progress", text: "WASM で読み直しています" });
        await ensureModel(false, "infer");
        post({ type: "progress", text: "文字にしています" });
        result = await transcribe(samples, durationSec, language);
      }
      post({ type: "result", transcript: result.transcript, transcribeMs: result.transcribeMs });
    } catch (error) {
      const message = error instanceof Error ? error.message : "文字にできませんでした";
      post({ type: "error", message });
    } finally {
      busy = false;
    }
  })();
};
