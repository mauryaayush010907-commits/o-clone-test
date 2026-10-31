/**
 * Minimal persistent-event-stream client. Mirrors the Socket.IO client API
 * surface used by the pages (on / emit-style send / status callbacks) so the
 * same page logic runs against the standalone backend's Socket.IO transport.
 *
 * Retries with exponential backoff, capped at 3 attempts — no infinite loops.
 */
export class RTClient {
  constructor({ onEvent, onStatus }) {
    this.connId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "c-" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.retries = 0;
    this.closed = false;
    this.abort = null;
    this.timer = null;
    this.buffer = "";
    this.status = "disconnected";
  }

  get online() {
    return this.status === "live";
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    if (this.onStatus) this.onStatus(s);
  }

  async connect() {
    if (this.closed) return;
    this.setStatus(this.retries > 0 ? "reconnecting" : "connecting");
    try {
      this.abort = new AbortController();
      const res = await fetch(`/api/events?connId=${encodeURIComponent(this.connId)}`, {
        headers: { accept: "text/event-stream" },
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) throw new Error("stream failed: " + res.status);
      this.retries = 0;
      this.setStatus("live");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += dec.decode(value, { stream: true });
        let idx;
        while ((idx = this.buffer.indexOf("\n\n")) >= 0) {
          const chunk = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          const parsed = this.parseChunk(chunk);
          if (parsed && this.onEvent) this.onEvent(parsed.event, parsed.data);
        }
      }
      throw new Error("stream ended");
    } catch (e) {
      if (this.closed) return;
      if (this.retries >= 3) {
        this.setStatus("failed");
        return;
      }
      this.retries += 1;
      this.setStatus("reconnecting");
      this.timer = setTimeout(() => this.connect(), Math.min(8000, 1000 * 2 ** this.retries));
    }
  }

  parseChunk(chunk) {
    let event = "message";
    const dataLines = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (!dataLines.length) return null;
    let data;
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      return null;
    }
    return { event, data };
  }

  async send(event, payload = {}) {
    if (this.closed || !this.online) return { ok: false, error: "disconnected" };
    try {
      const res = await fetch("/api/signaling", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connId: this.connId, event, payload }),
      });
      return await res.json();
    } catch (e) {
      console.warn("signaling request failed:", e?.message || e);
      return { ok: false, error: "network-error" };
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.abort) this.abort.abort();
    this.setStatus("disconnected");
  }
}

export function fmtClock(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
