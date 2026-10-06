export type FinancialAccountReferenceRole =
  "receiving" | "funding" | "transfer";

export type FinancialCategoryReferenceKind = "income" | "expense";

/**
 * A user-supplied financial-account reference is not available inside the
 * authenticated workspace.
 *
 * Missing and nonowned records intentionally share this error so callers do
 * not gain information about another workspace's private resources.
 */
export class FinancialAccountReferenceUnavailableError extends Error {
  readonly code = "FINANCIAL_ACCOUNT_REFERENCE_UNAVAILABLE";

  constructor(readonly role: FinancialAccountReferenceRole) {
    super("The selected financial account is unavailable in this workspace.");

    this.name = "FinancialAccountReferenceUnavailableError";
  }
}

/**
 * A user-supplied category reference cannot be used by the requested
 * financial command.
 *
 * Missing, nonowned, wrong-kind and archived category references deliberately
 * share this unavailable result.
 */
export class FinancialCategoryReferenceUnavailableError extends Error {
  readonly code = "FINANCIAL_CATEGORY_REFERENCE_UNAVAILABLE";

  constructor(readonly kind: FinancialCategoryReferenceKind) {
    super("The selected financial category is unavailable in this workspace.");

    this.name = "FinancialCategoryReferenceUnavailableError";
  }
}
