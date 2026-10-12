import type { GpuStatus } from "./types";

type AdapterInfo = {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
};

type AdapterLike = {
  info?: AdapterInfo;
  requestAdapterInfo?: () => Promise<AdapterInfo>;
};

function describe(info: AdapterInfo | undefined): { name: string; detail: string } {
  if (!info) return { name: "WebGPU アダプタ", detail: "名称は取得できませんでした" };
  const name =
    info.description ||
    [info.vendor, info.device].filter(Boolean).join(" ") ||
    "WebGPU アダプタ";
  const detail = [info.vendor, info.architecture, info.device, info.description]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(" · ");
  return { name, detail: detail || name };
}

export async function detectGpu(): Promise<GpuStatus> {
  const gpu = navigator.gpu;
  if (!gpu) {
    return {
      webgpu: false,
      name: "",
      detail: "navigator.gpu がありません",
    };
  }
  try {
    const adapter = (await gpu.requestAdapter({
      powerPreference: "high-performance",
    })) as AdapterLike | null;
    if (!adapter) {
      return {
        webgpu: false,
        name: "",
        detail: "GPUアダプタを取得できませんでした",
      };
    }
    let info = adapter.info;
    if (!info && adapter.requestAdapterInfo) {
      try {
        info = await adapter.requestAdapterInfo();
      } catch {
        info = undefined;
      }
    }
    const described = describe(info);
    return { webgpu: true, ...described };
  } catch (error) {
    return {
      webgpu: false,
      name: "",
      detail: error instanceof Error ? error.message : "WebGPU の確認に失敗しました",
    };
  }
}
