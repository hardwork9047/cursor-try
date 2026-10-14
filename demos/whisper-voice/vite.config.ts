import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dir = dirname(fileURLToPath(import.meta.url));
const slug = basename(dir);

const headers = {
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
  base: `/cursor-try/${slug}/`,
  plugins: [react()],
  server: { port: 5177, headers },
  preview: { port: 4177, headers },
  optimizeDeps: {
    exclude: ["@huggingface/transformers", "onnxruntime-web"],
  },
  worker: {
    format: "es",
  },
});
