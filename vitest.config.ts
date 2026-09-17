import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __EXT_DEV__: "false" },
  resolve: {
    alias: { "@": path.resolve("src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
