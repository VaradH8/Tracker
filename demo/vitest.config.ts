import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // .tsx tests render components (jsdom, chosen per file with a
    // `@vitest-environment jsdom` comment) — e.g. the axe accessibility check.
    include: ["__tests__/**/*.test.{ts,tsx}"],
  },
  // tsconfig keeps `jsx: preserve` for Next.js; tests compile JSX themselves.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
