#!/usr/bin/env node
/**
 * Capture golden payloads from the REAL API implementation and diff them
 * against the extension's local payload builders. Run against a local worker
 * (see README): seeds nothing, creates then deletes one code per type under
 * a test account. Exits non-zero on any mismatch, and writes
 * fixtures/golden-payloads.json for the unit suite.
 *
 *   BASE=http://localhost:3011 KEY=oqr_… node scripts/capture-goldens.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BASE = process.env.BASE ?? "http://localhost:3011";
const KEY = process.env.KEY;
if (!KEY) {
  console.error("capture-goldens: set KEY=<oqr_ api key> (local worker, seeded test account)");
  process.exit(1);
}

// Bundle the builders with esbuild so this runs without a TS loader.
const { execSync } = require("node:child_process");
const tmp = resolve(root, ".tmp-payloads.mjs");
execSync(`npx esbuild ${resolve(root, "src/lib/payloads.ts")} --bundle --format=esm --platform=neutral`, { stdio: ["ignore", "pipe", "inherit"], cwd: root });
writeFileSync(tmp, execSync(`npx esbuild ${resolve(root, "src/lib/payloads.ts")} --bundle --format=esm --platform=neutral`, { encoding: "utf8", cwd: root, stdio: ["ignore", "pipe", "ignore"] }));
const { buildPayload } = await import(tmp);

// One case per type: fields chosen to exercise the escape rules.
const CASES = [
  ["url", { url: "example.com/launch?utm=ext#top" }],
  ["text", { text: "Table for two, 19:30" }],
  ["email", { email: "hi@example.com", subject: "Two seats", body: "Please + confirm" }],
  ["phone", { phone: "+44 7700 900123" }],
  ["sms", { phone: "+44 7700 900123", message: "Your table is ready" }],
  ["whatsapp", { phone: "+44 7700 900123", message: "Menu for tonight" }],
  ["wifi", { ssid: 'Cafe;Guest "Premium"', password: "pa\\ss;wo:rd,1", encryption: "WPA" }],
  ["wifi", { ssid: "OpenNet", encryption: "nopass" }],
  ["geo", { lat: "51.5074", lng: "-0.1278" }],
  ["vcard", { firstName: "Jo", lastName: "Smith; Jr", phone: "+447700900123", email: "jo@example.com", org: "Smith, Sons & Co", title: "Founder", url: "example.com", address: "1 Main Street\nLondon" }],
  ["vcard", { firstName: "Zoë", phone: "+447700900123" }],
];

const golden = {};
let failures = 0;
const created = [];

for (const [type, fields] of CASES) {
  const res = await fetch(`${BASE}/v1/codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ type, fields, label: `golden ${type}` }),
  });
  if (!res.ok) {
    console.error(`FAIL  server rejected ${type}: ${res.status} ${await res.text()}`);
    failures++;
    continue;
  }
  const { id, payload } = await res.json();
  created.push(id);
  const local = buildPayload(type, fields);
  const key = `${type}:${JSON.stringify(fields)}`;
  golden[key] = payload;
  if (local === payload) {
    console.log(`PASS  ${type} matches server payload byte-exact`);
  } else {
    failures++;
    console.error(`FAIL  ${type} differs:\n  server: ${JSON.stringify(payload)}\n  local:  ${JSON.stringify(local)}`);
  }
}

// Clean up: delete every created code (keeps the test account usable).
for (const id of created) {
  await fetch(`${BASE}/v1/dynamic/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${KEY}` },
  }).catch(() => {});
}

if (failures > 0) {
  console.error(`\n${failures} mismatch(es).`);
  process.exit(1);
}

const fixtureDir = resolve(root, "fixtures");
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = resolve(fixtureDir, "golden-payloads.json");
if (existsSync(fixturePath)) {
  const prev = JSON.parse(readFileSync(fixturePath, "utf8"));
  if (JSON.stringify(prev) !== JSON.stringify(golden)) {
    console.log("\ngolden-payloads.json updated (payload wire format changed).");
  }
}
writeFileSync(fixturePath, JSON.stringify(golden, null, 2) + "\n");
console.log(`\nAll ${CASES.length} cases captured; fixtures/golden-payloads.json written.`);
