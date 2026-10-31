import { createHash } from "crypto";
import { getDb } from "@/db";
import { getModels } from "@/db/models";
import { handle } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SALT = "drift-sandbox-v1";
const hashIp = (ip) => createHash("sha256").update(`${ip || "unknown"}|${SALT}`).digest("hex");

export async function POST(req) {
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad-json" }, { status: 400 });
  }
  const { connId, event, payload } = body || {};
  if (typeof connId !== "string" || connId.length > 64 || typeof event !== "string" || event.length > 40) {
    return Response.json({ ok: false, error: "bad-payload" }, { status: 400 });
  }

  let res;
  try {
    res = await handle(connId, event, payload, ip);
  } catch (e) {
    console.error("handle error", e);
    return Response.json({ ok: false, error: "server-error" }, { status: 500 });
  }
  if (!res.ok) {
    return Response.json({ ok: false, error: res.error }, { status: 409 });
  }

  if (res.persistReport) {
    try {
      await getDb();
      const { Report } = getModels();
      const { reason, details, reporterIp, reportedIp, matchId } = res.persistReport;
      const since = new Date(Date.now() - 3600e3);
      const recent = await Report.find({ reporterHash: hashIp(reporterIp), createdAt: { $gt: since } })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      if (recent.length >= 5) {
        return Response.json({ ok: false, error: "report-limited" }, { status: 429 });
      }
      await Report.create({
        reason,
        details: details || null,
        reporterHash: hashIp(reporterIp),
        reportedHash: hashIp(reportedIp || "unknown"),
        matchId: matchId || null,
        status: "pending",
      });
    } catch (err) {
      console.error("report insert failed", err);
    }
  }

  return Response.json({ ok: true });
}
