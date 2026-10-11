import type { Box } from "./postprocess";

export type BackendName = "webgpu" | "wasm";

export type LoadResult = {
  backend: BackendName;
  loadMs: number;
  webgpuNote: string;
  outputDims: number[];
  bytes: number;
};

export type DetectResult = {
  boxes: Box[];
  preprocessMs: number;
  inferenceMs: number;
  postprocessMs: number;
};

export type RethresholdResult = {
  boxes: Box[];
  postprocessMs: number;
};

export type InMsg =
  | { type: "load"; id: number; url: string }
  | { type: "detect"; id: number; bitmap: ImageBitmap; conf: number; iou: number }
  | { type: "rethreshold"; id: number; conf: number; iou: number }
  | { type: "dispose" };

export type OutMsg =
  | { type: "progress"; id: number; loaded: number; total: number }
  | { type: "session"; id: number }
  | ({ type: "loaded"; id: number } & LoadResult)
  | ({ type: "detected"; id: number } & DetectResult)
  | ({ type: "rethresholded"; id: number } & RethresholdResult)
  | { type: "error"; id: number; message: string };
