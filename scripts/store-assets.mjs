#!/usr/bin/env node
/**
 * Chrome Web Store assets from the captured screenshots:
 * four 1280x800 listing shots on the OpenQR mist ground and a 440x280
 * promo tile. Run `node scripts/shoot.mjs` style capture first (see
 * screenshots/); this composes.
 */
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shots = resolve(root, "screenshots");
const out = resolve(root, "store-assets");

GlobalFonts.registerFromPath(resolve(root, "src/assets/fonts/poppins-600.woff2"), "Poppins-Semi");
GlobalFonts.registerFromPath(resolve(root, "src/assets/fonts/poppins-400.woff2"), "Poppins-Reg");

const MIST = "#eef4f4";
const INK = "#232e3a";
const TEAL = "#0a7a79";

function canvas(w, h) {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = MIST;
  ctx.fillRect(0, 0, w, h);
  return [c, ctx];
}

async function shot(name, file, caption, scale = 1) {
  const [c, ctx] = canvas(1280, 800);
  const img = await loadImage(resolve(shots, file));
  const w = img.width * scale;
  const h = img.height * scale;
  // card + soft shadow
  const x = (1280 - w) / 2;
  const y = caption ? 96 : (800 - h) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(35,46,58,0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - 14, y - 14, w + 28, h + 28);
  ctx.restore();
  ctx.drawImage(img, x, y, w, h);
  if (caption) {
    ctx.fillStyle = INK;
    ctx.font = "600 44px Poppins-Semi";
    ctx.textAlign = "center";
    ctx.fillText(caption, 640, 72);
  }
  const fs = await import("node:fs");
  fs.writeFileSync(resolve(out, name), c.toBuffer("image/png"));
  console.log(`${name} written`);
}

async function promo() {
  const c = createCanvas(440, 280);
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 440, 280);
  grad.addColorStop(0, "#0a7a79");
  grad.addColorStop(1, "#063f3f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 440, 280);
  const icon = await loadImage(resolve(root, "public/icons/icon.svg"));
  ctx.drawImage(icon, 34, 30, 60, 60);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 44px Poppins-Semi";
  ctx.textAlign = "left";
  ctx.fillText("OpenQR", 32, 148);
  ctx.font = "400 21px Poppins-Reg";
  ctx.fillStyle = "#c9ecec";
  ctx.fillText("A QR code for any page,", 32, 194);
  ctx.fillText("before the popup finishes opening.", 32, 226);
  const fs = await import("node:fs");
  fs.writeFileSync(resolve(out, "promo-440x280.png"), c.toBuffer("image/png"));
  console.log("promo-440x280.png written");
}

const { mkdirSync } = await import("node:fs");
mkdirSync(out, { recursive: true });
await shot("store-1-instant.png", "popup-connected-light.png", "A QR code for this page, instantly");
await shot("store-2-types.png", "popup-disconnected-light.png", "Any page or link, plus Wi-Fi and contact codes");
await shot("store-3-codes.png", "codes-detail-light.png", "Dynamic codes stay editable, with scan analytics");
await shot("store-4-dark.png", "popup-connected-dark.png", "Dark mode, white QR plate");
await promo();
