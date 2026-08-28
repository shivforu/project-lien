import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

/**
 * Renders HTML to a PDF buffer using headless Chromium via Playwright (see
 * docs/DECISIONS.md D4 for why Playwright rather than Puppeteer). `PLAYWRIGHT_BROWSERS_PATH`
 * / `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` (set in this build's environment) point at an
 * already-installed browser instead of fetching one during `pnpm install`. Because the
 * installed browser's revision does not necessarily match whatever Playwright version
 * happens to be pinned in package.json, this resolves an explicit `executablePath` under
 * `PLAYWRIGHT_BROWSERS_PATH` when one is present (rather than relying on Playwright's own
 * version-keyed lookup), and falls back to Playwright's default resolution otherwise — a
 * real deployment without a pre-installed browser runs `playwright install chromium` once
 * (docs/LOCAL_DEVELOPMENT.md) and this fallback path covers it.
 */
export interface PdfRenderOptions {
  formatWidthInches?: number;
  formatHeightInches?: number;
}

function resolveExecutablePath(): string | undefined {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath || !existsSync(browsersPath)) return undefined;
  const chromiumDir = readdirSync(browsersPath).find((name) => name.startsWith("chromium-"));
  if (!chromiumDir) return undefined;
  const candidate = join(browsersPath, chromiumDir, "chrome-linux", "chrome");
  return existsSync(candidate) ? candidate : undefined;
}

export async function renderHtmlToPdf(html: string, options: PdfRenderOptions = {}): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true, executablePath: resolveExecutablePath() });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      width: `${options.formatWidthInches ?? 8.5}in`,
      height: `${options.formatHeightInches ?? 11}in`,
      printBackground: true,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
