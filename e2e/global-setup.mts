import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export default async function globalSetup(): Promise<void> {
  const root = resolve(import.meta.dirname, "..");
  const manifestPath = resolve(root, "dist/manifest.json");
  let ok = false;
  try {
    ok = JSON.parse(readFileSync(manifestPath, "utf8")).host_permissions?.includes("http://127.0.0.1:8788/*");
  } catch {
    ok = false;
  }
  if (!ok) {
    console.log("building dev bundle for e2e…");
    execSync("node scripts/build.mjs --dev", { cwd: root, stdio: "inherit" });
  }
}
