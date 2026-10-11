import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const dir = dirname(fileURLToPath(import.meta.url));

const headers = {
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const ORT_FILES = [
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
];

function copyOrtWasm(): Plugin {
  const copy = () => {
    const src = resolve(dir, "node_modules/onnxruntime-web/dist");
    const dest = resolve(dir, "public/ort");
    mkdirSync(dest, { recursive: true });
    for (const file of ORT_FILES) {
      cpSync(resolve(src, file), resolve(dest, file));
    }
  };
  return {
    name: "copy-ort-wasm",
    buildStart: copy,
    configureServer: copy,
  };
}

export default defineConfig({
  base: "/cursor-try/",
  plugins: [react(), copyOrtWasm()],
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm"],
  },
  server: { headers },
  preview: { headers },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm", "onnxruntime-web"],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(dir, "index.html"),
        llm: resolve(dir, "llm/index.html"),
        yolo: resolve(dir, "yolo/index.html"),
      },
    },
  },
});
