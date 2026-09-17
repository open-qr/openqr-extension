import { control, expect, fixtureState, seedConnection, test, type FixtureCode } from "../helpers";

test.describe("coordinator recovery (the popup-close race)", () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await control({ action: "reset" });
    await seedConnection(context, extensionId);
  });

  test("closing the popup mid-create leaves an uncertain op; Check replays safely into ONE code", async ({ popup, context }) => {
    // The fixture holds the response for 12s: the popup closes, the response
    // arrives at a surface that no longer exists. The create LANDS (and is
    // stored under its idempotency key); the op record survives.
    await control({ control: { delayMs: 12_000 } });

    const page = await popup(`?url=${encodeURIComponent("https://example.com/race")}`);
    await page.getByRole("button", { name: "Make editable and view scans" }).click();
    await page.waitForTimeout(400); // op is now 'sent', request in flight
    await page.close();

    await new Promise((r) => setTimeout(r, 12_500)); // fixture completes the create + stores the idem replay
    let state = await fixtureState();
    expect(state.stats.dynamicCreates).toBe(1); // the create DID land exactly once

    // Age the op past STALE_SENT_MS so the next surface promotes it.
    const sw = context.serviceWorkers()[0]!;
    await sw.evaluate(async () => {
      const { ops } = (await chrome.storage.local.get(["ops"])) as { ops: Record<string, { kind: string; state: string; updatedAt: number }> };
      for (const op of Object.values(ops)) {
        if (op.kind === "create_dynamic" && op.state === "sent") op.updatedAt = Date.now() - 120_000;
      }
      await chrome.storage.local.set({ ops });
    });

    // reopen: the op survived the popup closing. Two legitimate endings:
    // the SW completed the delayed response while the popup was gone (done),
    // or the request genuinely failed (uncertain + Check). Either way the
    // create is never lost and never duplicated.
    const again = await popup(`?url=${encodeURIComponent("https://example.com/race")}`);
    const doneRow = again.getByText(/^Done/);
    const uncertainRow = again.getByText("Not sure this went through");
    await expect(doneRow.or(uncertainRow)).toBeVisible({ timeout: 20_000 });

    if (await uncertainRow.isVisible()) {
      // Check replays the SAME idempotency key: the fixture returns the
      // original create, so still exactly one code.
      await control({ control: { delayMs: 0 } });
      await again.getByRole("button", { name: "Check", exact: true }).click();
      await expect(again.getByText(/replayed: nothing was duplicated|Dynamic QR code ready/)).toBeVisible({
        timeout: 15_000,
      });
    }

    state = await fixtureState();
    expect(state.codes.filter((c: FixtureCode) => c.dynamic)).toHaveLength(1);
  });

  test("network offline lands in uncertain, not failed", async ({ popup }) => {
    const page = await popup(`?url=${encodeURIComponent("https://example.com/offline")}`);
    const sw = page.context().serviceWorkers()[0]!;
    await sw.evaluate(async () => {
      const s = (await chrome.storage.local.get(["settings"])) as { settings?: object };
      await chrome.storage.local.set({ settings: { ...s.settings, baseUrl: "http://127.0.0.1:9/dark" } });
    });
    await page.getByRole("button", { name: "Make editable and view scans" }).click();
    await expect(page.getByText("Not sure this went through")).toBeVisible({ timeout: 15_000 });
  });
});
