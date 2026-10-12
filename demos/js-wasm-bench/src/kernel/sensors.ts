export function quicksort(a: Uint32Array): void {
  if (a.length === 0) return;
  const stack: number[] = [0, a.length - 1];
  while (stack.length > 0) {
    const hi = stack.pop() as number;
    const lo = stack.pop() as number;
    if (lo >= hi) continue;
    const pivot = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i += 1;
      while (a[j] > pivot) j -= 1;
      if (i <= j) {
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
        i += 1;
        j -= 1;
      }
    }
    if (lo < j) stack.push(lo, j);
    if (i < hi) stack.push(i, hi);
  }
}

export function sensorStats(a: Uint32Array, out: Uint32Array): void {
  const n = a.length;
  const p50 = a[(n / 2) | 0];
  const p95 = a[((95 * (n - 1)) / 100) | 0];
  let sum = 0n;
  let countGe = 0;
  for (let i = 0; i < n; i += 1) {
    const v = a[i];
    sum += BigInt(v);
    if (v >= 0x80000000) countGe += 1;
  }
  out[0] = p50;
  out[1] = p95;
  out[2] = Number(sum & 0xffffffffn);
  out[3] = Number((sum >> 32n) & 0xffffffffn);
  out[4] = countGe;
  out[5] = a[0];
  out[6] = a[n - 1];
  out[7] = n;
}
