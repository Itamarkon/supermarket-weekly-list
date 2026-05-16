import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the tsconfig.json paths mapping so tests can use "@/app/..." imports.
      "@": path.resolve(__dirname),
    },
  },
});
