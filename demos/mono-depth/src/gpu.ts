import type { GpuInfo } from "./types";

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

export async function detectGpu(): Promise<GpuInfo | null> {
  const gpu = navigator.gpu;
  if (!gpu) return null;
  try {
    const adapter = (await gpu.requestAdapter({ powerPreference: "high-performance" })) as AdapterLike | null;
    if (!adapter) return null;
    let info = adapter.info;
    if (!info && adapter.requestAdapterInfo) {
      try {
        info = await adapter.requestAdapterInfo();
      } catch {
        info = undefined;
      }
    }
    if (!info) return { name: "WebGPU アダプタ", detail: "名称は取得できませんでした" };
    const name = info.description || [info.vendor, info.device].filter(Boolean).join(" ") || "WebGPU アダプタ";
    const detail = [info.vendor, info.architecture, info.device, info.description]
      .filter((part): part is string => Boolean(part))
      .filter((part, index, all) => all.indexOf(part) === index)
      .join(" · ");
    return { name, detail: detail || name };
  } catch {
    return null;
  }
}
