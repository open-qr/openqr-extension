#!/usr/bin/env node
/**
 * Build orchestrator: vite build + manifest emit.
 *   node scripts/build.mjs            production (manifest as committed)
 *   node scripts/build.mjs --dev      development manifest (+ localhost hosts)
 *   node scripts/build.mjs --dev --watch   dev watch; keeps the dev manifest alive
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const dev = args.has("--dev");
const watch = args.has("--watch");
const root = resolve(import.meta.dirname, "..");

const DEV_HOSTS = ["http://localhost:3011/*", "http://127.0.0.1:8788/*"];

function emitManifest() {
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  if (dev) {
    manifest.host_permissions = [...manifest.host_permissions, ...DEV_HOSTS];
  }
  mkdirSync(resolve(root, "dist"), { recursive: true });
  writeFileSync(resolve(root, "dist/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

if (!watch) {
  spawnSync(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build", "--mode", dev ? "development" : "production"],
    { stdio: "inherit", cwd: root },
  );
  if (process.exitCode != null && process.exitCode !== 0) process.exit(process.exitCode);
  emitManifest();
  console.log(`built dist/ (${dev ? "dev" : "production"} manifest)`);
} else {
  // Watch mode: vite empties dist on rebuild, so keep re-emitting the dev
  // manifest until the watcher exits.
  emitManifest();
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "build", "--mode", "development", "--watch"],
    { stdio: "inherit", cwd: root },
  );
  const timer = setInterval(emitManifest, 800);
  child.on("exit", (code) => {
    clearInterval(timer);
    emitManifest();
    process.exit(code ?? 0);
  });
}
