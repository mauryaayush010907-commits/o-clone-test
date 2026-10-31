import { stats } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = await stats();
    return Response.json({ ok: true, ...s, uptimeSec: Math.round(process.uptime()) });
  } catch (e) {
    console.error("stats error", e);
    return Response.json({ ok: false, online: 0, waiting: { video: 0, text: 0 }, activeMatches: 0 });
  }
}
