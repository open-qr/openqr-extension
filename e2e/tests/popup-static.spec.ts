import { decodeCanvas, expect, test } from "../helpers";

test.describe("instant static QR (disconnected)", () => {
  test.beforeEach(async () => {
    await fetch("http://127.0.0.1:8788/_control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
  });

  test("current page URL renders instantly and decodes byte-exact", async ({ popup }) => {
    const target = "https://example.com/launch-page?utm=x#top";
    const page = await popup(`?url=${encodeURIComponent(target)}`);
    const payload = await decodeCanvas(page, ".qr-plate canvas");
    expect(payload).toBe(target);
    await expect(page.getByRole("button", { name: "Copy image" })).toBeEnabled();
  });

  test("manual edits persist as a draft on reopen for the same tab", async ({ popup }) => {
    const p1 = await popup(`?url=${encodeURIComponent("https://example.com/first")}`);
    await p1.getByPlaceholder("https://example.com").fill("https://example.com/edited-draft");
    await p1.waitForTimeout(600); // draft debounce
    await p1.close();

    const p2 = await popup(`?url=${encodeURIComponent("https://example.com/first")}`);
    await p2.waitForTimeout(400);
    await expect(p2.getByPlaceholder("https://example.com")).toHaveValue("https://example.com/edited-draft");
    const payload = await decodeCanvas(p2, ".qr-plate canvas");
    expect(payload).toBe("https://example.com/edited-draft");

    // a different tab starts fresh, not from another tab's draft
    await p2.close();
    const p3 = await popup(`?url=${encodeURIComponent("https://example.com/second")}`);
    await p3.waitForTimeout(400);
    await expect(p3.getByPlaceholder("https://example.com")).toHaveValue("https://example.com/second");
  });

  test("Wi-Fi payload with escapes renders and decodes exactly", async ({ popup }) => {
    const page = await popup("");
    await page.getByRole("button", { name: "More types" }).click();
    await page.getByRole("button", { name: "Wi-Fi" }).click();
    await page.getByLabel("Network name (SSID)").fill('Cafe;Guest "Premium"');
    await page.getByLabel("Password", { exact: true }).fill("pa\\ss;wo:rd,1");
    const payload = await decodeCanvas(page, ".qr-plate canvas");
    expect(payload).toBe('WIFI:T:WPA;S:Cafe\\;Guest \\"Premium\\";P:pa\\\\ss\\;wo\\:rd\\,1;;');
  });

  test("download menu produces a decodable PNG", async ({ popup }) => {
    const page = await popup(`?url=${encodeURIComponent("https://example.com/download-me")}`);
    await page.getByRole("button", { name: /Download/ }).click();
    const dl = page.getByRole("button", { name: "PNG · 1024 × 1024" });
    const [download] = await Promise.all([page.waitForEvent("download"), dl.click()]);
    const path = await download.path();
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const jsQR = (await import("jsqr")).default;
    const img = await loadImage(path as string);
    const ctx = createCanvas(img.width, img.height).getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    const out = jsQR(new Uint8ClampedArray(data), width, height);
    expect(out?.data).toBe("https://example.com/download-me");
    expect(download.suggestedFilename()).toContain("openqr-");
  });

  test("no page errors on the disconnected popup", async ({ popup }) => {
    const page = await popup(`?url=${encodeURIComponent("https://example.com/clean")}`);
    await page.waitForTimeout(800);
    await expect(page.getByText("Connect OpenQR")).toBeVisible();
  });
});
