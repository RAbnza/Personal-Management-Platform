import { financialActionRequest } from "@/platform/http/financial-corrections";
export function POST(
  request: Request,
  context: { params: Promise<{ actionId: string }> },
) {
  return financialActionRequest(request, context, "correct");
}
