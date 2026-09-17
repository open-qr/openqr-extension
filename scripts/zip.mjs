#!/usr/bin/env node
/** Zip dist/ into releases/openqr-extension-v<version>.zip (store-quality, no system zip needed). */
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const outDir = join(root, "releases");
mkdirSync(outDir, { recursive: true });

function walk(dir, base = "") {
  const out = {};
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(p).isDirectory()) Object.assign(out, walk(p, rel));
    else out[rel] = readFileSync(p);
  }
  return out;
}

const zip = zipSync(walk(dist), { level: 9 });
const out = join(outDir, `openqr-extension-v${manifest.version}.zip`);
writeFileSync(out, zip);
console.log(`${out} (${(zip.length / 1024).toFixed(1)} KB)`);
