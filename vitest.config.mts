import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "istanbul",
      // json-summary feeds the GitHub job summary (scripts/coverage-summary.mjs).
      reporter: ["text-summary", "json-summary", "html"],
      // Report on every source file, including ones no test imports yet.
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
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
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Restore anything set with vi.stubEnv() / vi.stubGlobal() after each test.
    unstubEnvs: true,
    unstubGlobals: true,
    include: ["tests/**/*.{test,spec}.{js,ts}", "src/**/*.{test,spec}.{js,ts}"],
    exclude: ["node_modules/", "build/", "data/"],
  },
});
