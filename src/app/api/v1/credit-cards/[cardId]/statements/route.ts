import { handleCardStatement } from "@/platform/http/card-statements";
type Context = { params: Promise<{ cardId: string }> };
export function GET(request: Request, context: Context) {
  return handleCardStatement(request, context.params);
}
export function POST(request: Request, context: Context) {
  return handleCardStatement(request, context.params, true);
}
