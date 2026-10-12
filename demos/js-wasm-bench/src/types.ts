import type { Summary } from "./stats";

export type Pair = {
  jsCompute: Summary;
  jsTransfer: Summary;
  wasmCompute: Summary;
  wasmTransfer: Summary;
  match: boolean;
};

export type BenchResult = {
  ranAt: string;
  cores: number | null;
  userAgent: string;
  width: number;
  height: number;
  image: Pair & {
    jsCount: number;
    wasmCount: number;
    jsPixels: Uint8ClampedArray;
    wasmPixels: Uint8ClampedArray;
  };
  line: Pair & {
    jsMakespan: bigint;
    wasmMakespan: bigint;
    jsLead: bigint;
    wasmLead: bigint;
    jsWait: bigint;
    wasmWait: bigint;
  };
  sensors: Pair & {
    jsP50: number;
    wasmP50: number;
    jsP95: number;
    wasmP95: number;
  };
};

export type ProgressMessage = { type: "progress"; label: string };
export type ErrorMessage = { type: "error"; message: string };
export type DoneMessage = { type: "done"; result: BenchResult };
export type WorkerOut = ProgressMessage | ErrorMessage | DoneMessage;
