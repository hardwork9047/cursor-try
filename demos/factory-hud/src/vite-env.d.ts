/// <reference types="vite/client" />

interface Navigator {
  gpu?: {
    requestAdapter(options?: {
      powerPreference?: "high-performance" | "low-power";
    }): Promise<unknown>;
    getPreferredCanvasFormat(): string;
  };
}

interface HTMLCanvasElement {
  content?: string;
  layoutSubtree?: boolean;
  requestPaint?: () => void;
  updateElementGeometry?: (
    element: Element,
    geometry: {
      canvasTransform?: DOMMatrix;
      preserveHitTestOrder?: boolean;
    },
  ) => void;
  clearElementGeometry?: (element: Element) => void;
  getElementTransform?: (element: Element, matrix: DOMMatrix) => DOMMatrix | null;
}

interface GPUQueue {
  writeBuffer(buffer: GpuBuffer, bufferOffset: number, data: ArrayBufferView): void;
  submit(commandBuffers: object[]): void;
  onSubmittedWorkDone?: () => Promise<void>;
  drawElementImageToTexture?: (
    source: {
      source: Element;
      sourceX?: number;
      sourceY?: number;
      sourceWidth?: number;
      sourceHeight?: number;
    },
    destination: {
      texture: GpuTexture;
      size?: { width: number; height: number };
      colorSpace?: PredefinedColorSpace;
      premultipliedAlpha?: boolean;
    },
  ) => void;
  copyElementImageToTexture?: (
    source: Element | { source: Element },
    destination: { texture: GpuTexture; size?: { width: number; height: number } },
  ) => void;
}

declare const GPUBufferUsage: {
  UNIFORM: number;
  COPY_DST: number;
};

declare const GPUTextureUsage: {
  TEXTURE_BINDING: number;
  COPY_DST: number;
  RENDER_ATTACHMENT: number;
};

interface GpuTexture {
  width: number;
  height: number;
  createView(): object;
  destroy(): void;
}

interface GpuBuffer {
  destroy(): void;
}

interface GpuShaderModule {
  getCompilationInfo(): Promise<{
    messages: { type: string; message: string; lineNum: number; linePos: number }[];
  }>;
}

interface GpuRenderPipeline {
  getBindGroupLayout(index: number): object;
}

interface GpuDevice {
  queue: GPUQueue;
  limits?: { maxTextureDimension2D?: number };
  createShaderModule(descriptor: { code: string }): GpuShaderModule;
  createRenderPipeline(descriptor: {
    layout: "auto";
    vertex: { module: GpuShaderModule; entryPoint: string };
    fragment: {
      module: GpuShaderModule;
      entryPoint: string;
      targets: { format: string }[];
    };
    primitive: { topology: "triangle-list" };
  }): GpuRenderPipeline;
  createBuffer(descriptor: { size: number; usage: number }): GpuBuffer;
  createTexture(descriptor: {
    size: { width: number; height: number };
    format: string;
    usage: number;
  }): GpuTexture;
  createSampler(descriptor: {
    magFilter: "linear";
    minFilter: "linear";
    addressModeU: "clamp-to-edge";
    addressModeV: "clamp-to-edge";
  }): object;
  createBindGroup(descriptor: {
    layout: object;
    entries: { binding: number; resource: object }[];
  }): object;
  createCommandEncoder(): {
    beginRenderPass(descriptor: {
      colorAttachments: {
        view: object;
        loadOp: "clear";
        storeOp: "store";
        clearValue: { r: number; g: number; b: number; a: number };
      }[];
    }): {
      setPipeline(pipeline: GpuRenderPipeline): void;
      setBindGroup(index: number, group: object): void;
      draw(count: number): void;
      end(): void;
    };
    finish(): object;
  };
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<{ message: string } | null>;
  destroy(): void;
}

interface GpuCanvasContext {
  configure(configuration: { device: GpuDevice; format: string; alphaMode: "opaque" }): void;
  getCurrentTexture(): GpuTexture;
}
