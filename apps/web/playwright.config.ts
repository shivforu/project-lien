import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Same executable-path resolution as packages/domain-documents/src/pdf/renderer.ts
 * (see its doc comment for why): the pinned @playwright/test version's own browser
 * revision doesn't necessarily match whatever Chromium build is pre-installed at
 * PLAYWRIGHT_BROWSERS_PATH in this build's environment, so resolve that installed
 * binary explicitly rather than relying on Playwright's version-keyed default lookup
 * (which would otherwise try to download a browser that PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
 * has disabled).
 */
function resolveExecutablePath(): string | undefined {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath || !existsSync(browsersPath)) return undefined;
  const chromiumDir = readdirSync(browsersPath).find((name) => name.startsWith("chromium-"));
  if (!chromiumDir) return undefined;
  const candidate = path.join(browsersPath, chromiumDir, "chrome-linux", "chrome");
  return existsSync(candidate) ? candidate : undefined;
}

/**
 * Real-browser E2E suite for the operations web app (docs/REQUIREMENTS_MATRIX.md
 * #25-#30). `globalSetup` boots the actual compiled api/worker/web stack against a
 * dedicated database; see apps/web/e2e/global-setup.ts for why each piece is wired the
 * way it is. Chromium only — this project doesn't claim cross-browser support, and the
 * sandbox this was built in only has Chromium preinstalled (PLAYWRIGHT_BROWSERS_PATH).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: path.join(__dirname, "e2e", "global-setup.ts"),
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: resolveExecutablePath() },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
