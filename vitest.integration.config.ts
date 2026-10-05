import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const srcDirectory = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDirectory,
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.{test,spec}.ts"],
    setupFiles: ["./tests/setup/integration.ts"],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
  },
});
