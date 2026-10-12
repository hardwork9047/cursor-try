/** Far is blue, near is yellow. t is a relative value in 0..1. */
export function depthRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const r = Math.round(255 * Math.min(1, Math.max(0, 1.45 * x - 0.12)));
  const g = Math.round(255 * Math.min(1, Math.max(0, 1.15 * x)));
  const b = Math.round(255 * (1 - x) * 0.9);
  return [r, g, b];
}

export function colorize(relative: Float32Array, width: number, height: number): ImageData {
  const image = new ImageData(width, height);
  const out = image.data;
  for (let i = 0; i < relative.length; i += 1) {
    const [r, g, b] = depthRgb(relative[i]);
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
  return image;
}
