#!/usr/bin/env node
/**
 * Produce the manifest icon sizes from the CANONICAL rasterized brand mark
 * (the site's android-chrome-512.png, the same art openqr.uk ships as its
 * favicon), resized through Skia.
 *
 * Two dead ends documented:
 *  - ImageMagick on this Mac renders the SVG via its internal MSVG engine and
 *    drops the white modules, producing a near-black block (what the toolbar
 *    showed in Sam's first test). Do not go back to magick for the SVG.
 *  - Rendering the SVG with Skia works, but the site's own rasterization is
 *    the brand truth; resample it instead of re-rasterizing.
 *
 * The source PNG lives in this repo at scripts/assets/android-chrome-512.png
 * (copied from the openqr.uk site repo's public/ art, same brand origin).
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = await loadImage(resolve(root, "scripts/assets/android-chrome-512.png"));

for (const size of [16, 32, 48, 128]) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, size, size);

  // Guard against the dark-block regression: a correct render carries light
  // modules and brand colour, never 80%+ near-black pixels.
  const d = ctx.getImageData(0, 0, size, size).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) dark++;
  }
  const darkFrac = dark / (d.length / 4);
  if (darkFrac > 0.8) throw new Error(`icon-${size}: ${Math.round(darkFrac * 100)}% dark pixels, looks like the magick bug`);

  writeFileSync(resolve(root, `public/icons/icon-${size}.png`), canvas.toBuffer("image/png"));
  console.log(`icon-${size}.png written (${Math.round(darkFrac * 100)}% dark)`);
}
