import { handleCardCommand } from "@/platform/http/card-commands";
export function POST(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  return handleCardCommand(request, context.params, "reverse");
}
