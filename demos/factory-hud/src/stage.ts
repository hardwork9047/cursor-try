import type { RenderMetrics } from "./model";
import { SHADER } from "./shader";

export type Motion = {
  warp: number;
  px: number;
  py: number;
};

type StageOptions = {
  canvas: HTMLCanvasElement;
  hud: HTMLElement;
  motion: Motion;
  onMetrics: (metrics: RenderMetrics) => void;
};

type HicMode = "modern" | "legacy" | "none";

type AdapterInfo = { description?: string; vendor?: string; device?: string };

type AdapterLike = {
  info?: AdapterInfo;
  requestAdapterInfo?: () => Promise<AdapterInfo>;
  requestDevice: () => Promise<GpuDevice>;
  limits?: { maxTextureDimension2D?: number };
};

const MAX_PIXELS = 1920 * 1080;

function shaderError(module: GpuShaderModule) {
  return module.getCompilationInfo().then((info) => {
    const errors = info.messages.filter((message) => message.type === "error");
    if (errors.length === 0) return "";
    return errors
      .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`)
      .join("\n");
  });
}

function detectHic(): HicMode {
  const probe = document.createElement("canvas");
  probe.setAttribute("content", "drawable");
  if (probe.content === "drawable") return "modern";
  if ("layoutSubtree" in probe) {
    probe.setAttribute("layoutsubtree", "");
    if (probe.layoutSubtree === true) return "legacy";
  }
  return "none";
}

function labelFrom(info: AdapterInfo | undefined) {
  if (!info) return "";
  const description = info.description?.trim();
  if (description) return description;
  const bits = [info.vendor, info.device].map((part) => part?.trim()).filter(Boolean);
  return bits.join(" ");
}

export function startStage(options: StageOptions) {
  const { canvas, hud, motion, onMetrics } = options;
  const home = hud.parentElement;
  let stopped = false;
  let settled = false;
  let raf = 0;
  let failTimer = 0;
  let device: GpuDevice | null = null;
  let context: GpuCanvasContext | null = null;
  let pipeline: GpuRenderPipeline | null = null;
  let uniform: GpuBuffer | null = null;
  let sampler: object | null = null;
  let hudTexture: GpuTexture | null = null;
  let bindGroup: object | null = null;
  let inCanvas = false;
  let wantHic = false;
  let hudReady = false;
  let missed = 0;
  let hicError = "";
  let geometryPending = false;
  let checked = false;
  let frames = 0;
  let fpsEma: number | null = null;
  let msEma: number | null = null;
  let prev = performance.now();
  let lastEmit = 0;
  const started = performance.now();
  const metrics: RenderMetrics = {
    fps: null,
    frameMs: null,
    backend: "pending",
    adapter: "—",
  };

  function emit(force = false) {
    const now = performance.now();
    if (!force && now - lastEmit < 250) return;
    lastEmit = now;
    onMetrics({ ...metrics });
  }

  function restoreHud() {
    if (inCanvas && home) home.appendChild(hud);
    inCanvas = false;
    wantHic = false;
    hudReady = false;
    hud.classList.remove("in-canvas");
    hud.style.width = "";
    hud.style.height = "";
    hud.removeAttribute("drawable");
    canvas.removeAttribute("content");
    canvas.removeAttribute("layoutsubtree");
    if (typeof canvas.clearElementGeometry === "function") {
      canvas.clearElementGeometry(hud);
    }
  }

  function settle(backend: RenderMetrics["backend"]) {
    settled = true;
    window.clearTimeout(failTimer);
    metrics.backend = backend;
    emit(true);
  }

  function destroyGpu() {
    hudTexture?.destroy();
    hudTexture = null;
    uniform?.destroy();
    uniform = null;
    device?.destroy();
    device = null;
    pipeline = null;
    context = null;
    bindGroup = null;
    sampler = null;
  }

  const onPaint = () => {
    if (!wantHic || !device || !hudTexture || hudTexture.width < 16) return;
    const queue = device.queue;
    try {
      const size = { width: hudTexture.width, height: hudTexture.height };
      if (queue.drawElementImageToTexture) {
        queue.drawElementImageToTexture(
          { source: hud },
          { texture: hudTexture, size, colorSpace: "srgb", premultipliedAlpha: false },
        );
      } else if (queue.copyElementImageToTexture) {
        try {
          queue.copyElementImageToTexture({ source: hud }, { texture: hudTexture, size });
        } catch {
          queue.copyElementImageToTexture(hud, { texture: hudTexture });
        }
      } else {
        throw new Error("テクスチャへ描くメソッドがありません");
      }
      if (geometryPending) {
        syncGeometry();
        geometryPending = false;
      }
      hudReady = true;
      missed = 0;
    } catch (error) {
      hicError = error instanceof Error ? error.message : "HTML-in-Canvas の転送に失敗しました";
    }
  };

  function syncGeometry() {
    if (typeof canvas.updateElementGeometry === "function") {
      canvas.updateElementGeometry(hud, { canvasTransform: new DOMMatrix() });
      return;
    }
    if (typeof canvas.getElementTransform === "function") {
      const transform = canvas.getElementTransform(hud, new DOMMatrix());
      if (transform) hud.style.transform = transform.toString();
    }
  }

  function rebuildBindGroup() {
    if (!device || !pipeline || !uniform || !sampler || !hudTexture) return;
    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: hudTexture.createView() },
        { binding: 2, resource: sampler },
      ],
    });
  }

  function swapTexture(next: GpuTexture) {
    const prevTexture = hudTexture;
    hudTexture = next;
    rebuildBindGroup();
    if (prevTexture && device) {
      const retire = () => prevTexture.destroy();
      const done = device.queue.onSubmittedWorkDone?.();
      if (done) done.then(retire).catch(retire);
      else retire();
    }
  }

  function ensureTexture(width: number, height: number) {
    if (!device) return;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (hudTexture && hudTexture.width === w && hudTexture.height === h) return;
    swapTexture(
      device.createTexture({
        size: { width: w, height: h },
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      }),
    );
  }

  function applyCanvasSize(cssW: number, cssH: number, pxW: number, pxH: number) {
    let width = Math.max(2, Math.round(pxW));
    let height = Math.max(2, Math.round(pxH));
    const limit = device?.limits?.maxTextureDimension2D ?? 8192;
    width = Math.min(width, limit);
    height = Math.min(height, limit);
    const area = width * height;
    if (area > MAX_PIXELS) {
      const scale = Math.sqrt(MAX_PIXELS / area);
      width = Math.max(2, Math.round(width * scale));
      height = Math.max(2, Math.round(height * scale));
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (inCanvas) {
      hud.style.width = `${Math.max(1, Math.round(cssW))}px`;
      hud.style.height = `${Math.max(1, Math.round(cssH))}px`;
      geometryPending = true;
    }
    ensureTexture(width, height);
  }

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const cssW = entry.contentRect.width;
    const cssH = entry.contentRect.height;
    if (cssW < 2 || cssH < 2) return;
    const box = entry.devicePixelContentBoxSize?.[0];
    const pxW = box ? box.inlineSize : cssW * window.devicePixelRatio;
    const pxH = box ? box.blockSize : cssH * window.devicePixelRatio;
    applyCanvasSize(cssW, cssH, pxW, pxH);
  });

  const boxSupported =
    typeof ResizeObserverEntry !== "undefined" &&
    "devicePixelContentBoxSize" in ResizeObserverEntry.prototype;
  try {
    observer.observe(canvas, boxSupported ? { box: "device-pixel-content-box" } : undefined);
  } catch {
    observer.observe(canvas);
  }

  function enterHic(mode: HicMode) {
    if (mode === "modern") canvas.setAttribute("content", "drawable");
    else canvas.setAttribute("layoutsubtree", "");
    if (mode === "modern") hud.setAttribute("drawable", "");
    canvas.appendChild(hud);
    hud.classList.add("in-canvas");
    inCanvas = true;
    wantHic = true;
    geometryPending = true;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW > 2 && cssH > 2) {
      hud.style.width = `${cssW}px`;
      hud.style.height = `${cssH}px`;
    }
    syncGeometry();
    canvas.addEventListener("paint", onPaint);
    canvas.requestPaint?.();
  }

  function leaveHic(reason: string) {
    if (!wantHic && !inCanvas) return;
    console.warn("HTML-in-Canvas をやめます", reason);
    canvas.removeEventListener("paint", onPaint);
    restoreHud();
    if (device) settle("webgpu");
    else settle("dom");
  }

  function draw(now: number) {
    if (!device || !context || !pipeline || !uniform || !bindGroup) return;
    const width = canvas.width;
    const height = canvas.height;
    if (width < 2 || height < 2) return;
    const time = (now - started) / 1000;
    const data = new Float32Array([
      width,
      height,
      time,
      motion.warp,
      motion.px,
      motion.py,
      hudReady ? 1 : 0,
      0,
    ]);
    device.queue.writeBuffer(uniform, 0, data);
    if (!checked) device.pushErrorScope("validation");
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0.01, g: 0.025, b: 0.022, a: 1 },
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    if (!checked) {
      checked = true;
      device.popErrorScope().then((error) => {
        if (!error || stopped || !device) return;
        console.warn(error.message);
        restoreHud();
        destroyGpu();
        settle("dom");
      });
    }
  }

  function frame(now: number) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const dt = now - prev;
    prev = now;
    if (dt > 0 && dt < 800) {
      frames += 1;
      const fps = 1000 / dt;
      fpsEma = fpsEma === null ? fps : fpsEma * 0.9 + fps * 0.1;
      msEma = msEma === null ? dt : msEma * 0.9 + dt * 0.1;
      if (frames >= 8 && fpsEma !== null && msEma !== null) {
        metrics.fps = fpsEma;
        metrics.frameMs = msEma;
      }
    }
    if (motion.warp > 0) {
      motion.warp *= Math.exp(-dt / 280);
      if (motion.warp < 0.004) motion.warp = 0;
    }
    if (hicError) {
      const reason = hicError;
      hicError = "";
      leaveHic(reason);
    } else if (wantHic && !hudReady) {
      missed += 1;
      canvas.requestPaint?.();
      if (missed > 90) leaveHic("paint が来ないため DOM に戻します");
    } else if (wantHic) {
      canvas.requestPaint?.();
    }
    try {
      draw(now);
    } catch (error) {
      console.warn(error);
      restoreHud();
      destroyGpu();
      settle("dom");
    }
    emit(false);
  }

  const onPointer = (event: PointerEvent) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    motion.px = event.clientX / width;
    motion.py = event.clientY / height;
  };
  window.addEventListener("pointermove", onPointer);

  async function boot() {
    const gpu = navigator.gpu;
    if (!gpu) {
      settle("dom");
      return;
    }
    let adapter: AdapterLike | null = null;
    try {
      adapter = (await gpu.requestAdapter({ powerPreference: "high-performance" })) as AdapterLike | null;
    } catch {
      adapter = null;
    }
    if (stopped || settled) return;
    if (!adapter) {
      settle("dom");
      return;
    }
    let adapterName = labelFrom(adapter.info);
    if (!adapterName && adapter.requestAdapterInfo) {
      try {
        adapterName = labelFrom(await adapter.requestAdapterInfo());
      } catch {
        adapterName = "";
      }
    }
    if (stopped || settled) return;
    metrics.adapter = adapterName || "—";

    let dev: GpuDevice;
    try {
      dev = await adapter.requestDevice();
    } catch {
      if (!stopped && !settled) settle("dom");
      return;
    }
    if (stopped || settled) {
      dev.destroy();
      return;
    }
    const view = canvas.getContext("webgpu") as GpuCanvasContext | null;
    if (!view) {
      dev.destroy();
      settle("dom");
      return;
    }
    const format = gpu.getPreferredCanvasFormat();
    try {
      view.configure({ device: dev, format, alphaMode: "opaque" });
    } catch {
      dev.destroy();
      settle("dom");
      return;
    }

    const module = dev.createShaderModule({ code: SHADER });
    const compiled = await shaderError(module);
    if (stopped || settled) {
      dev.destroy();
      return;
    }
    if (compiled) {
      console.warn(compiled);
      dev.destroy();
      settle("dom");
      return;
    }

    let pipe: GpuRenderPipeline;
    try {
      pipe = dev.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
    } catch (error) {
      console.warn(error);
      dev.destroy();
      settle("dom");
      return;
    }

    device = dev;
    context = view;
    pipeline = pipe;
    uniform = dev.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    sampler = dev.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    ensureTexture(canvas.width || 2, canvas.height || 2);

    const hic = detectHic();
    const queue = dev.queue;
    const canUpload = Boolean(queue.drawElementImageToTexture || queue.copyElementImageToTexture);
    const canGeometry = Boolean(canvas.updateElementGeometry || canvas.getElementTransform);
    const canRepaint = typeof canvas.requestPaint === "function";
    if (hic !== "none" && canUpload && canGeometry && canRepaint) {
      enterHic(hic);
      settle("hic");
    } else {
      settle("webgpu");
    }
  }

  raf = requestAnimationFrame(frame);
  failTimer = window.setTimeout(() => {
    if (!settled && !stopped) {
      restoreHud();
      destroyGpu();
      settle("dom");
    }
  }, 4000);
  void boot();
  emit(true);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(failTimer);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("paint", onPaint);
      restoreHud();
      destroyGpu();
    },
  };
}
