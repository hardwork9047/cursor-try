//! Same steps as `src/kernel/*.ts`. Change both sides together.
//! Integer arithmetic only, so the outputs can be compared exactly.

use wasm_bindgen::prelude::*;

/// Foreground components smaller than this are not counted.
const MIN_AREA: u32 = 48;

#[wasm_bindgen]
pub fn alloc_u8(size: u32) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(size as usize);
    buf.resize(size as usize, 0);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[wasm_bindgen]
pub fn dealloc_u8(ptr: *mut u8, size: u32) {
    if ptr.is_null() || size == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, size as usize, size as usize);
    }
}

#[wasm_bindgen]
pub fn alloc_u32(len: u32) -> *mut u32 {
    let mut buf = vec![0u32; len as usize];
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[wasm_bindgen]
pub fn dealloc_u32(ptr: *mut u32, len: u32) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let _ = Vec::from_raw_parts(ptr, len as usize, len as usize);
    }
}

/// Grayscale, 3×3 box blur, Otsu threshold, 4-connected labels.
/// Writes an RGBA mask and returns the count of components with area >= 48.
#[wasm_bindgen]
pub fn inspect(rgba_ptr: *const u8, width: u32, height: u32, out_ptr: *mut u8) -> u32 {
    let n = (width as usize).saturating_mul(height as usize);
    let bytes = n.saturating_mul(4);
    if n == 0 || rgba_ptr.is_null() || out_ptr.is_null() {
        return 0;
    }
    let rgba = unsafe { std::slice::from_raw_parts(rgba_ptr, bytes) };
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, bytes) };
    inspect_into(rgba, width, height, out)
}

/// `data` is `gaps[n_jobs]` followed by `service[n_jobs * n_stations]`.
/// `out` receives 8 u32 values: makespan lo/hi, lead sum lo/hi, max wait lo/hi, jobs, stations.
#[wasm_bindgen]
pub fn simulate(data_ptr: *const u32, n_jobs: u32, n_stations: u32, out_ptr: *mut u32) {
    let jobs = n_jobs as usize;
    let stations = n_stations as usize;
    let len = jobs + jobs * stations;
    if jobs == 0 || stations == 0 || data_ptr.is_null() || out_ptr.is_null() {
        return;
    }
    let data = unsafe { std::slice::from_raw_parts(data_ptr, len) };
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, 8) };
    simulate_into(data, n_jobs, n_stations, out);
}

/// Sorts `data` in place with the same quicksort as JavaScript.
/// `out` receives p50, p95, sum lo/hi, count >= 2^31, first, last, n.
#[wasm_bindgen]
pub fn aggregate(data_ptr: *mut u32, n: u32, out_ptr: *mut u32) {
    if n == 0 || data_ptr.is_null() || out_ptr.is_null() {
        return;
    }
    let data = unsafe { std::slice::from_raw_parts_mut(data_ptr, n as usize) };
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, 8) };
    quicksort(data);
    sensor_stats(data, out);
}

fn inspect_into(rgba: &[u8], width: u32, height: u32, out: &mut [u8]) -> u32 {
    let w = width as usize;
    let h = height as usize;
    let n = w * h;
    let mut gray = vec![0u8; n];
    for i in 0..n {
        let o = i * 4;
        let r = rgba[o] as u32;
        let g = rgba[o + 1] as u32;
        let b = rgba[o + 2] as u32;
        gray[i] = ((77 * r + 150 * g + 29 * b) >> 8) as u8;
    }

    let mut blur = vec![0u8; n];
    for y in 0..h {
        for x in 0..w {
            let mut sum = 0u32;
            let mut count = 0u32;
            for dy in -1i32..=1 {
                let ny = y as i32 + dy;
                if ny < 0 || ny >= h as i32 {
                    continue;
                }
                for dx in -1i32..=1 {
                    let nx = x as i32 + dx;
                    if nx < 0 || nx >= w as i32 {
                        continue;
                    }
                    sum += gray[(ny as usize) * w + (nx as usize)] as u32;
                    count += 1;
                }
            }
            blur[y * w + x] = (sum / count) as u8;
        }
    }

    let mut hist = [0u32; 256];
    for &v in &blur {
        hist[v as usize] += 1;
    }
    let threshold = otsu(&hist, n as u32);

    let mut parent = vec![0u32; n + 1];
    let mut labels = vec![0u32; n];
    let mut next = 1u32;
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            // Class split is 0..=t versus t+1..=255. Ties keep the first t.
            if blur[i] <= threshold {
                continue;
            }
            let left = if x > 0 { labels[i - 1] } else { 0 };
            let up = if y > 0 { labels[i - w] } else { 0 };
            if left == 0 && up == 0 {
                parent[next as usize] = next;
                labels[i] = next;
                next += 1;
            } else if up == 0 {
                labels[i] = left;
            } else if left == 0 {
                labels[i] = up;
            } else {
                labels[i] = if left < up { left } else { up };
                union(&mut parent, left, up);
            }
        }
    }

    let mut area = vec![0u32; next as usize];
    for i in 0..n {
        if labels[i] != 0 {
            let root = find(&mut parent, labels[i]);
            labels[i] = root;
            area[root as usize] += 1;
        }
    }
    let mut components = 0u32;
    for id in 1..next {
        if parent[id as usize] == id && area[id as usize] >= MIN_AREA {
            components += 1;
        }
    }

    for i in 0..n {
        let v = if blur[i] > threshold { 255 } else { 0 };
        let o = i * 4;
        out[o] = v;
        out[o + 1] = v;
        out[o + 2] = v;
        out[o + 3] = 255;
    }
    components
}

fn otsu(hist: &[u32; 256], total: u32) -> u8 {
    let total = total as u64;
    let mut sum_all = 0u64;
    for t in 0..256 {
        sum_all += t as u64 * hist[t] as u64;
    }
    let mut w_b = 0u64;
    let mut sum_b = 0u64;
    let mut best_t = 0u32;
    let mut best_num = 0u128;
    let mut best_den = 1u128;
    for t in 0..256 {
        w_b += hist[t] as u64;
        if w_b == 0 {
            continue;
        }
        let w_f = total - w_b;
        if w_f == 0 {
            break;
        }
        sum_b += t as u64 * hist[t] as u64;
        let diff = (sum_b as i128) * (total as i128) - (sum_all as i128) * (w_b as i128);
        let mag = diff.unsigned_abs();
        let num = mag * mag;
        let den = (w_b as u128) * (w_f as u128);
        if num * best_den > best_num * den {
            best_num = num;
            best_den = den;
            best_t = t as u32;
        }
    }
    best_t as u8
}

fn find(parent: &mut [u32], mut x: u32) -> u32 {
    while parent[x as usize] != x {
        parent[x as usize] = parent[parent[x as usize] as usize];
        x = parent[x as usize];
    }
    x
}

fn union(parent: &mut [u32], a: u32, b: u32) {
    let mut ra = find(parent, a);
    let mut rb = find(parent, b);
    if ra == rb {
        return;
    }
    if ra > rb {
        std::mem::swap(&mut ra, &mut rb);
    }
    parent[rb as usize] = ra;
}

fn simulate_into(data: &[u32], n_jobs: u32, n_stations: u32, out: &mut [u32]) {
    let jobs = n_jobs as usize;
    let stations = n_stations as usize;
    let gaps = &data[..jobs];
    let service = &data[jobs..];
    let mut free = vec![0u64; stations];
    let mut ready = 0u64;
    let mut sum_lead = 0u64;
    let mut makespan = 0u64;
    let mut max_wait = 0u64;
    for job in 0..jobs {
        let arrival = ready;
        ready += 1 + (gaps[job] % 8) as u64;
        let mut t = arrival;
        for s in 0..stations {
            let start = if t > free[s] { t } else { free[s] };
            let wait = start - t;
            if wait > max_wait {
                max_wait = wait;
            }
            let svc = 1 + (service[job * stations + s] % 32) as u64;
            t = start + svc;
            free[s] = t;
        }
        sum_lead += t - arrival;
        makespan = t;
    }
    write_u64(out, 0, makespan);
    write_u64(out, 2, sum_lead);
    write_u64(out, 4, max_wait);
    out[6] = n_jobs;
    out[7] = n_stations;
}

fn write_u64(out: &mut [u32], at: usize, value: u64) {
    out[at] = value as u32;
    out[at + 1] = (value >> 32) as u32;
}

fn quicksort(a: &mut [u32]) {
    if a.is_empty() {
        return;
    }
    let mut stack: Vec<(u32, u32)> = Vec::new();
    stack.push((0, (a.len() - 1) as u32));
    while let Some((lo, hi)) = stack.pop() {
        if lo >= hi {
            continue;
        }
        let pivot = a[((lo + hi) >> 1) as usize];
        let mut i = lo as i32;
        let mut j = hi as i32;
        while i <= j {
            while a[i as usize] < pivot {
                i += 1;
            }
            while a[j as usize] > pivot {
                j -= 1;
            }
            if i <= j {
                a.swap(i as usize, j as usize);
                i += 1;
                j -= 1;
            }
        }
        if (lo as i32) < j {
            stack.push((lo, j as u32));
        }
        if i < hi as i32 {
            stack.push((i as u32, hi));
        }
    }
}

fn sensor_stats(a: &[u32], out: &mut [u32]) {
    let n = a.len() as u32;
    let p50 = a[(n as usize) / 2];
    let p95 = a[((95 * (n - 1)) / 100) as usize];
    let mut sum = 0u64;
    let mut count_ge = 0u32;
    for &v in a {
        sum += v as u64;
        if v >= 0x8000_0000 {
            count_ge += 1;
        }
    }
    out[0] = p50;
    out[1] = p95;
    out[2] = sum as u32;
    out[3] = (sum >> 32) as u32;
    out[4] = count_ge;
    out[5] = a[0];
    out[6] = a[a.len() - 1];
    out[7] = n;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quicksort_matches_a_known_order() {
        let mut values = [5, 1, 5, 0, 9, 2, 2, 8];
        quicksort(&mut values);
        assert_eq!(values, [0, 1, 2, 2, 5, 5, 8, 9]);
    }

    #[test]
    fn quicksort_handles_ties_and_reversed_input() {
        let mut same = [7u32; 64];
        quicksort(&mut same);
        assert!(same.iter().all(|v| *v == 7));
        let mut reversed: Vec<u32> = (0..512).rev().collect();
        quicksort(&mut reversed);
        assert!(reversed.windows(2).all(|w| w[0] <= w[1]));
    }

    #[test]
    fn otsu_splits_two_peaks() {
        let mut hist = [0u32; 256];
        hist[10] = 50;
        hist[200] = 50;
        let t = otsu(&hist, 100);
        assert!(t >= 10 && t < 200, "threshold {t}");
    }

    #[test]
    fn inspect_counts_a_solid_block() {
        let w = 16u32;
        let h = 16u32;
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for y in 2..14 {
            for x in 2..14 {
                let o = ((y * w + x) * 4) as usize;
                rgba[o] = 240;
                rgba[o + 1] = 240;
                rgba[o + 2] = 240;
                rgba[o + 3] = 255;
            }
        }
        let mut out = vec![0u8; rgba.len()];
        let count = inspect_into(&rgba, w, h, &mut out);
        assert_eq!(count, 1);
    }
}
