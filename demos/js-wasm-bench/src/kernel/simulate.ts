function writeU64(out: Uint32Array, at: number, value: bigint): void {
  out[at] = Number(value & 0xffffffffn);
  out[at + 1] = Number((value >> 32n) & 0xffffffffn);
}

export function simulateInto(
  data: Uint32Array,
  nJobs: number,
  nStations: number,
  out: Uint32Array,
): void {
  const gaps = data.subarray(0, nJobs);
  const service = data.subarray(nJobs);
  const free = new BigUint64Array(nStations);
  let ready = 0n;
  let sumLead = 0n;
  let makespan = 0n;
  let maxWait = 0n;
  for (let job = 0; job < nJobs; job += 1) {
    const arrival = ready;
    ready += 1n + BigInt(gaps[job] % 8);
    let t = arrival;
    for (let s = 0; s < nStations; s += 1) {
      const start = t > free[s] ? t : free[s];
      const wait = start - t;
      if (wait > maxWait) maxWait = wait;
      const svc = 1n + BigInt(service[job * nStations + s] % 32);
      t = start + svc;
      free[s] = t;
    }
    sumLead += t - arrival;
    makespan = t;
  }
  writeU64(out, 0, makespan);
  writeU64(out, 2, sumLead);
  writeU64(out, 4, maxWait);
  out[6] = nJobs;
  out[7] = nStations;
}

export function readU64(data: Uint32Array, at: number): bigint {
  return BigInt(data[at]) + (BigInt(data[at + 1]) << 32n);
}
