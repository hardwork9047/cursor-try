import type { Box } from "./postprocess";
import { WAREHOUSE_FORKLIFT, WAREHOUSE_PERSON } from "./classes";

type Track = {
  id: number;
  box: Box;
  missed: number;
};

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
  const overlap = iou(track, box);
  if (overlap >= 0.15) return overlap;
  const a = center(track);
  const b = center(box);
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const scale = Math.max(track.x2 - track.x1, track.y2 - track.y1, box.x2 - box.x1, box.y2 - box.y1, 1);
  if (dist < scale * 1.25) return 0.14 * (1 - dist / (scale * 1.25));
  return 0;
}

/** Edge-to-edge gap. Overlap or touching is 0. */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, a.x1 - b.x2, b.x1 - a.x2);
  const dy = Math.max(0, a.y1 - b.y2, b.y1 - a.y2);
  return Math.hypot(dx, dy);
}

export function gapLimit(width: number, height: number, ratio: number): number {
  return Math.max(0, ratio) * Math.min(width, height);
}

export function closePairs(boxes: Box[], limit: number): { pairs: number; indexes: Set<number> } {
  const people: number[] = [];
  const lifts: number[] = [];
  boxes.forEach((box, index) => {
    if (box.classId === WAREHOUSE_PERSON) people.push(index);
    else if (box.classId === WAREHOUSE_FORKLIFT) lifts.push(index);
  });
  const indexes = new Set<number>();
  let pairs = 0;
  for (const person of people) {
    for (const lift of lifts) {
      if (boxGap(boxes[person], boxes[lift]) <= limit) {
        pairs += 1;
        indexes.add(person);
        indexes.add(lift);
      }
    }
  }
  return { pairs, indexes };
}

function matchTracks(tracks: Track[], boxes: Box[]): Track[] {
  const used = new Set<number>();
  const pairs: { ti: number; di: number; score: number }[] = [];
  tracks.forEach((track, ti) => {
    boxes.forEach((box, di) => {
      const score = affinity(track.box, box);
      if (score > 0) pairs.push({ ti, di, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const matched = new Set<number>();
  const next: Track[] = [];
  for (const pair of pairs) {
    if (matched.has(pair.ti) || used.has(pair.di)) continue;
    matched.add(pair.ti);
    used.add(pair.di);
    next.push({ id: tracks[pair.ti].id, box: boxes[pair.di], missed: 0 });
  }
  tracks.forEach((track, ti) => {
    if (matched.has(ti)) return;
    const missed = track.missed + 1;
    if (missed <= 6) next.push({ ...track, missed });
  });
  return next;
}

/**
 * Counts a near-miss when a tracked person and forklift move from outside
 * the gap to inside it. The first frame a pair is visible and already inside
 * counts once. Slider changes should call rebase so they do not add events.
 */
export class ProximityCounter {
  private people: Track[] = [];
  private lifts: Track[] = [];
  private nextId = 1;
  private near = new Map<string, boolean>();
  events = 0;

  reset() {
    this.people = [];
    this.lifts = [];
    this.nextId = 1;
    this.near = new Map();
    this.events = 0;
  }

  rebase(width: number, height: number, ratio: number) {
    const limit = gapLimit(width, height, ratio);
    const people = this.people.filter((track) => track.missed === 0);
    const lifts = this.lifts.filter((track) => track.missed === 0);
    for (const person of people) {
      for (const lift of lifts) {
        this.near.set(`${person.id}:${lift.id}`, boxGap(person.box, lift.box) <= limit);
      }
    }
  }

  update(boxes: Box[], width: number, height: number, ratio: number) {
    const limit = gapLimit(width, height, ratio);
    const personBoxes = boxes.filter((box) => box.classId === WAREHOUSE_PERSON);
    const liftBoxes = boxes.filter((box) => box.classId === WAREHOUSE_FORKLIFT);
    const knownPeople = this.people;
    const knownLifts = this.lifts;
    let people = matchTracks(knownPeople, personBoxes);
    let lifts = matchTracks(knownLifts, liftBoxes);
    const usedPeople = new Set(people.map((track) => track.box));
    const usedLifts = new Set(lifts.map((track) => track.box));
    for (const box of personBoxes) {
      if (!usedPeople.has(box)) people.push({ id: this.nextId++, box, missed: 0 });
    }
    for (const box of liftBoxes) {
      if (!usedLifts.has(box)) lifts.push({ id: this.nextId++, box, missed: 0 });
    }
    this.people = people;
    this.lifts = lifts;

    const alive = new Set([...people, ...lifts].map((track) => track.id));
    for (const key of [...this.near.keys()]) {
      const [personId, liftId] = key.split(":").map(Number);
      if (!alive.has(personId) || !alive.has(liftId)) this.near.delete(key);
    }

    for (const person of people) {
      if (person.missed > 0) continue;
      for (const lift of lifts) {
        if (lift.missed > 0) continue;
        const key = `${person.id}:${lift.id}`;
        const isNear = boxGap(person.box, lift.box) <= limit;
        if (isNear && !this.near.get(key)) this.events += 1;
        this.near.set(key, isNear);
      }
    }
  }
}
