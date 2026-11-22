import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (whose root is editor/) so tests run project-wide.
export default defineConfig({
  root: __dirname,
  test: { include: ["src/**/*.test.ts", "editor/**/*.test.ts"] },
});
