import { expect, type Page } from "@playwright/test";
/** Check the settled requested theme. Do not sample interpolated transition
 * colors or an optimistic preference that is still being saved. Axe assertions
 * remain unchanged and still reject stable contrast failures. */
export async function settleAppearance(page: Page, theme: string) {
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
  await page.evaluate(async () => {
    for (let pass = 0; pass < 4; pass++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const pending = document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === "running" &&
            a.effect?.getTiming().iterations !== Infinity,
        );
      if (!pending.length) return;
      await Promise.all(pending.map((a) => a.finished.catch(() => undefined)));
    }
  });
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
}
