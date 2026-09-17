import { control, decodeCanvas, expect, fixtureState, seedConnection, test } from "../helpers";

test.describe("connect + dynamic create", () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await control({ action: "reset" });
    await seedConnection(context, extensionId);
  });

  test("Make editable creates a dynamic code and swaps to the short URL", async ({ popup }) => {
    const page = await popup(`?url=${encodeURIComponent("https://example.com/spring-menu")}`);
    await page.getByRole("button", { name: "Make editable and view scans" }).click();

    await expect(page.getByText("Dynamic QR code ready")).toBeVisible({ timeout: 15_000 });
    const payload = await decodeCanvas(page, ".qr-plate canvas");
    expect(payload).toMatch(/^https:\/\/oqr\.to\/fx\d+$/);

    const state = await fixtureState();
    expect(state.stats.dynamicCreates).toBe(1);
    expect(state.codes).toHaveLength(1);
  });

  test("plan cap failure shows the upgrade card, never a bare error", async ({ popup }) => {
    await control({ control: { capEnforced: true } });
    const page = await popup(`?url=${encodeURIComponent("https://example.com/capped")}`);
    await page.getByRole("button", { name: "Make editable and view scans" }).click();
    await expect(page.getByRole("button", { name: "Upgrade" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Pause a code" })).toBeVisible();
  });

  test("429 surfaces the retry countdown", async ({ popup }) => {
    await control({ control: { next429: true } });
    const page = await popup(`?url=${encodeURIComponent("https://example.com/ratey")}`);
    await page.getByRole("button", { name: "Make editable and view scans" }).click();
    await expect(page.getByText(/Try again in/i)).toBeVisible({ timeout: 15_000 });
  });

  test("revoked key (401) points at reconnect, with data cleared", async ({ popup, context }) => {
    const page = await popup(`?url=${encodeURIComponent("https://example.com/revoked")}`);
    // break the key
    const sw = context.serviceWorkers()[0]!;
    await sw.evaluate(async () => {
      const { apiKey } = (await chrome.storage.local.get(["apiKey"])) as { apiKey: string };
      await chrome.storage.local.set({ apiKey: `${apiKey}broken` });
    });
    await page.reload();
    await page.getByRole("button", { name: "Make editable and view scans" }).click();
    await expect(page.getByText(/no longer valid/i)).toBeVisible({ timeout: 15_000 });
  });

  test("connect through the UI: paste key validates and pulls recent codes", async ({ popup, context }) => {
    await control({ action: "reset" });
    // seed one code through the API so the cache has something to show
    await fetch("http://127.0.0.1:8788/v1/dynamic", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer oqr_fixturekeyfore2e1234567890XYZ" },
      body: JSON.stringify({ destination: "https://example.com/seeded" }),
    });

    const sw = context.serviceWorkers()[0]!;
    await sw.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ settings: { theme: "light", baseUrl: "http://127.0.0.1:8788" } });
    });

    const page = await popup(`?url=${encodeURIComponent("https://example.com/connect-flow")}`);
    await page.getByPlaceholder("Paste your key (oqr_…)").fill("oqr_fixturekeyfore2e1234567890XYZ");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(page.getByText("fixture@example.com")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Recent codes").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("https://oqr.to/fx1").first()).toBeVisible();
  });
});
