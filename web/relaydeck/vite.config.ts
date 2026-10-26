import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The relay serves index.html at /management.html and everything else under
// /relaydeck/ from the copy embedded by internal/relaydeck.
const outDir = fileURLToPath(new URL("../../internal/relaydeck/dist", import.meta.url));

export default defineConfig({
  base: "/relaydeck/",
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    // `npm run dev` proxies the management API to a local relay.
    proxy: {
      "/v8/management": process.env.RELAYDECK_DEV_RELAY ?? "http://127.0.0.1:8317",
      "/v1": process.env.RELAYDECK_DEV_RELAY ?? "http://127.0.0.1:8317",
      "/management-advanced.html": process.env.RELAYDECK_DEV_RELAY ?? "http://127.0.0.1:8317",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
