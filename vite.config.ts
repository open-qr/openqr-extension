import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // Vite's import.meta.env.DEV is false in every `vite build`, whatever the
  // mode, so dev-only behaviour needs its own compile-time flag.
  define: { __EXT_DEV__: JSON.stringify(mode === "development") },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve("src") },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        popup: path.resolve("popup.html"),
        codes: path.resolve("codes.html"),
        background: path.resolve("src/background.ts"),
      },
      output: {
        // The service worker filename is referenced by the static manifest.json,
        // so it must never hash. HTML entries never hash either; only JS/CSS do.
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/js/[name]-[hash].js",
        chunkFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash][extname]",
      },
    },
  },
}));
