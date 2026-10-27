export const SHADER = `
struct Uniforms {
  resolution: vec2<f32>,
  time: f32,
  warp: f32,
  pointer: vec2<f32>,
  has_hud: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var hud_tex: texture_2d<f32>;
@group(0) @binding(2) var hud_samp: sampler;

fn hash21(p: vec2<f32>) -> f32 {
  let q = fract(p * vec2<f32>(123.34, 345.45));
  let r = q.x * q.y + dot(q, q + 34.23);
  return fract(r * (q.x + q.y));
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p_in: vec2<f32>) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p_in;
  for (var i: i32 = 0; i < 4; i = i + 1) {
    v = v + a * noise(q);
    q = q * 2.03 + vec2<f32>(1.7, 9.2);
    a = a * 0.5;
  }
  return v;
}

fn fluid(uv: vec2<f32>) -> vec3<f32> {
  let aspect = max(uniforms.resolution.x / max(uniforms.resolution.y, 1.0), 0.1);
  var p = vec2<f32>(uv.x * aspect, uv.y);
  p = p + (uniforms.pointer - vec2<f32>(0.5, 0.5)) * 0.18;
  let drift = uniforms.time * 0.07;
  let q = vec2<f32>(
    fbm(p + vec2<f32>(drift, 0.0)),
    fbm(p + vec2<f32>(4.2, 1.7) - drift)
  );
  let r = vec2<f32>(
    fbm(p + q * 1.7 + vec2<f32>(1.7, 9.2) + drift),
    fbm(p + q * 1.7 + vec2<f32>(8.3, 2.8) - drift * 0.65)
  );
  let f = fbm(p + r * 1.9);
  let deep = vec3<f32>(0.012, 0.028, 0.026);
  let ink = vec3<f32>(0.02, 0.16, 0.13);
  let mint = vec3<f32>(0.52, 0.96, 0.84);
  let foam = vec3<f32>(0.92, 1.0, 0.98);
  var col = mix(deep, ink, smoothstep(0.1, 0.46, f));
  col = mix(col, mint, smoothstep(0.4, 0.8, f));
  col = mix(col, foam, smoothstep(0.76, 0.96, f) * 0.8);
  let centered = (uv - vec2<f32>(0.5, 0.5)) * vec2<f32>(1.15, 1.0);
  let vig = smoothstep(1.2, 0.2, length(centered));
  col = col * vig;
  let gx = fract(uv.x * 26.0);
  let gy = fract(uv.y * 15.0);
  let line_x = 1.0 - smoothstep(0.0, 0.04, min(gx, 1.0 - gx));
  let line_y = 1.0 - smoothstep(0.0, 0.04, min(gy, 1.0 - gy));
  col = col + vec3<f32>(0.35, 0.85, 0.72) * max(line_x, line_y) * 0.045;
  return col;
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let x = f32((i << 1u) & 2u);
  let y = f32(i & 2u);
  return vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let res = max(uniforms.resolution, vec2<f32>(1.0, 1.0));
  let uv = pos.xy / res;
  var col = fluid(uv);
  let scan = 0.9 + 0.1 * sin(pos.y * 1.35);
  col = col * scan;

  var huv = uv - vec2<f32>(0.5, 0.5);
  let dist = length(huv);
  let zoom = 1.0 + uniforms.warp * (0.16 + dist * 0.55);
  huv = huv * zoom + vec2<f32>(0.5, 0.5);
  let shift = (0.7 + uniforms.warp * 8.0) / res.x;
  let sample_r = textureSample(hud_tex, hud_samp, huv + vec2<f32>(shift, 0.0));
  let sample_g = textureSample(hud_tex, hud_samp, huv);
  let sample_b = textureSample(hud_tex, hud_samp, huv - vec2<f32>(shift, 0.0));
  var hud_rgb = vec3<f32>(sample_r.r, sample_g.g, sample_b.b);
  let alpha = clamp((sample_r.a + sample_g.a + sample_b.a) / 3.0, 0.0, 1.0);
  let bloom_px = (2.2 + uniforms.warp * 7.0) / res;
  let bloom = (
    textureSample(hud_tex, hud_samp, huv + vec2<f32>(bloom_px.x, 0.0)).rgb +
    textureSample(hud_tex, hud_samp, huv - vec2<f32>(bloom_px.x, 0.0)).rgb +
    textureSample(hud_tex, hud_samp, huv + vec2<f32>(0.0, bloom_px.y)).rgb +
    textureSample(hud_tex, hud_samp, huv - vec2<f32>(0.0, bloom_px.y)).rgb
  ) * 0.07;
  hud_rgb = hud_rgb + bloom * alpha;
  hud_rgb = hud_rgb * (0.97 + 0.03 * sin(pos.y * 1.2));
  let show = clamp(uniforms.has_hud, 0.0, 1.0);
  let out_rgb = mix(col, hud_rgb, alpha * show);
  return vec4<f32>(out_rgb, 1.0);
}
`;
