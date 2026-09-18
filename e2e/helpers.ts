import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";

/** Persistent context with the unpacked dev build; exposes extensionId. */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  popup: (query?: string) => Promise<Page>;
}>({
  context: async ({}, use) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "openqr-ext-"));
    const dist = path.resolve(import.meta.dirname, "..", "dist");
    const { chromium } = await import("@playwright/test");
    // Bundled Chromium, never branded Chrome: Chrome 137+ ignores
    // --load-extension, so unpacked extensions only load in Chromium builds.
    const context = await chromium.launchPersistentContext(profile, {
      headless: false,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let sw = context.serviceWorkers()[0];
    sw ??= await context.waitForEvent("serviceworker", { timeout: 10_000 });
    const id = new URL(sw.url()).host;
    await use(id);
  },
  popup: async ({ context, extensionId }, use) => {
    const open = async (query = "") => {
      const page = await context.newPage();
      page.on("pageerror", (e) => {
        throw new Error(`pageerror in ${page.url()}: ${e}`);
      });
      await page.goto(`chrome-extension://${extensionId}/popup.html${query}`);
      return page;
    };
    await use(open);
  },
});

export { expect };

/** Decode the QR canvas element from a screenshot, byte-exact via jsQR. */
export async function decodeCanvas(page: Page, selector: string): Promise<string> {
  const shot = await page.locator(selector).screenshot();
  const img = await loadImage(shot);
  const ctx = createCanvas(img.width, img.height).getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  const out = jsQR(new Uint8ClampedArray(data), width, height);
  if (!out) throw new Error(`jsQR could not decode ${selector}`);
  return out.data;
}

/** Point the extension at the fixture API and connect a seeded account. */
export async function seedConnection(context: BrowserContext): Promise<void> {
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 10_000 }));
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      settings: { theme: "light", baseUrl: "http://127.0.0.1:8788" },
      apiKey: "oqr_fixturekeyfore2e1234567890XYZ",
      account: {
        sessionGen: "seed-gen",
        email: "fixture@example.com",
        name: null,
        me: {
          id: "u-fix",
          email: "fixture@example.com",
          name: null,
          created_at: "2026-09-17T00:00:00Z",
          plan: "free",
          enforced: true,
          limits: { dynamic_codes: 1, scan_analytics_days: 7, detailed_analytics: false },
          usage: { active_dynamic: 0 },
          features: { protection: false, aliases: false, api: true },
        },
        connectedAt: Date.now(),
      },
    });
  });
}

export async function control(body: unknown): Promise<void> {
  const res = await fetch("http://127.0.0.1:8788/_control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`control failed: ${res.status}`);
}

export interface FixtureCode {
  id: string;
  type: string;
  dynamic: boolean;
  destination: string;
  label: string | null;
  status: string;
  short_url: string | null;
}

export async function fixtureState(): Promise<{ codes: FixtureCode[]; stats: Record<string, number> }> {
  const res = await fetch("http://127.0.0.1:8788/_state");
  return (await res.json()) as { codes: FixtureCode[]; stats: Record<string, number> };
}
