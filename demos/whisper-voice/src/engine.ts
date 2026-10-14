import type { LanguageChoice, WorkerOut } from "./types";

export function createEngine(onEvent: (event: WorkerOut) => void) {
  let generation = 0;
  let worker: Worker | null = null;

  function spawn() {
    const id = ++generation;
    const next = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    next.onmessage = (event: MessageEvent<WorkerOut>) => {
      if (id !== generation) return;
      onEvent(event.data);
    };
    next.onerror = (event) => {
      if (id !== generation) return;
      onEvent({ type: "error", message: event.message || "ワーカーが止まりました" });
    };
    worker = next;
  }

  spawn();

  return {
    transcribe(samples: Float32Array, durationSec: number, language: LanguageChoice) {
      const copy = samples.slice();
      worker?.postMessage(
        { type: "transcribe", samples: copy.buffer, durationSec, language } satisfies {
          type: "transcribe";
          samples: ArrayBuffer;
          durationSec: number;
          language: LanguageChoice;
        },
        [copy.buffer],
      );
    },
    restart() {
      worker?.terminate();
      spawn();
    },
    close() {
      generation += 1;
      worker?.terminate();
      worker = null;
    },
  };
}
