#!/usr/bin/env node
/**
 * Byte-exact parity check: the extension's local payload builders vs the
 * SERVER's buildPayload (bundled straight from the openqr.uk site repo).
 * Run on Sam's machine (the site repo path is local-only; CI instead locks
 * the committed goldens in fixtures/golden-payloads.json):
 *
 *   SITE=~/Documents/Projects/qr-generator node scripts/verify-server-parity.mjs
 *
 * Broader than the golden fixtures: sweeps every type plus the escape edges
 * that silently render different codes (WIFI \\ ; , : ", vCard \\ ; , newline,
 * colon untouched), unicode, empty fields and trim behaviour.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.expandHomeShell ?? process.env.SITE ?? path.join(process.env.HOME, "Documents/Projects/qr-generator");
const serverPayloads = path.join(SITE, "lib/payloads.ts");
const extPayloads = path.join(root, "src/lib/payloads.ts");

const dir = mkdtempSync(path.join(tmpdir(), "openqr-parity-"));
function load(tsPath, name) {
  const js = execSync(`npx esbuild ${tsPath} --bundle --format=esm --platform=neutral`, {
    encoding: "utf8",
    cwd: root,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const out = path.join(dir, `${name}.mjs`);
  writeFileSync(out, js);
  return import(out);
}

const { buildPayload: server } = await load(serverPayloads, "server-payloads");
const { buildPayload: local } = await load(extPayloads, "ext-payloads");

/** Field names per type, from the server's own builder switch. */
const CASES = [
  ["url", {}],
  ["url", { url: "example.com/menu" }],
  ["url", { url: " https://example.com/x " }],
  ["url", { url: "mailto:a@b.co" }],
  ["url", { url: "weird://scheme.host/x" }],
  ["url", { url: "HTTPS://EXAMPLE.COM/UPPER" }],
  ["text", {}],
  ["text", { text: "  padded text  " }],
  ["text", { text: "emoji 🌍 and 中文字" }],
  ["email", {}],
  ["email", { email: "a@b.co" }],
  ["email", { email: "a@b.co", subject: "Hello there + plus" }],
  ["email", { email: "a@b.co", subject: "s", body: "line one\nline two" }],
  ["phone", { phone: "+44 7700 900123" }],
  ["phone", { phone: "  " }],
  ["sms", { phone: "+44 7700 900123" }],
  ["sms", { phone: "+44 7700 900123", message: "hi; there: you, ok?" }],
  ["whatsapp", { phone: "+44 (0)7700 900123" }],
  ["whatsapp", { phone: "07700900123", message: "菜单 menu" }],
  ["wifi", { ssid: "Plain" }],
  ["wifi", { ssid: "S", password: "p" }],
  ["wifi", { ssid: 'semi;colon "quote"', password: "back\\slash", encryption: "WPA" }],
  ["wifi", { ssid: "com,ma:colon", password: "mix\\;,:\"all", encryption: "WEP" }],
  ["wifi", { ssid: "Open", encryption: "nopass" }],
  ["wifi", { ssid: "Hidden", password: "x", hidden: true }],
  ["wifi", { ssid: "éssidünicode", password: "pässwörd" }],
  ["geo", { lat: "51.5074", lng: "-0.1278" }],
  ["geo", { lat: "1" }],
  ["vcard", {}],
  ["vcard", { org: "Only Org" }],
  ["vcard", { firstName: "Jo" }],
  ["vcard", { firstName: "Jo", lastName: "Smith" }],
  ["vcard", { firstName: "Jo", lastName: "Last;Name, Esq.", phone: "+447700900123", email: "j@x.co", org: "Org, Inc; Ltd", title: "Head; Honcho", url: "example.com/u?v=1#f", address: "1 Road\nTown\nCounty" }],
  ["vcard", { firstName: "Zoë", lastName: "中野", phone: "+447700900123" }],
  ["vcard", { email: "only@example.com" }],
];

let pass = 0, fail = 0;
for (const [type, fields] of CASES) {
  const a = server(type, fields);
  const b = local(type, fields);
  if (a === b) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL  ${type} ${JSON.stringify(fields)}\n  server: ${JSON.stringify(a)}\n  local:  ${JSON.stringify(b)}`);
  }
}
console.log(`${pass} passed, ${fail} failed (${CASES.length} parity cases vs ${path.basename(SITE)}/lib/payloads.ts)`);
process.exit(fail ? 1 : 0);
