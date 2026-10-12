import * as ort from "onnxruntime-web/webgpu";

const INPUT_EDGE = 518;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type LoadMsg = { type: "load"; id: number; url: string };
type InferMsg = { type: "infer"; id: number; bitmap: ImageBitmap };
type InMsg = LoadMsg | InferMsg;

type OutMsg =
  | { type: "progress"; id: number; label: string }
  | { type: "loaded"; id: number; backend: "webgpu" | "wasm"; loadMs: number; note: string }
  | { type: "depth"; id: number; width: number; height: number; relative: Float32Array; inferMs: number }
  | { type: "error"; id: number; message: string };

const scope = self as unknown as {
  crossOriginIsolated: boolean;
  postMessage: (message: OutMsg, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<InMsg>) => void) | null;
};

ort.env.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, self.location.origin).href;
ort.env.wasm.numThreads = scope.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let session: ort.InferenceSession | null = null;
let inputName = "pixel_values";
let outputName = "predicted_depth";
let backend: "webgpu" | "wasm" = "wasm";
let loadMs = 0;
let note = "";

function post(message: OutMsg, transfer?: Transferable[]) {
  scope.postMessage(message, transfer);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

function modelSize(width: number, height: number): { width: number; height: number } {
  const scaleW = INPUT_EDGE / width;
  const scaleH = INPUT_EDGE / height;
  const scale = Math.abs(1 - scaleW) < Math.abs(1 - scaleH) ? scaleW : scaleH;
  const multiple = (value: number) => Math.max(14, Math.round(value / 14) * 14);
  return {
    width: multiple(scale * width),
    height: multiple(scale * height),
  };
}

function pack(image: ImageData): Float32Array {
  const { width, height, data } = image;
  const plane = width * height;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    const o = i * 4;
    out[i] = (data[o] / 255 - MEAN[0]) / STD[0];
    out[plane + i] = (data[o + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * plane + i] = (data[o + 2] / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

function asFloat32(data: ort.Tensor["data"]): Float32Array {
  if (data instanceof Float32Array) return data;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 1) out[i] = Number(data[i]);
  return out;
}

function depthPlane(tensor: ort.Tensor): { data: Float32Array; width: number; height: number } {
  const dims = tensor.dims;
  let height = 0;
  let width = 0;
  if (dims.length === 3) {
    height = dims[1];
    width = dims[2];
  } else if (dims.length === 4) {
    height = dims[2];
    width = dims[3];
  } else {
    throw new Error(`想定外の出力形状です (${dims.join("×")})`);
  }
  return { data: asFloat32(tensor.data), width, height };
}

function upsample(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  if (sw === dw && sh === dh) return src;
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    const fy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = Math.min(1, Math.max(0, fy - y0));
    for (let x = 0; x < dw; x += 1) {
      const fx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0));
      const v00 = src[y0 * sw + x0];
      const v01 = src[y0 * sw + x1];
      const v10 = src[y1 * sw + x0];
      const v11 = src[y1 * sw + x1];
      const v0 = v00 + (v01 - v00) * tx;
      const v1 = v10 + (v11 - v10) * tx;
      out[y * dw + x] = v0 + (v1 - v0) * ty;
    }
  }
  return out;
}

function normalize(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  const out = new Float32Array(values.length);
  if (!Number.isFinite(span) || span === 0) return out;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    out[i] = Number.isFinite(v) ? (v - min) / span : 0;
  }
  return out;
}

async function readModel(url: string, id: number): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`モデルを取得できませんでした (${response.status})`);
  post({ type: "progress", id, label: "モデルを読んでいます" });
  return response.arrayBuffer();
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
        reject(error instanceof Error ? error : new Error(messageOf(error)));
      },
    );
  });
}

async function createSession(bytes: ArrayBuffer, id: number): Promise<void> {
  let adapter: unknown = null;
  if (navigator.gpu) {
    try {
      adapter = await navigator.gpu.requestAdapter();
    } catch {
      adapter = null;
    }
  }
  if (adapter) {
    try {
      session = await withTimeout(
        ort.InferenceSession.create(bytes.slice(0), {
          executionProviders: ["webgpu"],
          graphOptimizationLevel: "all",
        }),
        20000,
      );
      backend = "webgpu";
      note = "";
      return;
    } catch (error) {
      console.error(error);
      note = "WebGPU ではセッションを作れなかったため、WASM で推論しています。";
    }
  } else {
    note = "この環境に WebGPU がないため、WASM で推論しています。";
  }
  post({ type: "progress", id, label: "WASM で準備しています" });
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "basic",
  });
  backend = "wasm";
}

async function onLoad(id: number, url: string) {
  const started = performance.now();
  post({ type: "progress", id, label: "モデルを読んでいます" });
  const bytes = await readModel(url, id);
  post({ type: "progress", id, label: "セッションを作っています" });
  await createSession(bytes, id);
  if (!session) throw new Error("セッションがありません");
  inputName = session.inputNames[0] ?? "pixel_values";
  outputName = session.outputNames[0] ?? "predicted_depth";
  loadMs = performance.now() - started;
  post({ type: "loaded", id, backend, loadMs, note });
}

async function onInfer(id: number, bitmap: ImageBitmap) {
  if (!session) throw new Error("モデルがまだ読み込まれていません");
  const width = bitmap.width;
  const height = bitmap.height;
  const sized = modelSize(width, height);
  const canvas = new OffscreenCanvas(sized.width, sized.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("縮小用のキャンバスを作れません");
  ctx.drawImage(bitmap, 0, 0, sized.width, sized.height);
  bitmap.close();
  const packed = pack(ctx.getImageData(0, 0, sized.width, sized.height));
  const input = new ort.Tensor("float32", packed, [1, 3, sized.height, sized.width]);
  post({ type: "progress", id, label: "推論しています" });
  const started = performance.now();
  const outputs = await session.run({ [inputName]: input });
  const inferMs = performance.now() - started;
  const tensor = outputs[outputName];
  if (!tensor) throw new Error("奥行きの出力がありません");
  const plane = depthPlane(tensor);
  const relative = normalize(upsample(plane.data, plane.width, plane.height, width, height));
  post({ type: "depth", id, width, height, relative, inferMs }, [relative.buffer]);
}

scope.onmessage = (event: MessageEvent<InMsg>) => {
  const message = event.data;
  void (async () => {
    try {
      if (message.type === "load") await onLoad(message.id, message.url);
      else await onInfer(message.id, message.bitmap);
    } catch (error) {
      if (message.type === "infer") {
        try {
          message.bitmap.close();
        } catch {
          // The frame was already consumed.
        }
      }
      post({ type: "error", id: message.id, message: messageOf(error) });
    }
  })();
};
