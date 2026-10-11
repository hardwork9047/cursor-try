/// <reference types="vite/client" />

interface Navigator {
  gpu?: {
    requestAdapter: (options?: {
      powerPreference?: "high-performance" | "low-power";
    }) => Promise<unknown>;
  };
}
