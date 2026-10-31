/**
 * Real-time core for the sandbox preview runtime.
 *
 * MongoDB is the source of truth: connections, preferences, and matches
 * are all persisted in Mongoose models (with TTL indexes for cleanup). The
 * local `sockets` map holds only the live push callbacks (the SSE push
 * functions) so the engine can deliver events without a polling loop.
 *
 * Event contract (client -> server via POST /api/signaling):
 *   match:find {mode, prefs?} | match:expand | match:cancel
 *   match:next {matchId} | match:stop {matchId}
 *   webrtc:offer {matchId, sdp, retry?} | webrtc:answer {matchId, sdp}
 *   webrtc:ice-candidate {matchId, candidate}
 *   chat:message {matchId, text} | chat:typing {matchId} | user:report {matchId, reason, details}
 *
 * (server -> client over the SSE stream):
 *   connected {connId} | match:queued {mode, position, refined}
 *   match:found {matchId, role, mode} | match:cancelled | match:ended {matchId, reason}
 *   match:expanding {mode} | webrtc:offer / webrtc:answer / webrtc:ice-candidate
 *   chat:message {matchId, messageId, from, text, ts} | chat:typing {matchId}
 *   user:report-ack | user:reported | error {code, message}
 */

import { randomUUID } from "node:crypto";
import { sanitizePrefs, activeCount, emptyPrefs, pairCompatible, profileOf, filtersOf } from "../../../src/lib/prefs.js";
import { getDb } from "@/db";
import { getModels } from "@/db/models";

const MODES = ["video", "text"];
const MAX_MSG = 500;
const CHAT_BURST = 6;
const CHAT_WINDOW_MS = 2000;
const PREFS_PATIENCE_MS = 25000;
const SESSION_TTL_MS = 10 * 60e3; // matches MatchSchema TTL
const EMPTY_FILTERS = { countries: [], gender: null, interests: [] };

/* -----------------------------------------------------------------------
 *  In-memory push cache: holds only the live SSE push function per connId.
 *  Connection/mode/match state lives in MongoDB and survives restarts.
 * --------------------------------------------------------------------- */
const G = globalThis;
function sockets() {
  if (!G.__drift_sockets) G.__drift_sockets = new Map(); // connId -> { push, ip, chatLog, reports, expandTimer, typingAt, typingRevision }
  return G.__drift_sockets;
}
function seq() {
  if (G.__drift_seq === undefined) G.__drift_seq = Math.floor(Math.random() * 1e6);
  return G.__drift_seq;
}
function nextId() {
  G.__drift_seq = (G.__drift_seq || 0) + 1;
  return "m" + G.__drift_seq.toString(36) + Date.now().toString(36).slice(-4);
}

async function models() {
  await getDb();
  return getModels();
}

export async function stats() {
  const { Conn, Match } = await models();
  const [online, video, text, activeMatches] = await Promise.all([
    Conn.countDocuments({ lastSeenAt: { $gt: new Date(Date.now() - 60e3) } }),
    Conn.countDocuments({ state: "queued", mode: "video" }),
    Conn.countDocuments({ state: "queued", mode: "text" }),
    Match.countDocuments({}),
  ]);
  return { online, waiting: { video, text }, activeMatches };
}

const effFilters = (c) => (c.expanded ? EMPTY_FILTERS : filtersOf(c.prefs || emptyPrefs()));

/* -----------------------------------------------------------------------
 *  Helpers
 * --------------------------------------------------------------------- */
async function push(connId, event, data) {
  const s = sockets().get(connId);
  if (!s) return false;
  s.push(event, data);
  return true;
}

function peerOf(match, connId) {
  if (match.a === connId) return match.b;
  if (match.b === connId) return match.a;
  return null;
}

async function endMatch(matchId, reason) {
  const { Conn, Match } = await models();
  const m = await Match.findOneAndDelete({ matchId });
  if (!m) return null;
  const clear = { state: "idle", matchId: null, expanded: false };
  await Conn.updateMany({ connId: { $in: [m.a, m.b] } }, { $set: clear });
  for (const id of [m.a, m.b]) {
    const s = sockets().get(id);
    if (s && s.expandTimer) {
      clearTimeout(s.expandTimer);
      s.expandTimer = null;
    }
    await push(id, "match:ended", { matchId, reason });
  }
  return m;
}

function loadConnMemory(connId) {
  const s = sockets().get(connId);
  if (!s) return { chatLog: [], reports: [], typingAt: 0, typingRevision: 0, expandTimer: null };
  return s;
}

/* -----------------------------------------------------------------------
 *  Matchmaking: scan the queued connections in FIFO order, find the first
 *  one whose filters are mutually satisfied. Atomically claim by updating
 *  both records to "matched" so concurrent requests can't double-match.
 * --------------------------------------------------------------------- */
async function tryMatch(connId, mode) {
  const { Conn } = await models();
  const me = await Conn.findOne({ connId });
  if (!me || me.state !== "queued") return null;
  const meF = effFilters({ prefs: me.prefs, expanded: !!me.expanded });
  const meP = profileOf(me.prefs || emptyPrefs());

  // FIFO scan: order by createdAt
  const waiters = await Conn.find({ state: "queued", mode, connId: { $ne: connId } })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  for (const w of waiters) {
    if (sockets().get(w.connId) == null) continue; // stale (no live push handle)
    const wF = effFilters({ prefs: w.prefs, expanded: !!w.expanded });
    const wP = profileOf(w.prefs || emptyPrefs());
    if (!pairCompatible(meF, meP, wF, wP)) continue;

    // Atomic claim: only succeed if BOTH records are still "queued"
    const claimA = await Conn.updateOne(
      { connId: w.connId, state: "queued" },
      { $set: { state: "matched", matchId: null } }
    );
    if (claimA.modifiedCount !== 1) continue;
    const claimB = await Conn.updateOne(
      { connId, state: "queued" },
      { $set: { state: "matched", matchId: null } }
    );
    if (claimB.modifiedCount !== 1) {
      // rollback
      await Conn.updateOne({ connId: w.connId }, { $set: { state: "queued", matchId: null } });
      continue;
    }
    const matchId = nextId();
    await Conn.updateOne({ connId: w.connId }, { $set: { matchId } });
    await Conn.updateOne({ connId }, { $set: { matchId } });
    const { Match } = await models();
    await Match.create({ matchId, a: w.connId, b: connId, mode, ts: new Date() });
    const s = loadConnMemory(w.connId);
    if (s.expandTimer) {
      clearTimeout(s.expandTimer);
      s.expandTimer = null;
    }
    const s2 = loadConnMemory(connId);
    if (s2.expandTimer) {
      clearTimeout(s2.expandTimer);
      s2.expandTimer = null;
    }
    await push(w.connId, "match:found", { matchId, role: "offerer", mode });
    await push(connId, "match:found", { matchId, role: "answerer", mode });
    return matchId;
  }
  return null;
}

async function doExpand(connId) {
  const { Conn } = await models();
  const me = await Conn.findOne({ connId });
  if (!me || me.state !== "queued" || me.expanded) return;
  await Conn.updateOne({ connId }, { $set: { expanded: true } });
  const s = loadConnMemory(connId);
  if (s.expandTimer) {
    clearTimeout(s.expandTimer);
    s.expandTimer = null;
  }
  await push(connId, "match:expanding", { mode: me.mode });
  await tryMatch(connId, me.mode);
}

/* -----------------------------------------------------------------------
 *  Registration (SSE connect)
 * --------------------------------------------------------------------- */
export async function register(connId, ip, pushFn) {
  // accept any 4-64 char client-supplied connId; generate one if absent/too short
  const id =
    typeof connId === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(connId)
      ? connId
      : "c" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

  // store the push handle (always — even on first connect)
  const existing = sockets().get(id);
  if (existing) {
    existing.push = pushFn;
    existing.ip = ip || existing.ip;
  } else {
    sockets().set(id, {
      push: pushFn,
      ip,
      chatLog: [],
      reports: [],
      typingAt: 0,
      typingRevision: 0,
      expandTimer: null,
    });
  }

  // upsert the connection record (resume-safe across restarts)
  const { Conn } = await models();
  await Conn.findOneAndUpdate(
    { connId: id },
    { $set: { ip: ip || null, lastSeenAt: new Date() }, $setOnInsert: { connId: id, state: "idle", prefs: emptyPrefs(), expanded: false, lastFindAt: 0, createdAt: new Date() } },
    { upsert: true, new: true }
  );
  return { connId: id, resumed: !!existing };
}

export async function unregister(connId) {
  const s = sockets().get(connId);
  if (!s) return;
  if (s.expandTimer) clearTimeout(s.expandTimer);
  sockets().delete(connId);
  try {
    const { Conn, Match } = await models();
    const me = await Conn.findOne({ connId });
    if (me?.state === "queued" && me.mode) {
      // already removed from the queue by transition to "matched" or by sweeper;
      // if still queued (race), drop it here
      await Conn.updateOne({ connId, state: "queued" }, { $set: { state: "idle", mode: null } });
    }
    if (me?.matchId) {
      await endMatch(me.matchId, "disconnected");
    } else {
      await Conn.deleteOne({ connId });
    }
  } catch (e) {
    console.error("unregister error", e);
  }
}

export async function isConnected(connId) {
  return sockets().has(connId);
}

/* -----------------------------------------------------------------------
 *  Event dispatcher
 * --------------------------------------------------------------------- */
export async function handle(connId, event, payload, ip) {
  if (typeof connId !== "string" || connId.length > 64) return { ok: false, error: "bad-conn" };
  if (!sockets().has(connId)) return { ok: false, error: "not-connected" };
  const P = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const matchId = typeof P.matchId === "string" ? P.matchId.slice(0, 64) : null;
  const s = sockets().get(connId);
  const typingRevision = event === "chat:typing" || event === "chat:message"
    ? (s.typingRevision = (s.typingRevision || 0) + 1)
    : null;
  const { Conn, Match } = await models();
  const me = await Conn.findOne({ connId });

  if (!me) return { ok: false, error: "not-connected" };
  await Conn.updateOne({ connId }, { $set: { lastSeenAt: new Date() } });

  const matchOf = async (id) => {
    if (!id) return null;
    const m = await Match.findOne({ matchId: id });
    if (!m) return null;
    return m.a === connId || m.b === connId ? m : null;
  };
  const resetTyping = () => {
    s.typingAt = 0;
    s.typingRevision = (s.typingRevision || 0) + 1;
  };

  switch (event) {
    case "match:find": {
      if (!MODES.includes(P.mode)) return { ok: false, error: "bad-mode" };
      if (me.state === "matched") return { ok: false, error: "already-matched" };
      if (me.state === "queued") return { ok: true, queued: true };
      const now = Date.now();
      if (now - (me.lastFindAt || 0) < 1500) return { ok: false, error: "too-fast" };
      resetTyping();
      const prefs = sanitizePrefs(P.prefs);
      await Conn.updateOne(
        { connId },
        { $set: { state: "queued", mode: P.mode, prefs, expanded: false, lastFindAt: now } }
      );
      if (s.expandTimer) {
        clearTimeout(s.expandTimer);
        s.expandTimer = null;
      }
      const matched = await tryMatch(connId, P.mode);
      if (!matched) {
        const refined = activeCount(prefs) > 0;
        const position = await Conn.countDocuments({ state: "queued", mode: P.mode });
        await push(connId, "match:queued", { mode: P.mode, position, refined });
        if (refined) {
          s.expandTimer = setTimeout(() => doExpand(connId).catch((e) => console.warn("auto-expand", e)), PREFS_PATIENCE_MS);
        }
      }
      return { ok: true, queued: !matched };
    }

    case "match:expand": {
      if (me.state === "queued") await doExpand(connId);
      return { ok: true };
    }

    case "match:cancel": {
      if (me.state === "queued" && me.mode) {
        await Conn.updateOne({ connId, state: "queued" }, { $set: { state: "idle", mode: null, expanded: false } });
        if (s.expandTimer) {
          clearTimeout(s.expandTimer);
          s.expandTimer = null;
        }
        await push(connId, "match:cancelled", {});
      }
      return { ok: true };
    }

    case "match:next": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      resetTyping();
      await endMatch(matchId, "next");
      return { ok: true };
    }

    case "match:stop": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      resetTyping();
      await endMatch(matchId, "stopped");
      return { ok: true };
    }

    case "webrtc:offer": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      if (m.a !== connId) return { ok: false, error: "bad-signaling-role" };
      if (typeof P.sdp !== "string" || P.sdp.length === 0 || P.sdp.length > 65536) {
        return { ok: false, error: "bad-sdp" };
      }
      const attempt = P.attempt === undefined ? (P.retry === true ? 1 : 0) : P.attempt;
      if (!Number.isInteger(attempt) || attempt < 0 || attempt > 2) {
        return { ok: false, error: "bad-attempt" };
      }
      const peer = peerOf(m, connId);
      await push(peer, "webrtc:offer", { matchId, sdp: P.sdp, attempt, retry: !!P.retry });
      return { ok: true };
    }

    case "webrtc:answer": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      if (m.b !== connId) return { ok: false, error: "bad-signaling-role" };
      if (typeof P.sdp !== "string" || P.sdp.length === 0 || P.sdp.length > 65536) {
        return { ok: false, error: "bad-sdp" };
      }
      const attempt = P.attempt === undefined ? 0 : P.attempt;
      if (!Number.isInteger(attempt) || attempt < 0 || attempt > 2) {
        return { ok: false, error: "bad-attempt" };
      }
      const peer = peerOf(m, connId);
      await push(peer, "webrtc:answer", { matchId, sdp: P.sdp, attempt });
      return { ok: true };
    }

    case "webrtc:ice-candidate": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      const cand = P.candidate;
      if (cand !== null && (
        typeof cand !== "object" ||
        Array.isArray(cand) ||
        typeof cand.candidate !== "string" ||
        cand.candidate.length > 2048 ||
        JSON.stringify(cand).length > 4096
      )) {
        return { ok: false, error: "bad-ice" };
      }
      const attempt = P.attempt === undefined ? 0 : P.attempt;
      if (!Number.isInteger(attempt) || attempt < 0 || attempt > 2) {
        return { ok: false, error: "bad-attempt" };
      }
      const peer = peerOf(m, connId);
      await push(peer, "webrtc:ice-candidate", { matchId, candidate: cand, attempt });
      return { ok: true };
    }

    case "chat:message": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      const text = typeof P.text === "string" ? P.text.trim() : "";
      if (!text || text.length > MAX_MSG) return { ok: false, error: "bad-message" };
      const now = Date.now();
      s.chatLog = (s.chatLog || []).filter((t) => now - t < CHAT_WINDOW_MS);
      if (s.chatLog.length >= CHAT_BURST) {
        await push(connId, "error", { code: "chat-limited", message: "You are sending messages too quickly." });
        return { ok: false, error: "chat-limited" };
      }
      s.chatLog.push(now);
      s.typingAt = 0;
      const peer = peerOf(m, connId);
      const message = { matchId, messageId: randomUUID(), from: connId, text, ts: now, typingRevision };
      if (!(await push(peer, "chat:message", message))) {
        return { ok: false, error: "peer-disconnected" };
      }
      await push(connId, "chat:message", message);
      return { ok: true, messageId: message.messageId, ts: now };
    }

    case "chat:typing": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      const typing = P.typing !== false;
      const now = Date.now();
      if (typing) {
        if (now - (s.typingAt || 0) < 800) return { ok: true, dropped: true };
        s.typingAt = now;
      } else {
        s.typingAt = 0;
      }
      if (typingRevision !== s.typingRevision) return { ok: true, dropped: true };
      const peer = peerOf(m, connId);
      await push(peer, "chat:typing", { matchId, typing, typingRevision });
      return { ok: true, typing };
    }

    case "user:report": {
      const m = await matchOf(matchId);
      if (!m) return { ok: false, error: "no-match" };
      const reason = typeof P.reason === "string" && P.reason.length >= 2 ? P.reason.slice(0, 40) : "abuse";
      const details = typeof P.details === "string" ? P.details.slice(0, 500) : "";
      const now = Date.now();
      s.reports = (s.reports || []).filter((t) => now - t < 3600e3);
      if (s.reports.length >= 3) return { ok: false, error: "report-limited" };
      s.reports.push(now);
      const peer = peerOf(m, connId);
      const reportedIp = sockets().get(peer) ? sockets().get(peer).ip : null;
      await push(connId, "user:report-ack", { matchId });
      await push(peer, "user:reported", { matchId });
      return { ok: true, persistReport: { reason, details, reporterIp: ip || s.ip, reportedIp, matchId } };
    }

    default:
      return { ok: false, error: "unknown-event" };
  }
}
