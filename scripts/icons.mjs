#!/usr/bin/env node
/**
 * Produce the manifest icon sizes by resampling the canonical brand raster
 * (scripts/assets/android-chrome-512.png, the mark openqr.uk ships as its
 * favicon) through Skia.
 *
 * Not rasterised from the SVG: ImageMagick's internal SVG engine drops the
 * white modules and yields a near-black block, and Skia-rasterising the SVG
 * would only approximate art that already exists at 512px.
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
