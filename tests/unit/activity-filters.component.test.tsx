import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ActivityFilters } from "@/components/money/activity-filters";
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
}));
it("preserves supported source scopes and excludes blank optional filters", async () => {
  const user = userEvent.setup();
  render(
    <ActivityFilters
      filters={{
        cardId: "11111111-1111-4111-8111-111111111111",
        categoryId: "22222222-2222-4222-8222-222222222222",
      }}
    />,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Funding" }),
    "card",
  );
  await user.type(screen.getByLabelText("Transaction from"), "2026-10-01");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  const url = new URL(
    navigation.push.mock.lastCall![0],
    "https://workspace.test",
  );
  expect(url.pathname).toBe("/money/actions");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    fundingSource: "card",
    transactionFrom: "2026-10-01",
    cardId: "11111111-1111-4111-8111-111111111111",
    categoryId: "22222222-2222-4222-8222-222222222222",
  });
  expect(screen.getByRole("link", { name: "Reset filters" })).toHaveAttribute(
    "href",
    "/money/actions",
  );
});
