import { decodeCanvas, expect, test } from "../helpers";

test.describe("full-size view pane", () => {
  test("renders the payload's QR byte-exact from the fragment", async ({ context, extensionId }) => {
    const payload = "https://example.com/view-me?x=1&y=#frag";
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      throw new Error(`pageerror in ${page.url()}: ${e}`);
    });
    await page.goto(`chrome-extension://${extensionId}/codes.html?flow=view#p=${encodeURIComponent(payload)}`);
    await expect(page.locator(".qr-plate canvas")).toBeVisible();
    expect(await decodeCanvas(page, ".qr-plate")).toBe(payload);
    await expect(page.getByText(payload)).toBeVisible();
    await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  });

  test("empty fragment shows the hint instead of a blank plate", async ({ context, extensionId }) => {
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      throw new Error(`pageerror in ${page.url()}: ${e}`);
    });
    await page.goto(`chrome-extension://${extensionId}/codes.html?flow=view`);
    await expect(page.getByText("No QR code to show")).toBeVisible();
    await expect(page.locator(".qr-plate")).toHaveCount(0);
  });

  test("popup preview click opens the view tab for the same payload", async ({ popup, context }) => {
    const target = "https://example.com/from-popup";
    const page = await popup(`?url=${encodeURIComponent(target)}`);
    const viewPage = context.waitForEvent("page", { timeout: 10_000 });
    await page.getByRole("button", { name: "Open this QR code full size in a browser tab" }).click();
    const view = await viewPage;
    await expect(view.locator(".qr-plate canvas")).toBeVisible();
    expect(await decodeCanvas(view, ".qr-plate")).toBe(target);
  });
});
