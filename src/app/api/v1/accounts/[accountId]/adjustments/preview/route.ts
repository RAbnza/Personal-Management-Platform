import { postAccountComparison } from "@/platform/http/account-reconciliation";
export function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  return postAccountComparison(request, context, "adjustment", true);
}
