import { io } from "socket.io-client";

/**
 * Socket.IO realtime client wrapper.
 * Same event contract as the backend's signaling layer:
 *   out: match:find | match:cancel | match:next | match:stop | webrtc:offer |
 *        webrtc:answer | webrtc:ice-candidate | chat:message | chat:typing |
 *        user:report | ping
 *   in:  connected state via status callback + match:queued | match:found |
 *        match:cancelled | match:ended | webrtc:* | chat:* | user:* | error
 *
 * Retries with exponential backoff, capped at 3 — no infinite reconnection loops.
 */
export class SocketRT {
  constructor({ onEvent, onStatus }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.status = "disconnected";
    this.retries = 0;
    this.closed = false;
    this.timer = null;
    this.socket = null;
    this._connect();
  }

  get online() {
    return this.status === "live";
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    if (this.onStatus) this.onStatus(s);
  }

  _connect() {
    if (this.closed) return;
    this.setStatus(this.retries ? "reconnecting" : "connecting");
    const url = (import.meta.env.VITE_SOCKET_URL || "").replace(/\/+$/, "");
    const opts = {
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 8000,
    };
    const socket = url ? io(url, opts) : io(opts);
    this.socket = socket;

    socket.onAny((ev, data) => {
      if (typeof ev !== "string") return;
      if (ev === "connect" || ev === "disconnect" || ev === "connect_error") return;
      if (ev.endsWith(":ok")) return; // server acks handled via emit callbacks
      if (this.onEvent) this.onEvent(ev, data);
    });
    socket.on("connect", () => {
      this.retries = 0;
      this.setStatus("live");
    });
    socket.on("connect_error", (e) => {
      console.warn("socket connect_error:", e && e.message);
      socket.close();
      if (this.closed) return;
      if (this.retries >= 3) {
        this.setStatus("failed");
        return;
      }
      this.retries += 1;
      this.timer = setTimeout(() => this._connect(), Math.min(8000, 1000 * 2 ** this.retries));
    });
    socket.on("disconnect", () => {
      if (this.closed) return;
      // unexpected server-side drop: schedule reconnect through the same backoff
      if (this.status === "live") {
        this.setStatus("reconnecting");
        this.retries = 0;
        this.timer = setTimeout(() => this._connect(), 1000);
      }
    });
  }

  send(event, payload = {}) {
    if (this.socket) this.socket.emit(event, payload);
  }

  sendWithAck(event, payload = {}) {
    if (!this.socket?.connected) return Promise.resolve({ ok: false, error: "disconnected" });
    return new Promise((resolve) => {
      this.socket.timeout(5000).emit(event, payload, (error, response) => {
        resolve(error ? { ok: false, error: "timeout" } : response);
      });
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.socket) this.socket.close();
    this.socket = null;
    this.setStatus("disconnected");
  }
}

/* ---------------- API helpers ---------------- */
const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export async function getIceServers() {
  const res = await fetch(`${API}/api/ice-servers`);
  const j = await res.json();
  if (!res.ok || j?.ok !== true || !Array.isArray(j.iceServers) || !j.iceServers.length) {
    throw new Error(j?.message || `ICE server configuration unavailable (HTTP ${res.status}).`);
  }
  const hasStun = j.iceServers.some((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => typeof url === "string" && /^stun:/i.test(url))
  );
  const invalidTurn = j.iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => typeof url === "string" && /^turns?:/i.test(url)) &&
      (typeof server.username !== "string" || !server.username ||
        typeof server.credential !== "string" || !server.credential);
  });
  if (!hasStun || invalidTurn) {
    throw new Error("ICE server configuration is invalid. Configure a valid STUN server and authenticated TURN credentials.");
  }
  return j.iceServers;
}

export async function getStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const j = await res.json();
    if (j && j.ok) return { online: j.online, waiting: j.waiting, activeMatches: j.activeMatches };
  } catch {
    /* backend offline — keep last values */
  }
  return null;
}

export function fmtClock(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
