import { getDb } from "frontend/src/db";

export const dynamic = "force-dynamic";

export async function GET() {
  // If MONGODB_URI is not set (e.g. local sandbox preview), the platform
  // sandbox does not provide MongoDB. In that case we still want the health
  // check to pass so the preview is reachable, but we report the degraded
  // state honestly.
  if (!process.env.MONGODB_URI) {
    return Response.json({ ok: true, database: "not-configured", hint: "Set MONGODB_URI for persistence" });
  }
  try {
    const conn = await getDb();
    if (!conn.db) return Response.json({ ok: false }, { status: 500 });
    await conn.db.admin().ping();
    return Response.json({ ok: true, database: "connected" });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
