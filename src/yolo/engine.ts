import type { DetectResult, InMsg, LoadResult, OutMsg, RethresholdResult } from "./protocol";

type Pending = {
  resolve: (message: OutMsg) => void;
  reject: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
  onSession?: () => void;
};

type Request =
  | { type: "load"; url: string }
  | { type: "detect"; bitmap: ImageBitmap; conf: number; iou: number }
  | { type: "rethreshold"; conf: number; iou: number };

export function createEngine() {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
    type: "module",
  });
  let seq = 0;
  const pending = new Map<number, Pending>();
  let chain: Promise<unknown> = Promise.resolve();

  worker.onmessage = (event: MessageEvent<OutMsg>) => {
    const message = event.data;
    if (message.type === "progress") {
      pending.get(message.id)?.onProgress?.(message.loaded, message.total);
      return;
    }
    if (message.type === "session") {
      pending.get(message.id)?.onSession?.();
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

  function request<T>(body: Request, hooks?: Pick<Pending, "onProgress" | "onSession">): Promise<T> {
    const id = ++seq;
    const message = { ...body, id } as InMsg;
    const run = () =>
      new Promise<T>((resolve, reject) => {
        pending.set(id, {
          resolve: (response) => resolve(response as T),
          reject,
          onProgress: hooks?.onProgress,
          onSession: hooks?.onSession,
        });
        worker.postMessage(message);
      });
    const next = chain.then(run, run);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  return {
    load(
      url: string,
      hooks?: { onProgress?: (loaded: number, total: number) => void; onSession?: () => void },
    ) {
      return request<LoadResult & { type: "loaded"; id: number }>({ type: "load", url }, hooks);
    },
    detect(bitmap: ImageBitmap, conf: number, iou: number) {
      return request<DetectResult & { type: "detected"; id: number }>({
        type: "detect",
        bitmap,
        conf,
        iou,
      });
    },
    rethreshold(conf: number, iou: number) {
      return request<RethresholdResult & { type: "rethresholded"; id: number }>({
        type: "rethreshold",
        conf,
        iou,
      });
    },
    dispose() {
      try {
        worker.postMessage({ type: "dispose" } satisfies InMsg);
      } catch {
        // worker already stopped
      }
      worker.terminate();
      for (const job of pending.values()) job.reject(new Error("中断しました"));
      pending.clear();
    },
  };
}

export type Engine = ReturnType<typeof createEngine>;
