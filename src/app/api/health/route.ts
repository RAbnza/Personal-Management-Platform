import { getAuthPool, getDomainPool } from "@/platform/db/pools";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await Promise.all([
      getDomainPool().query(
        "SELECT id,current_schedule_version_id FROM finance.debt WHERE false",
      ),
      getAuthPool().query(
        "SELECT id,status,key_id FROM ops.email_delivery WHERE false",
      ),
      getAuthPool().query("SELECT version FROM pgboss.version"),
    ]);
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
