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
    clearMocks: true,
    restoreMocks: true,
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.{test,spec}.ts"],
        },
      },
      {
        test: {
          name: "component",
          environment: "jsdom",
          include: ["tests/unit/**/*.{test,spec}.tsx"],
          setupFiles: ["./tests/setup/component.ts"],
        },
      },
    ],
  },
});
