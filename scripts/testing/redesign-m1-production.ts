/** Read-only M1 production boundary and existing sign-in appearance checks.
 * Start a fresh `pnpm exec next start --port 3300` after `pnpm build` first.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function main() {
  const output = resolve("out/redesign-m1");
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.PMP_BROWSER_CHANNEL ?? "msedge",
    headless: true,
  });
  const results = [];
  try {
    const context = await browser.newContext({
      baseURL: "http://localhost:3300",
    });
    const proof = await context.request.get("/dev/design?screen=expense");
    assert.equal(
      proof.status(),
      404,
      "Development proofs must be absent in production",
    );
    assert.ok(!(await proof.text()).includes("Weekly groceries"));
    for (const width of [320, 1440])
      for (const theme of ["light", "dark"]) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(
          (value) => localStorage.setItem("personal-management-theme", value),
          theme,
        );
        await page.goto("/auth/sign-in");
        const submit = page.getByRole("button", {
          name: "Sign in",
          exact: true,
        });
        await submit.waitFor();
        await page.waitForFunction(
          (value) => document.documentElement.classList.contains(value),
          theme,
        );
        await page.evaluate(() => document.fonts.ready);
        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        assert.deepEqual(axe.violations, []);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: resolve(output, `existing-sign-in-${theme}-${width}.png`),
          fullPage: true,
        });
        // Empty form validation must remain local and keep error/control associations.
        await page.route("**/api/**", () => {
          throw new Error("Unexpected API request from empty sign-in form");
        });
        await submit.click();
        await page.locator('[aria-invalid="true"]').first().waitFor();
        const invalid = await page
          .locator('[aria-invalid="true"]')
          .first()
          .evaluate((element) => ({
            focused: document.activeElement === element,
            associated: (element.getAttribute("aria-describedby") ?? "")
              .split(" ")
              .some(
                (id) =>
                  document.getElementById(id)?.getAttribute("role") === "alert",
              ),
          }));
        assert.ok(invalid.focused && invalid.associated);
        results.push({
          width,
          theme,
          axeViolations: 0,
          reflow: true,
          invalidFieldFocusAndAssociation: true,
        });
        await page.close();
      }
    await context.close();
  } finally {
    await browser.close();
  }

  // Gzip each unique client-reference chunk once. This is a reproducible local
  // closure measurement, not network transfer, hydration time or a user budget.
  const sandbox: Record<string, unknown> = {};
  runInNewContext(
    readFileSync(
      ".next-release/server/app/auth/sign-in/page_client-reference-manifest.js",
      "utf8",
    ),
    sandbox,
  );
  const manifest = (
    sandbox.__RSC_MANIFEST as Record<
      string,
      { clientModules: Record<string, { chunks: string[] }> }
    >
  )["/auth/sign-in/page"]!;
  const chunks = [
    ...new Set(
      Object.values(manifest.clientModules)
        .flatMap((entry) => entry.chunks)
        .filter((file) => file.endsWith(".js")),
    ),
  ];
  const gzipClientReferenceBytes = chunks.reduce(
    (sum, file) =>
      sum +
      gzipSync(
        readFileSync(resolve(".next-release", file.replace("/_next/", ""))),
      ).length,
    0,
  );
  const result = {
    browser: "Microsoft Edge (Chromium)",
    productionProofStatus: 404,
    existingSignIn: results,
    buildId: readFileSync(".next-release/BUILD_ID", "utf8").trim(),
    gzipClientReferenceBytes,
  };
  writeFileSync(
    resolve(output, "production-check.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
