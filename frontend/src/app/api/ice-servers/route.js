import { createHmac } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * STUN + optional TURN. Configure TURN_URL / TURN_USERNAME / TURN_PASSWORD
 * (or deploy the standalone backend, which also supports short-lived
 * Coturn REST-API credentials) to enable relaying for NATs that block P2P.
 */
export async function GET() {
  const stunUrls = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];
  const extra = (process.env.STUN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  stunUrls.push(...extra);

  const iceServers = [{ urls: stunUrls }];
  const configuredUrls = (process.env.TURN_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!configuredUrls.length && process.env.TURN_URL) {
    const turnUrl = process.env.TURN_URL.trim();
    configuredUrls.push(turnUrl);
    if (/^turn:/i.test(turnUrl) && !turnUrl.includes("?")) {
      configuredUrls.push(`${turnUrl}?transport=tcp`);
    }
  }
  if (configuredUrls.length) {
    try {
      const urls = [...new Set(configuredUrls.map(normalizeTurnUrl))];
      let username;
      let credential;
      if (process.env.TURN_USE_CONFIG === "true") {
        const secret = (process.env.TURN_STATIC_SECRET || "").trim();
        if (!secret) throw new Error("TURN_STATIC_SECRET is required when TURN_USE_CONFIG=true.");
        const expiry = Math.floor((Date.now() + 3600e3) / 1000);
        username = `${expiry}:${(process.env.TURN_INSTANCE || "drift").trim()}`;
        credential = createHmac("sha1", secret).update(username).digest("hex");
      } else {
        username = (process.env.TURN_USERNAME || "").trim();
        credential = (process.env.TURN_PASSWORD || "").trim();
        if (!username || !credential) {
          throw new Error("TURN_USERNAME and TURN_PASSWORD are required when TURN is configured.");
        }
      }
      iceServers.push({ urls, username, credential });
    } catch (error) {
      return Response.json(
        { ok: false, error: "turn-config-invalid", message: error.message },
        { status: 503 }
      );
    }
  }
  return Response.json({
    ok: true,
    iceServers,
    turnConfigured: iceServers.some((server) =>
      server.urls.some((url) => /^turns?:/i.test(url))
    ),
  });
}

function normalizeTurnUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const url = /^turns?:/i.test(raw) ? raw : `turn:${raw}`;
  const match = /^turn(s?):([^/?#]+)(?:\?([^#]*))?$/i.exec(url);
  if (!match || !match[2] || /[@\s]/.test(match[2])) {
    throw new Error("TURN_URLS must contain valid turn: or turns: URLs without embedded credentials.");
  }
  const isTls = match[1].toLowerCase() === "s";
  const params = new URLSearchParams(match[3] || "");
  const sensitiveKeys = new Set(["username", "password", "credential", "secret", "secretkey", "token"]);
  for (const [key] of params) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      throw new Error("TURN credentials must be configured as backend environment variables, not in URLs.");
    }
  }
  const transports = params.getAll("transport").map((transport) => transport.toLowerCase());
  if (transports.some((transport) => !["tcp", "udp"].includes(transport)) ||
      (isTls && transports.some((transport) => transport !== "tcp"))) {
    throw new Error("TURN URL transport must be supported by the TURN provider.");
  }
  return url;
}
