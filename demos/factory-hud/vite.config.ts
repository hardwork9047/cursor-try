import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dir = dirname(fileURLToPath(import.meta.url));
const slug = basename(dir);

export default defineConfig({
  base: `/cursor-try/${slug}/`,
  plugins: [react()],
});
