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

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options?: {
      powerPreference?: "high-performance" | "low-power";
    }) => Promise<AdapterLike | null>;
  };
};

function describe(info: AdapterInfo | undefined): GpuInfo {
  if (!info) return { name: "WebGPU アダプタ", detail: "名称は取得できませんでした" };
  const name = info.description || [info.vendor, info.device].filter(Boolean).join(" ") || "WebGPU アダプタ";
  const detail = [info.vendor, info.architecture, info.device, info.description]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(" · ");
  return { name, detail: detail || name };
}

export async function detectGpu(): Promise<GpuInfo> {
  const gpu = (navigator as GpuNavigator).gpu;
  if (!gpu) return { name: "", detail: "navigator.gpu がありません" };
  try {
    const adapter =
      (await gpu.requestAdapter({ powerPreference: "high-performance" })) ?? (await gpu.requestAdapter());
    if (!adapter) return { name: "", detail: "GPU アダプタを取得できませんでした" };
    let info = adapter.info;
    if (!info && adapter.requestAdapterInfo) {
      try {
        info = await adapter.requestAdapterInfo();
      } catch {
        info = undefined;
      }
    }
    return describe(info);
  } catch (error) {
    return {
      name: "",
      detail: error instanceof Error ? error.message : "WebGPU の確認に失敗しました",
    };
  }
}
