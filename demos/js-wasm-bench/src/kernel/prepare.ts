import { LCG_MUL, LCG_SEED, N_JOBS, N_SENSORS, N_STATIONS, U64_MASK } from "../params";

function nextU32(seed: bigint): { value: number; state: bigint } {
  const state = (seed * LCG_MUL + 1n) & U64_MASK;
  return { value: Number(state & 0xffffffffn), state };
}

export function prepareInputs(): { sim: Uint32Array; sensors: Uint32Array } {
  let state = LCG_SEED & U64_MASK;
  const gaps = new Uint32Array(N_JOBS);
  for (let i = 0; i < N_JOBS; i += 1) {
    const step = nextU32(state);
    gaps[i] = step.value;
    state = step.state;
  }
  const service = new Uint32Array(N_JOBS * N_STATIONS);
  for (let i = 0; i < service.length; i += 1) {
    const step = nextU32(state);
    service[i] = step.value;
    state = step.state;
  }
  const sensors = new Uint32Array(N_SENSORS);
  for (let i = 0; i < sensors.length; i += 1) {
    const step = nextU32(state);
    sensors[i] = step.value;
    state = step.state;
  }
  const sim = new Uint32Array(N_JOBS + N_JOBS * N_STATIONS);
  sim.set(gaps, 0);
  sim.set(service, N_JOBS);
  return { sim, sensors };
}
