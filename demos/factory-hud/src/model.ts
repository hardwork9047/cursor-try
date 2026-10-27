export const SECTIONS = [
  { id: "overview", no: "01", en: "OVERVIEW", ja: "概要" },
  { id: "stations", no: "02", en: "STATIONS", ja: "工程" },
  { id: "inspect", no: "03", en: "INSPECT", ja: "検査" },
  { id: "memory", no: "04", en: "MEMORY", ja: "知見" },
  { id: "trajectory", no: "05", en: "TRAJECTORY", ja: "軌跡" },
  { id: "metrics", no: "06", en: "METRICS", ja: "計測" },
  { id: "console", no: "07", en: "CONSOLE", ja: "ログ" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export type Status = "booting" | "online" | "standby";

export const STATUS_EN: Record<Status, string> = {
  booting: "BOOTING",
  online: "ONLINE",
  standby: "STANDBY",
};

export const STATUS_JA: Record<Status, string> = {
  booting: "起動中",
  online: "稼働",
  standby: "停止",
};

export type StationSim = {
  id: string;
  en: string;
  ja: string;
  jobs: number;
  p90: number;
  load: number;
};

export type DefectSim = {
  id: string;
  ja: string;
  count: number;
};

export type SimSnapshot = {
  tick: number;
  taktSec: number;
  bottleneckId: string;
  stations: StationSim[];
  defects: DefectSim[];
  heats: Record<string, number>;
  series: {
    cycle: number[];
    queue: number[];
    defects: number[];
  };
};

export type LogLine = {
  id: number;
  at: Date;
  text: string;
};

export type Backend = "pending" | "hic" | "webgpu" | "dom";

export type RenderMetrics = {
  fps: number | null;
  frameMs: number | null;
  backend: Backend;
  adapter: string;
};

export const BACKEND_LABEL: Record<Backend, string> = {
  pending: "—",
  hic: "WebGPU HTML-in-Canvas",
  webgpu: "WebGPU only",
  dom: "DOM fallback",
};

export const MEMORY_NODES = [
  { id: "setup", label: "段取り", x: 92, y: 64 },
  { id: "tool", label: "刃具", x: 250, y: 48 },
  { id: "jig", label: "治具", x: 430, y: 78 },
  { id: "torque", label: "トルク", x: 150, y: 188 },
  { id: "look", label: "外観基準", x: 318, y: 176 },
  { id: "poka", label: "ポカヨケ", x: 512, y: 210 },
  { id: "pack", label: "梱包", x: 214, y: 318 },
  { id: "first", label: "初物", x: 430, y: 328 },
] as const;

export const MEMORY_LINKS: ReadonlyArray<readonly [string, string]> = [
  ["setup", "tool"],
  ["setup", "jig"],
  ["tool", "torque"],
  ["jig", "look"],
  ["torque", "look"],
  ["look", "poka"],
  ["look", "first"],
  ["poka", "pack"],
  ["first", "pack"],
  ["setup", "first"],
];

export const TRAJECTORY = [
  { en: "SENSE", ja: "センサがワークを検知" },
  { en: "RECALL", ja: "知見から候補を引く" },
  { en: "CHECK", ja: "しきい値とくらべる" },
  { en: "HOLD", ja: "人の確認を待つ" },
  { en: "ACT", ja: "セルへ指示を返す" },
  { en: "LOG", ja: "結果を記録する" },
] as const;

export const LOG_PHRASES = [
  "投入がワークを受けた",
  "加工の刃具メモを参照した",
  "組付のトルク候補を引いた",
  "外観はしきい値の内側",
  "ポカヨケを通過した",
  "出荷レーンへ渡した",
  "相対的に長い工程を更新した",
  "初物フラグは立っていない",
  "治具の当たりを確認した",
  "寸法の揺れを記録した",
];

const STATION_SEED: Pick<StationSim, "id" | "en" | "ja">[] = [
  { id: "L01", en: "INFEED", ja: "投入" },
  { id: "L02", en: "MILL", ja: "加工" },
  { id: "L03", en: "FIT", ja: "組付" },
  { id: "L04", en: "VISION", ja: "外観" },
  { id: "L05", en: "PACK", ja: "出荷" },
];

const DEFECT_SEED: Pick<DefectSim, "id" | "ja">[] = [
  { id: "scratch", ja: "キズ" },
  { id: "chip", ja: "欠け" },
  { id: "stain", ja: "汚れ" },
  { id: "size", ja: "寸法" },
  { id: "foreign", ja: "異物" },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bottleneckId(stations: StationSim[]) {
  return stations.reduce((best, station) => (station.p90 > best.p90 ? station : best)).id;
}

function pushSeries(series: number[], value: number) {
  const next = series.length >= 28 ? series.slice(1) : series.slice();
  next.push(value);
  return next;
}

export function createSim(): SimSnapshot {
  const rand = mulberry32(0x7ac7);
  const stations = STATION_SEED.map((station) => ({
    ...station,
    jobs: 3 + Math.floor(rand() * 10),
    p90: 18 + rand() * 64,
    load: 0.22 + rand() * 0.55,
  }));
  const defects = DEFECT_SEED.map((defect) => ({
    ...defect,
    count: Math.floor(rand() * 8),
  }));
  const heats: Record<string, number> = {};
  for (const node of MEMORY_NODES) heats[node.id] = 0.25 + rand() * 0.6;
  const cycle: number[] = [];
  const queue: number[] = [];
  const defectSeries: number[] = [];
  let takt = 36 + rand() * 18;
  for (let i = 0; i < 28; i += 1) {
    takt = clamp(takt + (rand() - 0.5) * 4, 24, 72);
    cycle.push(takt);
    queue.push(8 + rand() * 24);
    defectSeries.push(rand() * 12);
  }
  return {
    tick: 0,
    taktSec: takt,
    bottleneckId: bottleneckId(stations),
    stations,
    defects,
    heats,
    series: { cycle, queue, defects: defectSeries },
  };
}

export function stepSim(prev: SimSnapshot): SimSnapshot {
  const rand = mulberry32((prev.tick + 1) * 0x9e3779b1);
  const stations = prev.stations.map((station) => ({
    ...station,
    jobs: clamp(Math.round(station.jobs + (rand() - 0.46) * 3), 0, 36),
    p90: clamp(station.p90 + (rand() - 0.5) * 7, 12, 160),
    load: clamp(station.load + (rand() - 0.5) * 0.08, 0.06, 0.98),
  }));
  const defects = prev.defects.map((defect) => ({
    ...defect,
    count: clamp(Math.round(defect.count + (rand() - 0.58) * 2), 0, 24),
  }));
  const heats: Record<string, number> = {};
  for (const node of MEMORY_NODES) {
    heats[node.id] = clamp((prev.heats[node.id] ?? 0.4) + (rand() - 0.5) * 0.12, 0.08, 1);
  }
  const taktSec = clamp(prev.taktSec + (rand() - 0.5) * 2.4, 24, 72);
  const queue = stations.reduce((sum, station) => sum + station.jobs, 0);
  const defectTotal = defects.reduce((sum, defect) => sum + defect.count, 0);
  return {
    tick: prev.tick + 1,
    taktSec,
    bottleneckId: bottleneckId(stations),
    stations,
    defects,
    heats,
    series: {
      cycle: pushSeries(prev.series.cycle, taktSec),
      queue: pushSeries(prev.series.queue, queue),
      defects: pushSeries(prev.series.defects, defectTotal),
    },
  };
}

export function trajectoryOffsets(tick: number) {
  const rand = mulberry32(0x51ed + tick * 17);
  const marks: number[] = [];
  let cursor = 0;
  for (let i = 0; i < TRAJECTORY.length; i += 1) {
    cursor += 0.15 + rand() * 0.55;
    marks.push(cursor);
  }
  return marks;
}

export function formatClockDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()} / ${month} / ${day}`;
}

export function formatClockTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatMeasured(value: number | null, digits: number) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (digits === 0) return String(Math.round(value));
  return value.toFixed(digits);
}
