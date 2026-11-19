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
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Restore anything set with vi.stubEnv() / vi.stubGlobal() after each test.
    unstubEnvs: true,
    unstubGlobals: true,
    include: ["tests/**/*.{test,spec}.{js,ts}", "src/**/*.{test,spec}.{js,ts}"],
    exclude: ["node_modules/", "build/", "data/"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
