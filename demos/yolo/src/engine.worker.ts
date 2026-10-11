import * as ort from "onnxruntime-web/webgpu";
import type { InMsg, OutMsg } from "./protocol";
import { decode, letterbox, type Letterbox } from "./postprocess";

const ctx = self as unknown as {
  crossOriginIsolated: boolean;
  postMessage: (message: OutMsg) => void;
  onmessage: ((event: MessageEvent<InMsg>) => void) | null;
};

ort.env.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, self.location.origin).href;
ort.env.wasm.numThreads = ctx.crossOriginIsolated
  ? Math.min(4, navigator.hardwareConcurrency || 1)
  : 1;

let session: ort.InferenceSession | null = null;
let inputName = "images";
let outputName = "output0";
let last: { output: Float32Array; dims: number[]; meta: Letterbox } | null = null;

function post(message: OutMsg) {
  ctx.postMessage(message);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

async function readModel(url: string, id: number): Promise<{ buffer: ArrayBuffer; bytes: number }> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`モデルを取得できませんでした (${response.status})`);
  }
  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    post({ type: "progress", id, loaded, total });
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { buffer: buffer.buffer, bytes: loaded };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${ms}ms 以内に終わりませんでした`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function createSession(bytes: ArrayBuffer): Promise<{
  session: ort.InferenceSession;
  backend: "webgpu" | "wasm";
  webgpuNote: string;
}> {
  if (navigator.gpu) {
    try {
      const created = await withTimeout(
        ort.InferenceSession.create(bytes.slice(0), {
          executionProviders: ["webgpu"],
          graphOptimizationLevel: "all",
        }),
        20000,
      );
      return { session: created, backend: "webgpu", webgpuNote: "" };
    } catch (error) {
      const reason = messageOf(error);
      const created = await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      return {
        session: created,
        backend: "wasm",
        webgpuNote: `WebGPUではセッションを作れなかったため、WASMで推論しています。${reason}`,
      };
    }
  }
  const created = await ort.InferenceSession.create(bytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return {
    session: created,
    backend: "wasm",
    webgpuNote: "この環境に WebGPU がないため、WASMで推論しています。",
  };
}

async function onLoad(id: number, url: string) {
  const started = performance.now();
  const { buffer, bytes } = await readModel(url, id);
  post({ type: "session", id });
  const created = await createSession(buffer);
  session = created.session;
  inputName = session.inputNames[0] ?? "images";
  outputName = session.outputNames[0] ?? "output0";
  last = null;
  post({
    type: "loaded",
    id,
    backend: created.backend,
    loadMs: performance.now() - started,
    webgpuNote: created.webgpuNote,
    outputDims: [],
    bytes,
  });
}

async function onDetect(id: number, bitmap: ImageBitmap, conf: number, iou: number) {
  if (!session) throw new Error("モデルがまだ読めていません");
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const preStarted = performance.now();
  const { tensor, meta } = letterbox(bitmap, srcW, srcH);
  bitmap.close();
  const preprocessMs = performance.now() - preStarted;

  const inferStarted = performance.now();
  const outputs = await session.run({
    [inputName]: new ort.Tensor("float32", tensor, [1, 3, 640, 640]),
  });
  const inferenceMs = performance.now() - inferStarted;
  const value = outputs[outputName];
  if (!value) throw new Error("モデルの出力が空です");
  const raw = value.data;
  const output = raw instanceof Float32Array ? raw : Float32Array.from(raw as ArrayLike<number>);
  const dims = [...value.dims];
  last = { output, dims, meta };

  const postStarted = performance.now();
  const boxes = decode(output, dims, meta, conf, iou);
  const postprocessMs = performance.now() - postStarted;
  post({ type: "detected", id, boxes, preprocessMs, inferenceMs, postprocessMs });
}

function onRethreshold(id: number, conf: number, iou: number) {
  if (!last) throw new Error("まだ推論していません");
  const started = performance.now();
  const boxes = decode(last.output, last.dims, last.meta, conf, iou);
  post({
    type: "rethresholded",
    id,
    boxes,
    postprocessMs: performance.now() - started,
  });
}

ctx.onmessage = (event: MessageEvent<InMsg>) => {
  const message = event.data;
  if (message.type === "dispose") {
    void session?.release();
    session = null;
    last = null;
    return;
  }
  const run = async () => {
    if (message.type === "load") await onLoad(message.id, message.url);
    else if (message.type === "detect") await onDetect(message.id, message.bitmap, message.conf, message.iou);
    else onRethreshold(message.id, message.conf, message.iou);
  };
  run().catch((error: unknown) => {
    if (message.type === "detect") {
      try {
        message.bitmap.close();
      } catch {
        // already transferred or closed
      }
    }
    post({ type: "error", id: message.id, message: messageOf(error) });
  });
};
