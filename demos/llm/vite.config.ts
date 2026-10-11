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
  server: { port: 5173, headers },
  preview: { port: 4173, headers },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
});
