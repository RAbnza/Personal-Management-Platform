import { handleCardCommand } from "@/platform/http/card-commands";
export function GET(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  return handleCardCommand(request, context.params);
}
export function POST(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  return handleCardCommand(request, context.params, "record");
}
