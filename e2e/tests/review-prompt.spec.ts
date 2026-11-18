import { expect, test } from "../helpers";
import type { BrowserContext } from "@playwright/test";

/** The one-time rating ask: appears at the value gate, never again after dismiss. */

async function seed(context: BrowserContext, valueEvents: number, reviewAsked = false) {
  const page = await context.newPage();
  const sw = context.serviceWorkers()[0];
  if (!sw) throw new Error("service worker not up yet");
  const id = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.evaluate(
    ([n, asked]) => chrome.storage.local.set({ valueEvents: n, reviewAsked: asked }),
    [valueEvents, reviewAsked],
  );
  await page.close();
}

test.describe("review prompt", () => {
  test("silent below the gate, appears at the gate, dismiss is forever", async ({ popup, context }) => {
    // Two exports recorded: silent.
    await seed(context, 2);
    let page = await popup(`?url=${encodeURIComponent("https://example.com/gate")}`);
    await expect(page.getByText("Rate OpenQR")).toBeHidden();

    // Third value moment (an export) trips the gate on the next render.
    await page.getByRole("button", { name: "Copy image" }).click();
    await expect(page.getByText("Rate OpenQR")).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByText("Rate OpenQR")).toBeHidden();

    // Reopen: still gone; another export does not bring it back.
    await page.close();
    page = await popup(`?url=${encodeURIComponent("https://example.com/gate")}`);
    await expect(page.getByText("Rate OpenQR")).toBeHidden();
    await page.getByRole("button", { name: "Copy image" }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText("Rate OpenQR")).toBeHidden();
  });
});
