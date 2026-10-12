export type Backend = "webgpu" | "wasm";

export type Photo = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  label: string;
  credit: string;
};

export type DepthRun = {
  relative: Float32Array;
  width: number;
  height: number;
  inferMs: number;
  loadMs: number;
  backend: Backend;
  note: string;
  ranAt: string;
};

export type GpuInfo = {
  name: string;
  detail: string;
};
