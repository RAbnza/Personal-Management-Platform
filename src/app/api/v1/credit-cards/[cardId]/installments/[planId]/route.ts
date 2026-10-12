import { handleCardInstallment } from "@/platform/http/card-installments";
export function GET(
  request: Request,
  context: { params: Promise<{ cardId: string; planId: string }> },
) {
  return handleCardInstallment(request, context.params);
}
