type LoadBody = { type: "load"; url: string };
type InferBody = { type: "infer"; bitmap: ImageBitmap };
type InMsg = (LoadBody & { id: number }) | (InferBody & { id: number });

type OutMsg =
  | { type: "progress"; id: number; label: string }
  | { type: "loaded"; id: number; backend: "webgpu" | "wasm"; loadMs: number; note: string }
  | { type: "depth"; id: number; width: number; height: number; relative: Float32Array; inferMs: number }
  | { type: "error"; id: number; message: string };

type Pending = {
  resolve: (message: OutMsg) => void;
  reject: (error: Error) => void;
  onProgress?: (label: string) => void;
};

export function createEngine() {
  const worker = new Worker(new URL("./depth.worker.ts", import.meta.url), { type: "module" });
  let seq = 0;
  const pending = new Map<number, Pending>();
  let chain: Promise<unknown> = Promise.resolve();

  worker.onmessage = (event: MessageEvent<OutMsg>) => {
    const message = event.data;
    if (message.type === "progress") {
      pending.get(message.id)?.onProgress?.(message.label);
      return;
    }
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    if (message.type === "error") job.reject(new Error(message.message));
    else job.resolve(message);
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || "推論ワーカーが停止しました");
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  };

  function request<T>(body: LoadBody | InferBody, onProgress?: (label: string) => void): Promise<T> {
    const id = ++seq;
    const run = () =>
      new Promise<T>((resolve, reject) => {
        pending.set(id, {
          resolve: (response) => resolve(response as T),
          reject,
          onProgress,
        });
        const message = { ...body, id } as InMsg;
        if (message.type === "infer") worker.postMessage(message, [message.bitmap]);
        else worker.postMessage(message);
      });
    const next = chain.then(run, run);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  return {
    load(url: string, onProgress?: (label: string) => void) {
      return request<Extract<OutMsg, { type: "loaded" }>>({ type: "load", url }, onProgress);
    },
    infer(bitmap: ImageBitmap, onProgress?: (label: string) => void) {
      return request<Extract<OutMsg, { type: "depth" }>>({ type: "infer", bitmap }, onProgress);
    },
    close() {
      worker.terminate();
    },
  };
}
