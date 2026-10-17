import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const evidence = resolve("docs/verification/assets/redesign-m1");
mkdirSync(evidence, { recursive: true });
const names = {
  home: "A little clarity for your day.",
  activity: "Financial activity",
  expense: "Add expense",
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
  // Native details can toggle before hydration and then replay the click.
  await expect(page.locator("[data-review-ready]")).toHaveAttribute(
    "data-review-ready",
    "true",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    names[screen],
  );
  await page.getByTestId("review-tools").locator("summary").click();
  await page.getByLabel("Theme", { exact: true }).selectOption(theme);
  await page.getByTestId("review-tools").locator("summary").click();
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  await page.evaluate(() => document.fonts.ready);
  // next.config disables the development indicator for manual reviews too.
}

async function checkReflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    main: document.querySelector("main")!.scrollWidth,
    mainWidth: document.querySelector("main")!.clientWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.main).toBeLessThanOrEqual(sizes.mainWidth);
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

for (const width of [320, 390, 768, 1440]) {
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
        if (
          (screen !== "states" && width !== 768) ||
          (screen === "states" && width === 1440)
        )
          await page.screenshot({
            path: resolve(evidence, `${screen}-${theme}-${width}.png`),
            fullPage: width === 1440,
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
  const disclosure = page
    .locator("summary")
    .filter({ hasText: "Definitions and source context" });
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
    .getByRole("link", { name: /^Open record:/ })
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
  await expect(
    page.getByRole("heading", { name: "Exact effects" }),
  ).toHaveCount(0);
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
  await page.getByText("Fixture response controls", { exact: true }).click();
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

for (const width of [320, 1440]) {
  test(`porcelain and gallery white use the same rendered proof without a new saved preference · ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await openProof(page, "home");
    await expect(page.locator(".design-proof")).toHaveCSS(
      "background-color",
      "rgb(247, 248, 252)",
    );
    await page.getByTestId("review-tools").locator("summary").click();
    await page
      .getByLabel("Light background (review only)")
      .selectOption("gallery");
    await page.getByTestId("review-tools").locator("summary").click();
    await expect(page.locator(".design-proof")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(
      page.getByText("PHP 42,875.50", { exact: true }),
    ).toBeVisible();
    await checkReflow(page);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) =>
          /gallery|porcelain|treatment|navigation/.test(key),
        ),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: resolve(evidence, `home-gallery-light-${width}.png`),
      fullPage: true,
    });
  });
}

test("System theme follows media, reduced motion removes transitions, focus and 400% equivalent reflow remain", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text()))
      hydrationErrors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await openProof(page, "states", "dark");
  await page.getByTestId("review-tools").locator("summary").click();
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.getByTestId("review-tools").locator("summary").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const primary = page.getByRole("button", { name: "Primary action" });
  // Establish actual keyboard modality after closing the native review toolbar.
  await page.keyboard.press("Tab");
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
  expect(hydrationErrors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 1440]) {
    test(`floating capsule destinations, focus and clear content space · ${theme} · ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openProof(page, "home", theme);
      const navigation = page.getByRole("navigation", {
        name: "Product navigation prototype",
      });
      const active = navigation.filter({ visible: true });
      await expect(active).toHaveCount(1);
      const home = active.getByRole("link", { name: "Home", exact: true });
      await expect(home).toHaveAttribute("aria-current", "page");
      await expect(home.locator("span").first()).toHaveCSS(
        "border-top-color",
        theme === "light" ? "rgb(93, 61, 136)" : "rgb(188, 165, 238)",
      );
      await expect(home).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(home).toHaveCSS("font-weight", "700");
      for (const name of ["Home", "Calendar"]) {
        const link = active.getByRole("link", { name, exact: true });
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      }
      const modules = active.getByRole("button", { name: /^Modules/ });
      await modules.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByRole("dialog", {
        name: "Modules · navigation prototype",
      });
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(modules).toBeFocused();
      if (width === 320) {
        await page
          .locator(".design-proof")
          .evaluate((element) =>
            (element as HTMLElement).style.setProperty(
              "--proof-safe-bottom",
              "34px",
            ),
          );
        const box = (await active.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(12);
        expect(900 - box.y - box.height).toBeGreaterThanOrEqual(34);
        expect(
          await page
            .locator("main")
            .evaluate((element) => getComputedStyle(element).overflowY),
        ).toBe("visible");
        expect(
          await page
            .locator(".design-proof")
            .evaluate((element) =>
              parseFloat(getComputedStyle(element).paddingBottom),
            ),
        ).toBeGreaterThanOrEqual(146);
        const last = page.getByRole("link", { name: /^Open record:/ }).last();
        await last.focus();
        await last.scrollIntoViewIfNeeded();
        const item = (await last.boundingBox())!;
        expect(item.y + item.height).toBeLessThanOrEqual(box.y);
      }
      await active.getByRole("link", { name: "Calendar", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Today, at a glance",
      );
      await expect(
        page
          .getByRole("navigation", { name: "Product navigation prototype" })
          .filter({ visible: true })
          .getByRole("link", { name: "Calendar" }),
      ).toHaveAttribute("aria-current", "page");
    });

    test(`separate expense entry/review retains draft and leaves actions clear · ${theme} · ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openProof(page, "expense", theme);
      await expect(
        page.getByRole("heading", { name: "Exact effects" }),
      ).toHaveCount(0);
      await page
        .getByLabel("Notes", { exact: true })
        .fill("Keep this synthetic draft note.");
      if (width === 320 && theme === "light")
        await page.screenshot({
          path: resolve(evidence, "expense-entry-more-light-320.png"),
          fullPage: true,
        });
      await page
        .getByRole("button", { name: "Review expense", exact: true })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Review expense",
      );
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expect(
        page.getByText("Keep this synthetic draft note.", { exact: true }),
      ).toBeAttached();
      await checkReflow(page);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      // Capture the canonical synthetic review as well as the edited-draft check.
      await page.goto("/dev/design?screen=expense&stage=review");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Review expense",
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(evidence, `expense-review-${theme}-${width}.png`),
        fullPage: true,
      });
      if (width === 320) {
        await expect(
          page
            .getByRole("navigation", { name: "Product navigation prototype" })
            .filter({ visible: true }),
        ).toHaveCount(0);
        const actions = page.getByLabel("Expense task actions");
        const body = page.getByTestId("expense-task-body");
        expect(
          (await body.boundingBox())!.y + (await body.boundingBox())!.height,
        ).toBeLessThanOrEqual((await actions.boundingBox())!.y);
        await body.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expect(
          page.getByText("Remaining to allocate", { exact: true }),
        ).toBeInViewport();
        if (theme === "light")
          await page.screenshot({
            path: resolve(evidence, "expense-review-effects-light-320.png"),
            fullPage: true,
          });
      }
      await page.getByRole("button", { name: "Edit entry" }).click();
      await page
        .getByLabel("Notes", { exact: true })
        .fill("Retained after review");
      await page
        .getByRole("button", { name: "Review expense", exact: true })
        .click();
      await page.getByRole("button", { name: "Edit entry" }).click();
      await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
        "Retained after review",
      );
      if (width === 320) {
        const field = page.getByLabel("Description (required)");
        await field.focus();
        await field.scrollIntoViewIfNeeded();
        expect(
          (await field.boundingBox())!.y + (await field.boundingBox())!.height,
        ).toBeLessThanOrEqual(
          (await page.getByLabel("Expense task actions").boundingBox())!.y,
        );
      }
    });
  }

  test(`keyboard-space policy and short viewport fallback · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await openProof(page, "activity", theme);
    await page.getByLabel("Funding source").focus();
    await expect(
      page
        .getByRole("navigation", { name: "Product navigation prototype" })
        .filter({ visible: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Apply filters" }).focus();
    await expect(
      page
        .getByRole("navigation", { name: "Product navigation prototype" })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await page.setViewportSize({ width: 320, height: 400 });
    await checkReflow(page);
    const nav = page
      .getByRole("navigation", { name: "Product navigation prototype" })
      .filter({ visible: true });
    await nav.getByRole("link", { name: "Home", exact: true }).focus();
    await expect(
      nav.getByRole("link", { name: "Home", exact: true }),
    ).toBeFocused();
    await page.goto("/dev/design?screen=expense");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Add expense",
    );
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await checkReflow(page);
    await page.getByLabel("Notes", { exact: true }).fill("Large-text fixture");
    const review = page.getByRole("button", {
      name: "Review expense",
      exact: true,
    });
    await review.scrollIntoViewIfNeeded();
    await expect(review).toBeInViewport();
    await review.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Review expense",
    );
    await expect(
      page.getByRole("button", { name: "Confirm expense (fixture)" }),
    ).toBeEnabled();
  });

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

for (const concept of ["dock", "radix"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [320, 390, 768, 1440]) {
      test(`Round 3 ${concept} · ${theme} · ${width}: initial geometry, disclosure and route return`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 820,
        });
        await page.goto(`/dev/design?nav=${concept}`);
        await expect(page.locator("[data-review-ready]")).toHaveAttribute(
          "data-review-ready",
          "true",
        );
        const tools = page.getByTestId("review-tools");
        await tools.locator("summary").click();
        await page.getByLabel("Theme", { exact: true }).selectOption(theme);
        await tools.locator("summary").click();
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        await checkReflow(page);
        const home = page.getByRole("heading", { level: 1 });
        const add = page.getByRole("link", {
          name: "Add expense",
          exact: true,
        });
        await expect(home).toBeInViewport();
        await expect(add).toBeInViewport();
        const geometry = await page.evaluate(() => ({
          top: document.querySelector("main header")!.getBoundingClientRect()
            .top,
          frame: document
            .querySelector('[class*="productFrame"]')!
            .getBoundingClientRect().bottom,
          scroll: document.querySelector("main")!.scrollTop,
          overflow: getComputedStyle(document.querySelector("main")!).overflowY,
        }));
        expect(geometry.top).toBeGreaterThanOrEqual(geometry.frame);
        expect(geometry.scroll).toBe(0);
        expect(geometry.overflow).toBe("visible");
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
        await page.screenshot({
          path: resolve(evidence, `concept-${concept}-${theme}-${width}.png`),
          fullPage: width === 1440,
        });
        const nav = page
          .getByRole("navigation", { name: "Product navigation prototype" })
          .filter({ visible: true });
        await expect(nav).toHaveCount(1);
        for (const name of ["Home", "Calendar", "Modules", "More"]) {
          const target = nav.getByRole(
            name === "Home" || name === "Calendar" ? "link" : "button",
            { name, exact: true },
          );
          const bounds = (await target.boundingBox())!;
          expect(bounds.height).toBeGreaterThanOrEqual(48);
          expect(bounds.width).toBeGreaterThanOrEqual(48);
          await expect(target).toBeVisible();
        }
        const modules = nav.getByRole("button", {
          name: "Modules",
          exact: true,
        });
        const destination = page.getByRole("link", {
          name: /Money.*Financial activity/,
        });
        if (concept === "radix" && width >= 768) {
          await modules.hover();
          await expect(destination).toBeVisible();
          await page.mouse.move(0, 0);
          await expect(destination).not.toBeVisible();
        }
        await modules.focus();
        await page.keyboard.press("Enter");
        await expect(destination).toBeVisible();
        if (width === 1440)
          await page.screenshot({
            path: resolve(evidence, `modules-${concept}-${theme}-1440.png`),
            fullPage: true,
          });
        if (concept === "radix" && width >= 768) {
          await page.keyboard.press("ArrowDown");
          await expect(destination).toBeFocused();
        }
        await page.keyboard.press("Escape");
        await expect(modules).toBeFocused();
        await expect(destination).not.toBeVisible();
        const more = nav.getByRole("button", { name: "More", exact: true });
        await more.focus();
        await more.press("Enter");
        await expect(
          page.getByRole("link", { name: /^Interaction states/ }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(more).toBeFocused();
        await modules.press("Enter");
        await expect(destination).toBeVisible();
        await destination.click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Financial activity",
        );
        await expect(page.locator(".design-proof")).toHaveAttribute(
          "data-navigation",
          concept,
        );
        await page
          .getByRole("navigation", { name: "Product navigation prototype" })
          .filter({ visible: true })
          .getByRole("link", { name: "Home", exact: true })
          .click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "A little clarity for your day.",
        );
        await expect(
          page.getByRole("link", { name: "Add expense", exact: true }),
        ).toBeInViewport();
        await expect(page.locator("[data-review-ready]")).toHaveAttribute(
          "data-review-ready",
          "true",
        );
        expect(await page.evaluate(() => scrollY)).toBe(0);
        if (width < 768) {
          const last = page.getByRole("link", {
            name: /Review template update/,
          });
          await last.focus();
          await last.scrollIntoViewIfNeeded();
          const bottom = (await last.boundingBox())!;
          const dockBox = (await nav.boundingBox())!;
          expect(bottom.y + bottom.height).toBeLessThanOrEqual(dockBox.y);
          await page.evaluate(() => scrollTo(0, 0));
          // Review disclosure can grow beyond a short viewport without clipping main.
          await tools.locator("summary").click();
          await page
            .getByLabel("Navigation concept (review only)")
            .selectOption(concept);
          await tools.locator("summary").click();
          await expect(
            page.getByRole("link", { name: "Add expense", exact: true }),
          ).toBeInViewport();
        }
      });
    }
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`Round 3 alternative palette · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openProof(page, "home", theme);
    const focal = page.locator('section[aria-label="Financial snapshot"]');
    const originalBlend = await focal.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    const tools = page.getByTestId("review-tools");
    await tools.locator("summary").click();
    await page
      .getByLabel(
        theme === "light"
          ? "Light background (review only)"
          : "Dark treatment (review only)",
      )
      .selectOption(theme === "light" ? "gallery" : "graphite");
    await tools.locator("summary").click();
    await expect(focal).not.toHaveCSS("background-image", originalBlend);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: resolve(evidence, `home-alternative-${theme}-1440.png`),
      fullPage: true,
    });
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Desktop dock hover preserves geometry and keyboard focus · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openProof(page, "home", theme);
    const nav = page
      .getByRole("navigation", { name: "Product navigation prototype" })
      .filter({ visible: true });
    const home = nav.getByRole("link", { name: "Home", exact: true });
    const calendar = nav.getByRole("link", { name: "Calendar", exact: true });
    const tile = calendar.locator("span").first();
    const geometry = () =>
      nav.evaluate((element) =>
        [
          element,
          ...element.querySelectorAll(
            "a, button, a > span:first-child, button > span:first-child",
          ),
        ].map((target) => {
          const { x, y, width, height } = target.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
    await page.mouse.move(0, 0);
    const initial = await geometry();
    expect(initial[1]!.width).toBe(90);
    const idleBackground = await calendar.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const hoverBackground = await tile.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await calendar.hover();
    await expect(calendar).toHaveCSS("transition-duration", "0.18s, 0.18s");
    await expect(calendar).toHaveCSS("background-color", hoverBackground);
    await expect(tile).toHaveCSS("transform", "none");
    expect(await geometry()).toEqual(initial);
    await expect(home).toHaveAttribute("aria-current", "page");
    await expect(home).not.toHaveCSS("background-color", hoverBackground);
    await page.mouse.move(0, 0);
    await expect(calendar).toHaveCSS("background-color", idleBackground);
    expect(await geometry()).toEqual(initial);

    await home.focus();
    await page.keyboard.press("Tab");
    await expect(calendar).toBeFocused();
    await expect(calendar).toHaveCSS("outline-style", "solid");
    await expect(calendar).toHaveCSS("outline-width", "2px");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(calendar).toHaveCSS("transition-duration", "0s");
    await calendar.hover();
    await expect(tile).toHaveCSS("transform", "none");
    expect(await geometry()).toEqual(initial);
    await expect(home).toHaveAccessibleName("Home");
  });
}

for (const { width, height, theme } of [
  { width: 1440, height: 900, theme: "light" },
  { width: 1440, height: 900, theme: "dark" },
  { width: 320, height: 900, theme: "light" },
  { width: 390, height: 900, theme: "dark" },
  { width: 320, height: 500, theme: "light" },
] as const) {
  test(`Dock expansion stays above its anchor and manages focus · ${theme} · ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await openProof(page, "home", theme);
    const nav = page
      .getByRole("navigation", { name: "Product navigation prototype" })
      .filter({ visible: true });
    const home = nav.getByRole("link", { name: "Home", exact: true });
    await expect(home).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(home).toHaveCSS("font-weight", "700");
    expect(
      await home.evaluate(
        (element) => getComputedStyle(element, "::after").height,
      ),
    ).toBe("2px");
    const anchor = (await nav.boundingBox())!;
    const modules = nav.getByRole("button", { name: "Modules", exact: true });
    const more = nav.getByRole("button", { name: "More", exact: true });
    const panel = page.getByRole("dialog", {
      name: "Modules · navigation prototype",
    });
    const money = page.getByRole("link", { name: /Money.*Financial activity/ });
    await modules.focus();
    await modules.press("Enter");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-side", "top");
    await expect(panel).toHaveCSS("transform", "none");
    await expect(money).toBeFocused();
    await expect(modules).toHaveAttribute("aria-expanded", "true");
    expect(await panel.getAttribute("aria-modal")).not.toBe("true");
    const bounds = (await panel.boundingBox())!;
    expect(
      Math.abs(bounds.x + bounds.width / 2 - anchor.x - anchor.width / 2),
    ).toBeLessThanOrEqual(1);
    expect(bounds.y).toBeGreaterThanOrEqual(10);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(anchor.y);
    expect(anchor.y - bounds.y - bounds.height).toBeLessThanOrEqual(10);
    expect(await nav.boundingBox()).toEqual(anchor);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(modules).toBeFocused();

    await more.click();
    const morePanel = page.getByRole("dialog", {
      name: "More · navigation prototype",
    });
    await expect(
      page.getByRole("link", { name: /^Interaction states/ }),
    ).toBeFocused();
    await modules.click();
    await expect(morePanel).not.toBeVisible();
    await expect(panel).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(money).toBeFocused();
    await panel.getByRole("button", { name: "Close Modules menu" }).click();
    await expect(modules).toBeFocused();

    await modules.click();
    const outside = page.getByTestId("review-tools").locator("summary");
    // The upward panel can cover the lower part of this summary at short heights.
    await outside.click({ position: { x: 4, y: 1 } });
    await expect(panel).not.toBeVisible();
    await expect(outside).toBeFocused();
    await outside.click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await more.click();
    await expect(morePanel).toHaveCSS("animation-name", "none");
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
  });
}

for (const concept of ["dock", "radix"] as const) {
  test(`Round 3 short viewport and zoom retain Home action · ${concept}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 500 });
    await page.goto(`/dev/design?nav=${concept}`);
    await expect(page.locator("[data-review-ready]")).toHaveAttribute(
      "data-review-ready",
      "true",
    );
    await page.addStyleTag({ content: "html {font-size:200%;}" });
    await checkReflow(page);
    const labels = await page
      .getByRole("navigation", { name: "Product navigation prototype" })
      .filter({ visible: true })
      .locator("span")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        })),
      );
    for (const label of labels)
      expect(label.scroll).toBeLessThanOrEqual(label.width);
    const add = page.getByRole("link", { name: "Add expense", exact: true });
    await add.focus();
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeInViewport();
    expect(
      await page.locator("main").evaluate((e) => getComputedStyle(e).overflowY),
    ).toBe("visible");
    await add.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Add expense",
    );
    await expect(page.locator("[data-review-ready]")).toHaveAttribute(
      "data-review-ready",
      "true",
    );
    await page.getByRole("link", { name: "Back to activity" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Financial activity",
    );
  });
}
