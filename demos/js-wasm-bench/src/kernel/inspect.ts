import { MIN_AREA } from "../params";

function find(parent: Uint32Array, mut: number): number {
  let x = mut;
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]];
    x = parent[x];
  }
  return x;
}

function union(parent: Uint32Array, a: number, b: number): void {
  let ra = find(parent, a);
  let rb = find(parent, b);
  if (ra === rb) return;
  if (ra > rb) {
    const tmp = ra;
    ra = rb;
    rb = tmp;
  }
  parent[rb] = ra;
}

export function otsu(hist: Uint32Array, total: number): number {
  const totalN = BigInt(total);
  let sumAll = 0n;
  for (let t = 0; t < 256; t += 1) {
    sumAll += BigInt(t) * BigInt(hist[t]);
  }
  let wB = 0n;
  let sumB = 0n;
  let bestT = 0;
  let bestNum = 0n;
  let bestDen = 1n;
  for (let t = 0; t < 256; t += 1) {
    wB += BigInt(hist[t]);
    if (wB === 0n) continue;
    const wF = totalN - wB;
    if (wF === 0n) break;
    sumB += BigInt(t) * BigInt(hist[t]);
    const diff = sumB * totalN - sumAll * wB;
    const num = diff * diff;
    const den = wB * wF;
    if (num * bestDen > bestNum * den) {
      bestNum = num;
      bestDen = den;
      bestT = t;
    }
  }
  return bestT;
}

export function inspectInto(
  rgba: Uint8Array,
  width: number,
  height: number,
  out: Uint8Array,
): number {
  const n = width * height;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    gray[i] = (77 * r + 150 * g + 29 * b) >> 8;
  }

  const blur = new Uint8Array(n);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += gray[ny * width + nx];
          count += 1;
        }
      }
      blur[y * width + x] = (sum / count) | 0;
    }
  }

  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i += 1) hist[blur[i]] += 1;
  const threshold = otsu(hist, n);

  const parent = new Uint32Array(n + 1);
  const labels = new Uint32Array(n);
  let next = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      // Class split is 0..=t versus t+1..=255. Ties keep the first t.
      if (blur[i] <= threshold) continue;
      const left = x > 0 ? labels[i - 1] : 0;
      const up = y > 0 ? labels[i - width] : 0;
      if (left === 0 && up === 0) {
        parent[next] = next;
        labels[i] = next;
        next += 1;
      } else if (up === 0) {
        labels[i] = left;
      } else if (left === 0) {
        labels[i] = up;
      } else {
        labels[i] = left < up ? left : up;
        union(parent, left, up);
      }
    }
  }

  const area = new Uint32Array(next);
  for (let i = 0; i < n; i += 1) {
    if (labels[i] !== 0) {
      const root = find(parent, labels[i]);
      labels[i] = root;
      area[root] += 1;
    }
  }
  let components = 0;
  for (let id = 1; id < next; id += 1) {
    if (parent[id] === id && area[id] >= MIN_AREA) components += 1;
  }

  for (let i = 0; i < n; i += 1) {
    const v = blur[i] > threshold ? 255 : 0;
    const o = i * 4;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
  return components;
}
