import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve("docs/verification/assets/redesign-m1");
mkdirSync(evidence, { recursive: true });
const names = {
  home: "A little clarity for your day.",
  activity: "Financial activity",
  expense: "Review expense",
  migration: "Review template migration",
  states: "Shared interaction states",
};
const metrics: unknown[] = [];

async function openProof(
  page: Page,
  screen: keyof typeof names,
  theme: "light" | "dark" = "light",
) {
  await page.goto(`/dev/design?screen=${screen}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    names[screen],
  );
  await page.getByLabel("Theme", { exact: true }).selectOption(theme);
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  await page.evaluate(() => document.fonts.ready);
  // Hide only the development server's own diagnostics badge in review images.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
}

async function checkReflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
}

test.beforeEach(async ({ page }) => {
  // A proof must never make a private read or financial write.
  await page.route("**/api/**", (route) => {
    throw new Error(
      `Unexpected API request in synthetic proof: ${new URL(route.request().url()).pathname}`,
    );
  });
});
test.afterAll(() => {
  if (metrics.length)
    writeFileSync(
      resolve("out/redesign-m1/render-metrics.json"),
      JSON.stringify(metrics, null, 2),
    );
});

for (const width of [320, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    for (const screen of Object.keys(names) as (keyof typeof names)[]) {
      test(`${screen} · ${theme} · ${width}px reflow and rendered accessibility`, async ({
        page,
      }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 900,
        });
        await openProof(page, screen, theme);
        await checkReflow(page);
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(result.violations).toEqual([]);
        expect(errors).toEqual([]);
        if (screen !== "states" && width !== 768)
          await page.screenshot({
            path: resolve(evidence, `${screen}-${theme}-${width}.png`),
            fullPage: true,
          });
        if (screen === "activity") {
          expect(await page.getByRole("table").count()).toBe(
            width >= 1280 ? 1 : 0,
          );
          expect(
            await page
              .getByRole("list", { name: "Financial movements · newest first" })
              .count(),
          ).toBe(width >= 1280 ? 0 : 1);
        }
        metrics.push({
          screen,
          theme,
          width,
          ...(await page.evaluate(() => ({
            navigationMs: performance
              .getEntriesByType("navigation")
              .map((entry) => entry.duration)[0],
            scriptResourceBytes: performance
              .getEntriesByType("resource")
              .filter(
                (entry) =>
                  (entry as PerformanceResourceTiming).initiatorType ===
                  "script",
              )
              .reduce(
                (n, entry) =>
                  n + (entry as PerformanceResourceTiming).encodedBodySize,
                0,
              ),
          }))),
        });
      });
    }
  }
}

test("dialog and sheet contain keyboard focus, close on Escape and restore the trigger", async ({
  page,
}) => {
  await openProof(page, "states");
  for (const name of ["Open dialog", "Open sheet"]) {
    const trigger = page.getByRole("button", { name, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});

test("confirmation starts on Cancel; menu arrows skip disabled items; help restores focus", async ({
  page,
}) => {
  await openProof(page, "states", "dark");
  const trigger = page.getByRole("button", { name: "Delete synthetic draft" });
  await trigger.click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  const menu = page.getByRole("button", { name: "Record menu" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menuitem", { name: "View history" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Review correction" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "View history" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("View history selected.")).toBeVisible();
  await expect(menu).toBeFocused();
  const help = page.getByRole("button", { name: "Open help" });
  await help.click();
  await expect(
    page.getByRole("dialog", { name: "About coverage" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  const disclosure = page.locator("summary");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Disclosure uses native Enter/Space behavior", {
      exact: false,
    }),
  ).toBeVisible();
});

test("mobile financial selection opens one full detail and filters use explicit apply/reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openProof(page, "activity");
  await page.getByLabel("Funding source").selectOption("cash");
  await expect(page.getByRole("listitem")).toHaveCount(8);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(8);
  await page
    .getByRole("link", { name: "View record", exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Weekly groceries",
  );
  await expect(
    page.getByRole("list", { name: "Financial movements · newest first" }),
  ).toHaveCount(0);
  await checkReflow(page);
  await page.getByRole("link", { name: "Back to activity" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Financial activity",
  );
});

test("expense fixture distinguishes review, submitting, receipt and unresolved outcomes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openProof(page, "expense", "dark");
  await page.getByRole("button", { name: "Edit entry" }).click();
  await page.getByLabel("Description (required)", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Review expense", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter a description." }),
  ).toBeVisible();
  await expect(page.getByLabel("Description (required)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Description (required)").fill("Weekly groceries");
  await page
    .getByRole("button", { name: "Review expense", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm expense (fixture)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Record expense (fixture)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Recording expense…", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Receive accepted fixture" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Expense confirmation",
  );
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, "expense-confirmed-dark-320.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Inspect response presentation")
    .selectOption("unknown-outcome");
  await expect(
    page.getByText("We couldn't confirm whether this saved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
});

test("migration fixture retains committed batches after cancel and resumes bounded progress", async ({
  page,
}) => {
  await openProof(page, "migration");
  const batch = page.getByRole("button", {
    name: "Process next fixture batch (up to 50)",
  });
  await expect(batch).toBeDisabled();
  await page.getByRole("checkbox").check();
  await batch.click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "100");
  await page
    .getByRole("button", { name: "Cancel further processing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Cancel processing (fixture)" })
    .click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "100");
  await expect(
    page.getByRole("button", { name: "Resume next fixture batch" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Resume next fixture batch" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "120");
  await expect(
    page.getByText("All required entries resolved · fixture complete"),
  ).toBeVisible();
});

test("System theme follows media, reduced motion removes transitions, focus and 400% equivalent reflow remain", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await openProof(page, "states", "dark");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveClass(/dark/);
  const primary = page.getByRole("button", { name: "Primary action" });
  await primary.focus();
  const style = await primary.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      transition: computed.transitionDuration,
      outline: computed.outlineWidth,
      offset: computed.outlineOffset,
    };
  });
  expect(style.transition).toBe("0s");
  expect(style.outline).toBe("2px");
  expect(style.offset).toBe("3px");
  await page.setViewportSize({ width: 320, height: 900 });
  expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await checkReflow(page);
  // 1280 / 4 = 320 CSS px; separately increase text without reducing layout width.
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await checkReflow(page);
  await page.emulateMedia({ forcedColors: "active" });
  await primary.focus();
  expect(
    await primary.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("solid");
});

for (const theme of ["light", "dark"] as const) {
  test(`mobile overlays stay in the viewport and retain accessible content · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openProof(page, "states", theme);
    for (const name of ["Open dialog", "Open sheet", "Open help"]) {
      const trigger = page.getByRole("button", { name, exact: true });
      await trigger.click();
      const overlay = page.getByRole("dialog");
      await expect(overlay).toBeVisible();
      const box = (await overlay.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
    await page.getByRole("button", { name: "Record menu" }).click();
    const menu = page.getByRole("menu", { name: "Fixture actions" });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Record menu" }),
    ).toBeFocused();
  });

  test(`rendered control contrast across normal, hover, pressed and disabled states · ${theme}`, async ({
    page,
  }) => {
    await openProof(page, "states", theme);
    const ratio = async (target: ReturnType<Page["getByRole"]>) =>
      target.evaluate((element) => {
        const rgb = (value: string) =>
          (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = (value: string) =>
          rgb(value).reduce((sum, channel, i) => {
            const normalized = channel / 255;
            return (
              sum +
              (normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4) *
                [0.2126, 0.7152, 0.0722][i]!
            );
          }, 0);
        const style = getComputedStyle(element);
        let background = style.backgroundColor;
        let ancestor = element.parentElement;
        while (
          (background === "rgba(0, 0, 0, 0)" || background === "transparent") &&
          ancestor
        ) {
          background = getComputedStyle(ancestor).backgroundColor;
          ancestor = ancestor.parentElement;
        }
        const a = luminance(style.color),
          b = luminance(background);
        return {
          contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          color: style.color,
          background,
        };
      });
    const primary = page.getByRole("button", {
      name: "Primary action",
      exact: true,
    });
    expect((await ratio(primary)).contrast).toBeGreaterThanOrEqual(4.5);
    await primary.hover();
    // Wait for the actual CSS transition to settle before measuring its end state.
    await expect(primary).toHaveCSS(
      "background-color",
      theme === "light" ? "rgb(93, 61, 136)" : "rgb(188, 165, 238)",
    );
    expect((await ratio(primary)).contrast).toBeGreaterThanOrEqual(4.5);
    await page.mouse.down();
    await expect(primary).toHaveCSS(
      "background-color",
      theme === "light" ? "rgb(80, 52, 116)" : "rgb(176, 154, 224)",
    );
    expect((await ratio(primary)).contrast).toBeGreaterThanOrEqual(4.5);
    await page.mouse.up();
    for (const name of ["Secondary", "Ghost", "Delete fixture", "Unavailable"])
      expect(
        (await ratio(page.getByRole("button", { name, exact: true }))).contrast,
      ).toBeGreaterThanOrEqual(4.5);
    const input = page.getByRole("textbox", { name: "Read-only value" });
    expect((await ratio(input)).contrast).toBeGreaterThanOrEqual(4.5);
    const borderContrast = await input.evaluate((element) => {
      const luminance = (value: string) =>
        (value.match(/[\d.]+/g) ?? [])
          .slice(0, 3)
          .map(Number)
          .reduce((sum, c, i) => {
            const n = c / 255;
            return (
              sum +
              (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4) *
                [0.2126, 0.7152, 0.0722][i]!
            );
          }, 0);
      const style = getComputedStyle(element),
        a = luminance(style.borderColor),
        b = luminance(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(borderContrast).toBeGreaterThanOrEqual(3);
  });
}
