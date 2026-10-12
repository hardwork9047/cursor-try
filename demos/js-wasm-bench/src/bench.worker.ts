import init, {
  aggregate,
  alloc_u32,
  alloc_u8,
  dealloc_u32,
  dealloc_u8,
  inspect,
  simulate,
} from "./wasm/kernel";
import { inspectInto } from "./kernel/inspect";
import { prepareInputs } from "./kernel/prepare";
import { quicksort, sensorStats } from "./kernel/sensors";
import { readU64, simulateInto } from "./kernel/simulate";
import { ITERATIONS, N_JOBS, N_STATIONS, WARMUP } from "./params";
import { summarize } from "./stats";
import type { BenchResult, Pair, WorkerOut } from "./types";

type Timed<T> = { computeMs: number; transferMs: number; out: T };

let memory: WebAssembly.Memory | null = null;

function post(message: WorkerOut) {
  self.postMessage(message);
}

function u8View(): Uint8Array {
  if (!memory) throw new Error("WASM のメモリがありません");
  return new Uint8Array(memory.buffer);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameU32(a: Uint32Array, b: Uint32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function timeJsImage(src: Uint8Array, width: number, height: number): Timed<{ pixels: Uint8Array; count: number }> {
  const t0 = performance.now();
  const copy = src.slice();
  const dst = new Uint8Array(src.length);
  const t1 = performance.now();
  const count = inspectInto(copy, width, height, dst);
  const t2 = performance.now();
  const pixels = dst.slice();
  const t3 = performance.now();
  return { computeMs: t2 - t1, transferMs: t3 - t0, out: { pixels, count } };
}

function timeWasmImage(src: Uint8Array, width: number, height: number): Timed<{ pixels: Uint8Array; count: number }> {
  const bytes = src.length;
  const t0 = performance.now();
  const inPtr = alloc_u8(bytes);
  const outPtr = alloc_u8(bytes);
  u8View().set(src, inPtr);
  const t1 = performance.now();
  const count = inspect(inPtr, width, height, outPtr);
  const t2 = performance.now();
  const pixels = u8View().slice(outPtr, outPtr + bytes);
  dealloc_u8(inPtr, bytes);
  dealloc_u8(outPtr, bytes);
  const t3 = performance.now();
  return { computeMs: t2 - t1, transferMs: t3 - t0, out: { pixels, count } };
}

function timeJsSim(src: Uint32Array): Timed<Uint32Array> {
  const t0 = performance.now();
  const copy = src.slice();
  const dst = new Uint32Array(8);
  const t1 = performance.now();
  simulateInto(copy, N_JOBS, N_STATIONS, dst);
  const t2 = performance.now();
  const out = dst.slice();
  const t3 = performance.now();
  return { computeMs: t2 - t1, transferMs: t3 - t0, out };
}

function timeWasmSim(src: Uint32Array): Timed<Uint32Array> {
  const t0 = performance.now();
  const inPtr = alloc_u32(src.length);
  const outPtr = alloc_u32(8);
  new Uint32Array(memory!.buffer, inPtr, src.length).set(src);
  const t1 = performance.now();
  simulate(inPtr, N_JOBS, N_STATIONS, outPtr);
  const t2 = performance.now();
  const out = new Uint32Array(memory!.buffer, outPtr, 8).slice();
  dealloc_u32(inPtr, src.length);
  dealloc_u32(outPtr, 8);
  const t3 = performance.now();
  return { computeMs: t2 - t1, transferMs: t3 - t0, out };
}

function timeJsSensors(src: Uint32Array): Timed<Uint32Array> {
  const t0 = performance.now();
  const copy = src.slice();
  const dst = new Uint32Array(8);
  const t1 = performance.now();
  quicksort(copy);
  sensorStats(copy, dst);
  const t2 = performance.now();
  const out = dst.slice();
  const t3 = performance.now();
  return { computeMs: t2 - t1, transferMs: t3 - t0, out };
}

function timeWasmSensors(src: Uint32Array): Timed<Uint32Array> {
  const t0 = performance.now();
  const inPtr = alloc_u32(src.length);
  const outPtr = alloc_u32(8);
  new Uint32Array(memory!.buffer, inPtr, src.length).set(src);
  const t1 = performance.now();
  aggregate(inPtr, src.length, outPtr);
  const t2 = performance.now();
  const out = new Uint32Array(memory!.buffer, outPtr, 8).slice();
  dealloc_u32(inPtr, src.length);
  dealloc_u32(outPtr, 8);
  const t3 = performance.now();
  return { computeMs: t2 - t1, transferMs: t3 - t0, out };
}

function pairFrom(
  jsCompute: number[],
  jsTransfer: number[],
  wasmCompute: number[],
  wasmTransfer: number[],
  match: boolean,
): Pair {
  return {
    jsCompute: summarize(jsCompute),
    jsTransfer: summarize(jsTransfer),
    wasmCompute: summarize(wasmCompute),
    wasmTransfer: summarize(wasmTransfer),
    match,
  };
}

function runImage(pixels: Uint8Array, width: number, height: number) {
  const jsC: number[] = [];
  const jsT: number[] = [];
  const wasmC: number[] = [];
  const wasmT: number[] = [];
  let match = true;
  let lastJs: ReturnType<typeof timeJsImage> | null = null;
  let lastWasm: ReturnType<typeof timeWasmImage> | null = null;
  post({ type: "progress", label: "外観検査のウォームアップ" });
  for (let i = 0; i < WARMUP; i += 1) {
    timeJsImage(pixels, width, height);
    timeWasmImage(pixels, width, height);
  }
  for (let i = 0; i < ITERATIONS; i += 1) {
    post({ type: "progress", label: `外観検査 ${i + 1}/${ITERATIONS}` });
    const jsFirst = i % 2 === 0;
    const first = jsFirst
      ? timeJsImage(pixels, width, height)
      : timeWasmImage(pixels, width, height);
    const second = jsFirst
      ? timeWasmImage(pixels, width, height)
      : timeJsImage(pixels, width, height);
    const js = jsFirst ? first : second;
    const wasm = jsFirst ? second : first;
    jsC.push(js.computeMs);
    jsT.push(js.transferMs);
    wasmC.push(wasm.computeMs);
    wasmT.push(wasm.transferMs);
    if (js.out.count !== wasm.out.count || !sameBytes(js.out.pixels, wasm.out.pixels)) {
      match = false;
    }
    lastJs = js;
    lastWasm = wasm;
  }
  if (!lastJs || !lastWasm) throw new Error("外観検査を測れていません");
  return {
    pair: pairFrom(jsC, jsT, wasmC, wasmT, match),
    jsCount: lastJs.out.count,
    wasmCount: lastWasm.out.count,
    jsPixels: lastJs.out.pixels,
    wasmPixels: lastWasm.out.pixels,
  };
}

function runSim(sim: Uint32Array) {
  const jsC: number[] = [];
  const jsT: number[] = [];
  const wasmC: number[] = [];
  const wasmT: number[] = [];
  let match = true;
  let lastJs: ReturnType<typeof timeJsSim> | null = null;
  let lastWasm: ReturnType<typeof timeWasmSim> | null = null;
  post({ type: "progress", label: "ラインのウォームアップ" });
  for (let i = 0; i < WARMUP; i += 1) {
    timeJsSim(sim);
    timeWasmSim(sim);
  }
  for (let i = 0; i < ITERATIONS; i += 1) {
    post({ type: "progress", label: `ライン ${i + 1}/${ITERATIONS}` });
    const jsFirst = i % 2 === 0;
    const first = jsFirst ? timeJsSim(sim) : timeWasmSim(sim);
    const second = jsFirst ? timeWasmSim(sim) : timeJsSim(sim);
    const js = jsFirst ? first : second;
    const wasm = jsFirst ? second : first;
    jsC.push(js.computeMs);
    jsT.push(js.transferMs);
    wasmC.push(wasm.computeMs);
    wasmT.push(wasm.transferMs);
    if (!sameU32(js.out, wasm.out)) match = false;
    lastJs = js;
    lastWasm = wasm;
  }
  if (!lastJs || !lastWasm) throw new Error("ラインを測れていません");
  return {
    pair: pairFrom(jsC, jsT, wasmC, wasmT, match),
    jsMakespan: readU64(lastJs.out, 0),
    wasmMakespan: readU64(lastWasm.out, 0),
    jsLead: readU64(lastJs.out, 2),
    wasmLead: readU64(lastWasm.out, 2),
    jsWait: readU64(lastJs.out, 4),
    wasmWait: readU64(lastWasm.out, 4),
  };
}

function runSensors(sensors: Uint32Array) {
  const jsC: number[] = [];
  const jsT: number[] = [];
  const wasmC: number[] = [];
  const wasmT: number[] = [];
  let match = true;
  let lastJs: ReturnType<typeof timeJsSensors> | null = null;
  let lastWasm: ReturnType<typeof timeWasmSensors> | null = null;
  post({ type: "progress", label: "センサ列のウォームアップ" });
  for (let i = 0; i < WARMUP; i += 1) {
    timeJsSensors(sensors);
    timeWasmSensors(sensors);
  }
  for (let i = 0; i < ITERATIONS; i += 1) {
    post({ type: "progress", label: `センサ列 ${i + 1}/${ITERATIONS}` });
    const jsFirst = i % 2 === 0;
    const first = jsFirst ? timeJsSensors(sensors) : timeWasmSensors(sensors);
    const second = jsFirst ? timeWasmSensors(sensors) : timeJsSensors(sensors);
    const js = jsFirst ? first : second;
    const wasm = jsFirst ? second : first;
    jsC.push(js.computeMs);
    jsT.push(js.transferMs);
    wasmC.push(wasm.computeMs);
    wasmT.push(wasm.transferMs);
    if (!sameU32(js.out, wasm.out)) match = false;
    lastJs = js;
    lastWasm = wasm;
  }
  if (!lastJs || !lastWasm) throw new Error("センサ列を測れていません");
  return {
    pair: pairFrom(jsC, jsT, wasmC, wasmT, match),
    jsP50: lastJs.out[0],
    wasmP50: lastWasm.out[0],
    jsP95: lastJs.out[1],
    wasmP95: lastWasm.out[1],
  };
}

self.onmessage = (event: MessageEvent<{ pixels: Uint8Array; width: number; height: number }>) => {
  const { pixels, width, height } = event.data;
  void (async () => {
    try {
      post({ type: "progress", label: "WebAssembly を読み込んでいます" });
      if (!memory) {
        const ready = await init();
        memory = ready.memory;
      }
      post({ type: "progress", label: "入力を準備しています" });
      const { sim, sensors } = prepareInputs();
      const image = runImage(pixels, width, height);
      const line = runSim(sim);
      const sensorsResult = runSensors(sensors);
      const result: BenchResult = {
        ranAt: new Date().toISOString(),
        cores: null,
        userAgent: "",
        width,
        height,
        image: {
          ...image.pair,
          jsCount: image.jsCount,
          wasmCount: image.wasmCount,
          jsPixels: new Uint8ClampedArray(image.jsPixels),
          wasmPixels: new Uint8ClampedArray(image.wasmPixels),
        },
        line: {
          ...line.pair,
          jsMakespan: line.jsMakespan,
          wasmMakespan: line.wasmMakespan,
          jsLead: line.jsLead,
          wasmLead: line.wasmLead,
          jsWait: line.jsWait,
          wasmWait: line.wasmWait,
        },
        sensors: {
          ...sensorsResult.pair,
          jsP50: sensorsResult.jsP50,
          wasmP50: sensorsResult.wasmP50,
          jsP95: sensorsResult.jsP95,
          wasmP95: sensorsResult.wasmP95,
        },
      };
      const transfer = [result.image.jsPixels.buffer, result.image.wasmPixels.buffer];
      self.postMessage({ type: "done", result } satisfies WorkerOut, { transfer });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      post({ type: "error", message });
    }
  })();
};
