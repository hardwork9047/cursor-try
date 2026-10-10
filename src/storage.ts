import type { RunRecord } from "./types";

const REAL_KEY = "genba-bench-history-v1";
const LEGACY_DEMO_KEY = "genba-bench-demo-history-v1";
const LIMIT = 24;

function isMeasuredRun(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const run = value as RunRecord & { demo?: boolean };
  if (run.demo === true) return false;
  return (
    typeof run.id === "string" &&
    typeof run.createdAt === "string" &&
    typeof run.modelId === "string" &&
    typeof run.modelLabel === "string" &&
    typeof run.loadMs === "number" &&
    typeof run.ttftMs === "number" &&
    typeof run.decodeTokPerS === "number" &&
    typeof run.gpu === "string" &&
    Array.isArray(run.prompts)
  );
}

export function loadHistory(): RunRecord[] {
  localStorage.removeItem(LEGACY_DEMO_KEY);
  const raw = localStorage.getItem(REAL_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const measured = parsed.filter(isMeasuredRun);
    if (measured.length !== parsed.length) {
      localStorage.setItem(REAL_KEY, JSON.stringify(measured));
    }
    return measured;
  } catch {
    return [];
  }
}

export function saveRun(record: RunRecord): RunRecord[] {
  const next = [record, ...loadHistory()].slice(0, LIMIT);
  localStorage.setItem(REAL_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(): RunRecord[] {
  localStorage.removeItem(REAL_KEY);
  localStorage.removeItem(LEGACY_DEMO_KEY);
  return [];
}
