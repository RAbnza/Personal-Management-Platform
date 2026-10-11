import { handleCardStatement } from "@/platform/http/card-statements";
export function GET(
  request: Request,
  context: { params: Promise<{ cardId: string; statementId: string }> },
) {
  return handleCardStatement(request, context.params);
}
