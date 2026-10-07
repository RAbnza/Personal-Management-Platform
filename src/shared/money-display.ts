import { parseMinorUnits } from "@/shared/money";

const currencyCodePattern = /^[A-Z]{3}$/;

/**
 * Format exact V1 minor-unit values without converting them through Number.
 *
 * The current product model uses two-decimal ordinary monetary amounts.
 * Currency remains explicit so this formatter does not silently imply that
 * unrelated workspace currencies can be aggregated.
 */
export function formatMoneyMinorUnits(
  currency: string,
  amountMinor: string,
): string {
  if (!currencyCodePattern.test(currency)) {
    throw new TypeError(
      `Currency must be a three-letter uppercase code; received "${currency}".`,
    );
  }

  const amount = parseMinorUnits(amountMinor);

  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;

  const whole = magnitude / 100n;
  const fraction = magnitude % 100n;

  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return [
    negative ? "-" : "",
    currency,
    " ",
    groupedWhole,
    ".",
    fraction.toString().padStart(2, "0"),
  ].join("");
}
