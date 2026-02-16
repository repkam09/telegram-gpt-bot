import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "build/",
        "data/",
        "**/*.config.{js,ts}",
        "**/*.d.ts",
        "**/prisma/**",
        "tests/**",
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{js,ts}"],
    exclude: ["node_modules/", "build/", "data/"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
