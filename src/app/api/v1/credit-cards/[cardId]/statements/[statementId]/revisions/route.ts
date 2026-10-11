import { handleCardStatement } from "@/platform/http/card-statements";
export function POST(
  request: Request,
  context: { params: Promise<{ cardId: string; statementId: string }> },
) {
  return handleCardStatement(request, context.params, true);
}
