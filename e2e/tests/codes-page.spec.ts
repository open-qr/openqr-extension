import { control, expect, fixtureState, seedConnection, test, type FixtureCode } from "../helpers";

test.describe("codes page (recent codes + detail)", () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await control({ action: "reset" });
    // seed: one dynamic, one static
    await fetch("http://127.0.0.1:8788/v1/dynamic", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer oqr_fixturekeyfore2e1234567890XYZ" },
      body: JSON.stringify({ destination: "https://example.com/spring-menu", label: "Spring menu" }),
    });
    await fetch("http://127.0.0.1:8788/v1/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer oqr_fixturekeyfore2e1234567890XYZ" },
      body: JSON.stringify({ type: "wifi", fields: { ssid: "CafeGuest", password: "sesame", encryption: "WPA" } }),
    });
    await seedConnection(context, extensionId);
  });

  async function openCodes(context: import("@playwright/test").BrowserContext, extensionId: string) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/codes.html`);
    return page;
  }

  test("list renders both types with honest labels; search filters loaded codes", async ({ context, extensionId }) => {
    const page = await openCodes(context, extensionId);
    await expect(page.getByText("Spring menu")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("WIFI:T:WPA;S:CafeGuest;P:sesame;;").first()).toBeVisible();

    await page.getByPlaceholder("Search the codes shown").fill("spring");
    await expect(page.getByText("Spring menu")).toBeVisible();
    await expect(page.getByText("WIFI:T:WPA;S:CafeGuest;P:sesame;;")).toHaveCount(0);

    await page.getByPlaceholder("Search the codes shown").fill("");
    await page.getByRole("button", { name: "static", exact: true }).click();
    await expect(page.getByText("Static · wifi").first()).toBeVisible();
  });

  test("destination edit + pause go through the coordinator and the list reflects them", async ({ context, extensionId }) => {
    const page = await openCodes(context, extensionId);
    await page.getByText("Spring menu").click();
    await expect(page.getByLabel("Destination")).toBeVisible();

    await page.getByLabel("Destination").fill("https://example.com/summer-menu");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saving the new destination…")).toBeVisible();

    await expect
      .poll(async () => (await fixtureState()).codes.find((c: FixtureCode) => c.label === "Spring menu"))
      .toMatchObject({ destination: "https://example.com/summer-menu" });

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect
      .poll(async () => (await fixtureState()).stats.patches)
      .toBeGreaterThanOrEqual(2);
  });

  test("headline scans render with the server-honoured window", async ({ context, extensionId }) => {
    const page = await openCodes(context, extensionId);
    await page.getByText("Spring menu").click();
    await expect(page.getByText("Total scans")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Window shown: 7 days/)).toBeVisible(); // clamped by plan, echoed by server
    await expect(page.getByText("Top country")).toBeVisible();
    await expect(page.getByText(/Detailed breakdowns/)).toBeVisible(); // Free: upsell note
  });

  test("static detail teaches the model: no analytics, no live destination edit", async ({ context, extensionId }) => {
    const page = await openCodes(context, extensionId);
    await page.getByRole("button", { name: "static", exact: true }).click();
    await page.getByText("WIFI:T:WPA;S:CafeGuest;P:sesame;;").first().click();
    await expect(page.getByText(/Static QR code holds its content directly|static QR code holds/i)).toBeVisible();
    await expect(page.getByLabel("Destination")).toHaveCount(0);
    await expect(page.getByText("Scan analytics", { exact: true })).toHaveCount(0);
  });
});
