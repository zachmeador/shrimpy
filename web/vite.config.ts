import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const apiPort = process.env.SHRIMPY_WEB_API_PORT ?? "5174";

export default defineConfig({
  root: "web",
  plugins: [svelte()],
  build: {
    outDir: "../dist/web/public",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});
