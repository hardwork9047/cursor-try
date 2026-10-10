import { buildSeedHistory } from "./demoData";
import type { RunRecord } from "./types";

const REAL_KEY = "genba-bench-history-v1";
const DEMO_KEY = "genba-bench-demo-history-v1";
const LIMIT = 24;

const params = new URLSearchParams(window.location.search);
export const isDemo = params.get("demo") === "1";

if (isDemo && params.get("fresh") === "1") {
  localStorage.removeItem(DEMO_KEY);
}

function keyFor(demo: boolean): string {
  return demo ? DEMO_KEY : REAL_KEY;
}

export function loadHistory(demo: boolean): RunRecord[] {
  const raw = localStorage.getItem(keyFor(demo));
  if (!raw) {
    if (!demo) return [];
    const seed = buildSeedHistory();
    localStorage.setItem(DEMO_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as RunRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRun(record: RunRecord, demo: boolean): RunRecord[] {
  const next = [record, ...loadHistory(demo)].slice(0, LIMIT);
  localStorage.setItem(keyFor(demo), JSON.stringify(next));
  return next;
}

export function clearHistory(demo: boolean): RunRecord[] {
  localStorage.removeItem(keyFor(demo));
  return loadHistory(demo);
}
