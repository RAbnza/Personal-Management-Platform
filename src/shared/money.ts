export const MAX_FINANCIAL_COMPONENT_MINOR = 100_000_000_000n;

const currencyCodePattern = /^[A-Z]{3}$/;
const integerMinorUnitsPattern = /^(?:0|-?[1-9]\d*)$/;
const phpAmountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export type Money = Readonly<{
  currency: string;
  amountMinor: bigint;
}>;

export type MoneyJson = Readonly<{
  currency: string;
  amountMinor: string;
}>;

function assertCurrencyCode(currency: string): string {
  if (!currencyCodePattern.test(currency)) {
    throw new TypeError(
      `Currency must be a three-letter uppercase code; received "${currency}".`,
    );
  }

  return currency;
}

export function createMoney(currency: string, amountMinor: bigint): Money {
  return Object.freeze({
    currency: assertCurrencyCode(currency),
    amountMinor,
  });
}

/**
 * Parse an exact integer minor-unit string from database/API boundaries.
 *
 * This deliberately rejects decimal notation, exponent notation, grouping,
 * leading zeroes and surrounding whitespace rather than passing them through
 * Number.
 */
export function parseMinorUnits(value: string): bigint {
  if (!integerMinorUnitsPattern.test(value)) {
    throw new TypeError(
      `Minor units must be an exact base-10 integer string; received "${value}".`,
    );
  }

  return BigInt(value);
}

/**
 * Parse an ordinary PHP form amount into centavos without using floating-point
 * arithmetic.
 *
 * Examples:
 *   "5000"   -> 500000n
 *   "5000.5" -> 500050n
 *   "0.01"   -> 1n
 *
 * Form amounts are non-negative. Domain services separately decide whether
 * zero is valid for a particular command.
 */
export function parsePhpAmountToMinorUnits(value: string): bigint {
  if (!phpAmountPattern.test(value)) {
    throw new TypeError(
      `PHP amount must be an ungrouped decimal with at most two decimal places; received "${value}".`,
    );
  }

  const [wholePart = "", fractionalPart = ""] = value.split(".");
  const centavos = fractionalPart.padEnd(2, "0");

  return BigInt(wholePart) * 100n + BigInt(centavos || "0");
}

export function moneyFromJson(input: MoneyJson): Money {
  return createMoney(input.currency, parseMinorUnits(input.amountMinor));
}

export function moneyToJson(money: Money): MoneyJson {
  return {
    currency: assertCurrencyCode(money.currency),
    amountMinor: money.amountMinor.toString(),
  };
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new RangeError(
      `Money currencies must match; received ${left.currency} and ${right.currency}.`,
    );
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);

  return createMoney(left.currency, left.amountMinor + right.amountMinor);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);

  return createMoney(left.currency, left.amountMinor - right.amountMinor);
}

/**
 * Validate one persisted financial component/posting amount.
 *
 * Aggregate totals may exceed this bound and must therefore be checked
 * separately rather than being forced through this function.
 */
export function assertFinancialComponentMinor(amountMinor: bigint): bigint {
  const magnitude = amountMinor < 0n ? -amountMinor : amountMinor;

  if (amountMinor === 0n || magnitude > MAX_FINANCIAL_COMPONENT_MINOR) {
    throw new RangeError(
      `Financial component must be nonzero and within ±${MAX_FINANCIAL_COMPONENT_MINOR.toString()} minor units.`,
    );
  }

  return amountMinor;
}

/**
 * Validate a user-entered positive monetary component.
 */
export function assertPositiveFinancialAmountMinor(
  amountMinor: bigint,
): bigint {
  if (amountMinor <= 0n || amountMinor > MAX_FINANCIAL_COMPONENT_MINOR) {
    throw new RangeError(
      `Financial amount must be between 1 and ${MAX_FINANCIAL_COMPONENT_MINOR.toString()} minor units.`,
    );
  }

  return amountMinor;
}

/**
 * Divide a monetary amount evenly while preserving every minor unit.
 *
 * Any remainder is assigned one minor unit at a time from the beginning of
 * the returned array. Callers can therefore explicitly identify which
 * allocation received the rounding remainder.
 */
export function allocateMoneyEvenly(money: Money, partCount: number): Money[] {
  if (!Number.isSafeInteger(partCount) || partCount <= 0) {
    throw new RangeError(
      "Money allocation part count must be a positive safe integer.",
    );
  }

  const divisor = BigInt(partCount);
  const baseAmount = money.amountMinor / divisor;
  const remainder = money.amountMinor % divisor;
  const remainderMagnitude = remainder < 0n ? -remainder : remainder;
  const remainderStep = remainder < 0n ? -1n : 1n;

  return Array.from(
    {
      length: partCount,
    },
    (_, index) => {
      const receivesRemainder = BigInt(index) < remainderMagnitude;

      return createMoney(
        money.currency,
        baseAmount + (receivesRemainder ? remainderStep : 0n),
      );
    },
  );
}
