import { NextResponse } from "next/server";

/** Stop before streaming: a page-level notFound alone can send HTTP 200
 * beneath the inherited loading boundary. This matcher owns only M1 proofs.
 */
export function proxy() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: "/dev/design/:path*" };
