import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 3000,
    strictPort: true,
    watch: { ignored: ["**/e2e/.artifacts/**"] },
    proxy: {
      "/api": {
        target: loadEnv(mode, process.cwd(), "").VITE_API_PROXY_TARGET || "http://localhost:8080",
        // Preserve the browser Host for Spring's same-origin checks on writes.
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    clearMocks: true,
  },
}));
