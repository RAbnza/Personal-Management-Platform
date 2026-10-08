import { financialActionRequest } from "@/platform/http/financial-corrections";
export function GET(
  request: Request,
  context: { params: Promise<{ actionId: string }> },
) {
  return financialActionRequest(request, context, "detail");
}
