#!/usr/bin/env node
/**
 * CI assertions over dist/: the shipped extension must carry exactly the
 * committed permission set, never leak dev hosts/CSP, and load no remote
 * subresource of any kind. Fails loudly; run after `pnpm build`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const dist = resolveDist();
const errors = [];

function resolveDist() {
  const p = join(import.meta.dirname, "..", "dist");
  if (!existsSync(p)) fail(`dist/ does not exist; run pnpm build first.`);
  return p;
}
function fail(msg) {
  console.error(`assert-build: ${msg}`);
  process.exit(1);
}
function check(cond, msg) {
  if (!cond) errors.push(msg);
}

// --- manifest ------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
check(
  JSON.stringify(manifest.permissions ?? []) === JSON.stringify(["storage", "contextMenus", "activeTab"]),
  `permissions must be exactly [storage, contextMenus, activeTab], got ${JSON.stringify(manifest.permissions)}`,
);
check(
  JSON.stringify(manifest.host_permissions ?? []) === JSON.stringify(["https://openqr.uk/*"]),
  `host_permissions must be exactly [https://openqr.uk/*], got ${JSON.stringify(manifest.host_permissions)}`,
);
check(manifest.manifest_version === 3, "manifest_version must be 3");
check(
  manifest.background?.service_worker === "background.js" && manifest.background?.type === "module",
  "background must be background.js (module)",
);
check(!manifest.content_scripts, "no content scripts in v1");
check(
  !("content_security_policy" in manifest),
  "no custom CSP: the MV3 default is the tightest possible; a dev merge leak here is a store rejection",
);
for (const f of ["popup.html", "codes.html", "background.js", "icons/icon-16.png", "icons/icon-128.png"]) {
  check(existsSync(join(dist, f)), `missing ${f} in dist/`);
}

// --- no remote subresources ----------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(dist);
const HTTP_URL = /https?:\/\//g;
for (const f of files.filter((p) => [".css", ".html", ".svg", ".woff2"].includes(extname(p)))) {
  const text = readFileSync(f, "utf8");
  // url(...) in CSS, src=/href= attributes in HTML. Links to openqr.uk in
  // anchors are navigation, not subresources, and are allowed.
  const cssMatches = text.match(/url\([^)]*https?:\/\/[^)]*\)/g) ?? [];
  const htmlMatches =
    extname(f) === ".html" ? (text.match(/(?:src|href)="https?:\/\/(?!openqr\.uk)[^"]*"/g) ?? []) : [];
  check(cssMatches.length === 0, `${f} references remote assets: ${cssMatches.slice(0, 3).join(", ")}`);
  check(htmlMatches.length === 0, `${f} references non-openqr.uk remote urls: ${htmlMatches.slice(0, 3).join(", ")}`);
}

// --- background dependency graph -----------------------------------------
// The service worker must not drag in React/UI chunks. Walk the vite
// manifest's static import graph from the background entry.
const viteManifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8"));
const bgKey = Object.keys(viteManifest).find((k) => k.endsWith("src/background.ts"));
check(bgKey != null, "vite manifest has no background entry");
if (bgKey) {
  const seen = new Set();
  const queue = [viteManifest[bgKey].file];
  const chunkNames = [];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    chunkNames.push(file);
    const entry = Object.values(viteManifest).find((e) => e.file === file);
    for (const imp of entry?.imports ?? []) {
      queue.push(viteManifest[imp]?.file ?? `${imp}.js`);
    }
  }
  const offenders = chunkNames.filter((f) => /(^|\/)react(-dom)?[.-]/.test(f));
  check(offenders.length === 0, `background graph pulls UI chunks: ${offenders.join(", ")}`);
  console.log(`background graph: ${chunkNames.length} file(s), no UI deps`);
}

if (errors.length) {
  for (const e of errors) console.error(`assert-build: ${e}`);
  process.exit(1);
}
console.log(`assert-build: OK (${files.length} files in dist/)`);
