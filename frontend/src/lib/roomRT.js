import { io } from "socket.io-client";

/**
 * Socket.IO realtime client for private rooms.
 *
 * Same shape as `rt.js` (SocketRT) but speaks the room:* event contract
 * documented in `backend/src/socket.js` and `backend/src/sfu.js`:
 *
 *   out  : username:set | room:create | room:request-join | room:cancel-request
 *          | room:accept | room:reject | room:lock | room:remove | room:close
 *          | room:join | room:leave | webrtc:offer | webrtc:answer | webrtc:ice
 *          | room:chat | room:status
 *   in   : room:join-request | room:join-accepted | room:join-rejected |
 *          room:removed | room:closed | room:peers | room:peer-joined |
 *          room:peer-left | room:lock-changed | room:chat | room:status |
 *          webrtc:offer | webrtc:answer | webrtc:ice | error
 *
 * Retries with exponential backoff, capped at 3 attempts. No infinite loop.
 */
export class RoomRT {
  constructor({ onEvent, onStatus }) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.status = "disconnected";
    this.retries = 0;
    this.closed = false;
    this.timer = null;
    this.socket = null;
    this.hasConnected = false;
    queueMicrotask(() => this._connect());
  }

  get online() { return this.status === "live"; }

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
      transports: ["polling", "websocket"],
      reconnection: false,
      timeout: 8000,
    };
   const backendUrl =
  url ||
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  "http://localhost:10000";

const socket = io(backendUrl, opts);
this.socket = socket;

    socket.onAny((ev, data) => {
      if (typeof ev !== "string") return;
      if (ev === "connect" || ev === "disconnect" || ev === "connect_error") return;
      if (ev.endsWith(":ok")) return;
      if (this.onEvent) this.onEvent(ev, data);
    });
    socket.on("connect", () => {
      if (this.hasConnected && import.meta.env.DEV) {
        console.debug("Private-room Socket.IO reconnected", { socketId: socket.id });
      }
      this.hasConnected = true;
      this.retries = 0;
      this.setStatus("live");
    });
    socket.on("connect_error", (e) => {
      console.warn("room socket connect_error:", e && e.message);
      socket.close();
      if (this.closed) return;
      if (this.retries >= 3) { this.setStatus("failed"); return; }
      this.retries += 1;
      this.timer = setTimeout(() => this._connect(), Math.min(8000, 1000 * 2 ** this.retries));
    });
    socket.on("disconnect", () => {
      if (this.closed) return;
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

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.socket) this.socket.close();
    this.socket = null;
    this.setStatus("disconnected");
  }
}
