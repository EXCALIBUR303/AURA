import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fromRoot = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@aura/contracts": fromRoot("shared/contracts/index.ts"),
      "@aura/bridge": fromRoot("shared/bridge/index.ts"),
      "@aura/design-tokens": fromRoot("designs/design-system/tokens.css"),
    },
  },
  server: {
    // The native shell loads this exact URL in development (AURA_DEV_SERVER_URL).
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  build: {
    target: "safari18",
    outDir: "dist",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
