import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const headers = {
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
  base: "/cursor-try/",
  plugins: [react()],
  server: { headers },
  preview: { headers },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
});
