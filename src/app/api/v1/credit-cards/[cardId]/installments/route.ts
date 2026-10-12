import { handleCardInstallment } from "@/platform/http/card-installments";
export function GET(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  return handleCardInstallment(request, context.params);
}
export function POST(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  return handleCardInstallment(request, context.params, "record");
}
