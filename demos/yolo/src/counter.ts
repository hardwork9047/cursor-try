import type { Box } from "./postprocess";

type Track = {
  id: number;
  box: Box;
  counted: boolean;
  missed: number;
};

export type Direction = "down" | "up";

function center(box: Box): { x: number; y: number } {
  return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

function affinity(track: Box, box: Box): number {
  if (track.classId !== box.classId) return 0;
  const overlap = iou(track, box);
  if (overlap >= 0.15) return overlap;
  const a = center(track);
  const b = center(box);
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const scale = Math.max(track.x2 - track.x1, track.y2 - track.y1, box.x2 - box.x1, box.y2 - box.y1, 1);
  if (dist < scale * 1.25) return 0.14 * (1 - dist / (scale * 1.25));
  return 0;
}

export class LineCounter {
  private tracks: Track[] = [];
  private nextId = 1;
  private totals = new Map<number, number>();

  reset() {
    this.tracks = [];
    this.nextId = 1;
    this.totals = new Map();
  }

  resetTracks() {
    this.tracks = [];
  }

  total(): number {
    let sum = 0;
    for (const value of this.totals.values()) sum += value;
    return sum;
  }

  byClass(): { classId: number; count: number }[] {
    return [...this.totals.entries()]
      .map(([classId, count]) => ({ classId, count }))
      .sort((a, b) => b.count - a.count || a.classId - b.classId);
  }

  update(boxes: Box[], lineY: number, direction: Direction) {
    const used = new Set<number>();
    const pairs: { ti: number; di: number; score: number }[] = [];
    this.tracks.forEach((track, ti) => {
      boxes.forEach((box, di) => {
        const score = affinity(track.box, box);
        if (score > 0) pairs.push({ ti, di, score });
      });
    });
    pairs.sort((a, b) => b.score - a.score);
    const matchedTracks = new Set<number>();
    const next: Track[] = [];
    for (const pair of pairs) {
      if (matchedTracks.has(pair.ti) || used.has(pair.di)) continue;
      matchedTracks.add(pair.ti);
      used.add(pair.di);
      const track = this.tracks[pair.ti];
      const box = boxes[pair.di];
      const prevY = center(track.box).y;
      const nextY = center(box).y;
      let counted = track.counted;
      const crossed =
        direction === "down" ? prevY < lineY && nextY >= lineY : prevY > lineY && nextY <= lineY;
      if (!counted && crossed) {
        counted = true;
        this.totals.set(box.classId, (this.totals.get(box.classId) ?? 0) + 1);
      }
      next.push({ id: track.id, box, counted, missed: 0 });
    }
    this.tracks.forEach((track, ti) => {
      if (matchedTracks.has(ti)) return;
      const missed = track.missed + 1;
      if (missed <= 6) next.push({ ...track, missed });
    });
    boxes.forEach((box, di) => {
      if (used.has(di)) return;
      next.push({ id: this.nextId++, box, counted: false, missed: 0 });
    });
    this.tracks = next;
  }
}
