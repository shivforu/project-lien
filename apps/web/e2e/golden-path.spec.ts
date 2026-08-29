import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { API_BASE_URL, TEST_DATABASE_URL } from "./global-setup";

/**
 * One continuous golden-path run through every screen the operations web app has
 * (docs/REQUIREMENTS_MATRIX.md #25-#27, #29-#30), against the real running stack
 * global-setup boots. This is the first committed, automated replacement for the
 * one-off manual Playwright scripts Phase 10/11 used to verify these same screens —
 * see PROGRESS.md's Phase 15 entry.
 *
 * Seed data referenced below (demo admin, CA/06037 jurisdiction rule, 5 integration
 * connections) comes from packages/db/src/seed.ts and is intentionally hardcoded here:
 * a change to either file without updating the other should fail this test, which is
 * the point of pinning it.
 *
 * Each Playwright test gets a fresh browser context (so localStorage doesn't carry
 * over), which is why every test below logs in through the real UI first rather than
 * sharing one authenticated context — that's also more real-world coverage of the
 * actual login screen, not less.
 */

const DEMO_EMAIL = "admin@demo-title-escrow.example";
const DEMO_PASSWORD = "password123";

async function loginThroughUi(page: Page): Promise<string> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/queue");
  const session = await page.evaluate(() => window.localStorage.getItem("project-lien-session"));
  expect(session).not.toBeNull();
  return (JSON.parse(session as string) as { accessToken: string }).accessToken;
}

// Fixed demo org id seeded by packages/db/src/seed.ts.
const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

test.describe.serial("operations web app golden path", () => {
  let createdPackageId: string;
  let loanId: string;
  let propertyId: string;
  const packageIdentifier = `E2E-${randomUUID()}`;

  test.beforeAll(async () => {
    // recording_packages.loan_id/property_id are real foreign keys (apps/api/src/routes.test.ts
    // and apps/worker/src/e2e-scenarios.test.ts both set up the same fixtures for the same
    // reason) — a package can't be created against IDs that don't exist in loans/properties.
    const db = new Client({ connectionString: TEST_DATABASE_URL });
    await db.connect();
    const property = await db.query(
      `INSERT INTO properties (organization_id, parcel_number, address_line1, city, state_code, zip_code, county_fips, county_name)
       VALUES ($1, 'E2E-1', '1 Main St', 'Los Angeles', 'CA', '90001', '06037', 'Los Angeles') RETURNING id`,
      [DEMO_ORG_ID],
    );
    propertyId = property.rows[0].id;
    const loan = await db.query(
      `INSERT INTO loans (organization_id, loan_number, property_id, unpaid_principal_cents, interest_rate_bps, borrower_name)
       VALUES ($1, $2, $3, 0, 0, 'E2E Borrower') RETURNING id`,
      [DEMO_ORG_ID, `E2E-LN-${randomUUID()}`, propertyId],
    );
    loanId = loan.rows[0].id;
    await db.end();
  });

  test("logs in through the real UI against the real API", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    const accessToken = await loginThroughUi(page);
    await expect(page.getByRole("heading", { name: "Recording queue" })).toBeVisible();
    expect(typeof accessToken).toBe("string");
    expect(accessToken.length).toBeGreaterThan(0);
  });

  test("jurisdiction lookup renders the real seeded CA/Los Angeles rule", async ({ page }) => {
    await loginThroughUi(page);
    await page.goto("/jurisdictions");
    await page.getByLabel("State code").fill("CA");
    await page.getByLabel("County FIPS (optional)").fill("06037");
    await page.getByRole("button", { name: "Look up" }).click();

    await expect(page.getByText(/demo\/seed data, not verified legal research/i)).toBeVisible();
    const table = page.locator("table");
    await expect(table).toContainText("DEED_OF_RECONVEYANCE");
    await expect(table).toContainText("Yes"); // trusteeRequired
    await expect(table).toContainText("SIMPLIFILE"); // e-recording network from the county row
  });

  test("integrations screen renders all 5 real seeded connector rows", async ({ page }) => {
    await loginThroughUi(page);
    await page.goto("/integrations");
    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(5);
    const table = page.locator("table");
    await expect(table).toContainText("SIMPLIFILE");
    await expect(table).toContainText("CSC");
    await expect(table).toContainText("EPN");
  });

  test("a real package created via the API appears on the real queue and detail screens", async ({ page }) => {
    const accessToken = await loginThroughUi(page);

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const createRes = await api.post("/api/v1/releases", {
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        packageIdentifier,
        loanId,
        propertyId,
        stateCode: "CA",
        countyFips: "06037",
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = (await createRes.json()).data;
    createdPackageId = created.id;
    expect(created.status).toBe("DRAFT");
    await api.dispose();

    await page.goto("/queue");
    await expect(page.getByRole("link", { name: packageIdentifier })).toBeVisible();

    await page.getByRole("link", { name: packageIdentifier }).click();
    await page.waitForURL(`**/queue/${createdPackageId}`);
    await expect(page.getByRole("heading", { name: packageIdentifier })).toBeVisible();
    const table = page.locator("table");
    await expect(table).toContainText("DRAFT");
    await expect(table).toContainText("CA / 06037");
  });

  test("forcing the package to REJECTED surfaces it in the exception center, and Resolve really advances it in Postgres", async ({
    page,
  }) => {
    expect(createdPackageId, "requires the previous test's created package").toBeTruthy();

    // Mirrors exactly how Phase 11's manual verification forced a rejection to reach the
    // exception center (PROGRESS.md Phase 11 entry) — there is no "reject" API action in
    // this system's design (rejections normally arrive from a vendor poll), so direct SQL
    // is the correct way to set up this scenario, not a shortcut around it.
    const db = new Client({ connectionString: TEST_DATABASE_URL });
    await db.connect();
    await db.query(
      `UPDATE recording_packages SET status = 'REJECTED', rejection_reason = 'E2E-forced rejection', updated_at = now() WHERE id = $1`,
      [createdPackageId],
    );
    await db.end();

    const accessToken = await loginThroughUi(page);

    await page.goto("/exceptions");
    await expect(page.getByRole("heading", { name: "Exception center" })).toBeVisible();
    const exceptionRow = page.locator("tbody tr", { hasText: packageIdentifier });
    await expect(exceptionRow).toBeVisible();
    await expect(exceptionRow).toContainText("REJECTED");

    // "Resolve" advances a package exactly one step along the state machine's recovery
    // path (REJECTED -> RESUBMISSION_REQUIRED -> VALIDATING; apps/api/src/routes/exceptions.ts),
    // deliberately not all the way out of the exception list in one click — an operator
    // decides each step is warranted, per that router's own doc comment. So after one
    // Resolve click the row is still present (RESUBMISSION_REQUIRED is itself listed as
    // an exception state), just with an updated status, not gone.
    await exceptionRow.getByRole("button", { name: "Resolve" }).click();
    await expect(exceptionRow).toContainText("RESUBMISSION_REQUIRED");

    const api = await playwrightRequest.newContext({ baseURL: API_BASE_URL });
    const getRes = await api.get(`/api/v1/releases/${createdPackageId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.ok()).toBeTruthy();
    const pkg = (await getRes.json()).data;
    expect(pkg.status).toBe("RESUBMISSION_REQUIRED");
    await api.dispose();
  });
});
