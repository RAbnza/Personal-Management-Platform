export const DEFAULT_CATEGORY_SEEDS = [
  {
    kind: "income",
    code: "salary",
    name: "Salary",
    sortOrder: 10,
  },
  {
    kind: "income",
    code: "gift",
    name: "Gift",
    sortOrder: 20,
  },

  {
    kind: "expense",
    code: "food",
    name: "Food",
    sortOrder: 10,
  },
  {
    kind: "expense",
    code: "transport",
    name: "Transport",
    sortOrder: 20,
  },
  {
    kind: "expense",
    code: "housing",
    name: "Housing",
    sortOrder: 30,
  },
  {
    kind: "expense",
    code: "utilities",
    name: "Utilities",
    sortOrder: 40,
  },
  {
    kind: "expense",
    code: "subscriptions",
    name: "Subscriptions",
    sortOrder: 50,
  },
  {
    kind: "expense",
    code: "shopping",
    name: "Shopping",
    sortOrder: 60,
  },
  {
    kind: "expense",
    code: "healthcare",
    name: "Healthcare",
    sortOrder: 70,
  },
  {
    kind: "expense",
    code: "education",
    name: "Education",
    sortOrder: 80,
  },
  {
    kind: "expense",
    code: "entertainment",
    name: "Entertainment",
    sortOrder: 90,
  },
  {
    kind: "expense",
    code: "interest",
    name: "Interest",
    sortOrder: 100,
  },
  {
    kind: "expense",
    code: "transaction_fees",
    name: "Transaction Fees",
    sortOrder: 110,
  },
  {
    kind: "expense",
    code: "other",
    name: "Other",
    sortOrder: 120,
  },
] as const;

export type DefaultCategorySeed = (typeof DEFAULT_CATEGORY_SEEDS)[number];

export type CategoryKind = DefaultCategorySeed["kind"];
