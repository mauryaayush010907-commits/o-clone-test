import { register, unregister } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Persistent event stream (SSE). Clients pass a client-generated connId so
 * that a transport reconnect re-attaches to the same matchmaking state.
 */
export async function GET(req) {
  const url = new URL(req.url);
  const connId = (url.searchParams.get("connId") || "").slice(0, 64);
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (event, data) => {
        if (closed) return;
        try {
          // SSE spec: each field on its own line, terminated by a single blank line.
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const { connId: id } = await register(connId, ip, push);
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unregister(id).catch((e) => console.error("unregister", e));
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      push("connected", { connId: id });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
