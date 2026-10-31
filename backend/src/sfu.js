/**
 * SFU signaling relay for private rooms.
 *
 * Scope: this module ONLY carries the WebRTC control-plane (SDP offers,
 * SDP answers, ICE candidates) between authorized members of a private
 * room. It does NOT carry any audio or video bytes — those flow directly
 * between the participants' browsers via STUN/TURN.
 *
 * Why a relay at all?
 *   For 5 participants, a true SFU (e.g. mediasoup, LiveKit) is the
 *   production-grade choice. We don't ship one here because doing so
 *   would require an additional C++ build + a separate service to deploy.
 *   Instead, this server:
 *     - authorizes every signaling message against room membership,
 *     - forwards offers/answers/ice between members,
 *     - emits a "peer-joined" event so existing participants renegotiate
 *       with the new member.
 *
 *   This works for 2-person rooms without any change (the existing
 *   random-video flow already does this directly through Socket.IO).
 *   For 3–5 members, the client does a "full mesh" — every member
 *   sends an offer to every other member, which costs O(N²) connections
 *   per client. For N=5 that's 4 peer connections per client, which is
 *   acceptable on modern networks.
 *
 * Upgrade path:
 *   When traffic warrants, replace this file with a real SFU:
 *     1. Run a LiveKit / mediasoup process alongside the Node backend.
 *     2. The server mints short-lived JWTs for each approved member
 *        (using a signing key from the SFU, not the frontend) and
 *        returns them via the "room:join-token" event.
 *     3. The client connects directly to the SFU; the Node backend
 *        stops relaying SDP/ICE entirely. Application events (chat,
 *        host controls) continue to flow through this Socket.IO server.
 *
 * Threat model (server-enforced):
 *   - Every event carries a `roomId` and `to` (or `to:null` for fan-out).
 *   - Membership is looked up server-side; forged events are dropped.
 *   - ICE/SDP payloads are size-capped.
 */
import { randomBytes } from "crypto";

const SDP_MAX = 64 * 1024;     // 64 KB per SDP payload
const ICE_MAX = 4 * 1024;      // 4 KB per ICE candidate
const ROOM_NAMESPACE_PREFIX = "room:"; // Socket.IO room name = "room:<code>"

export function attachSFU({ io, rooms, log, cfg }) {
  // ----- Authorization cache: socketId -> { roomId, isHost } -----
  // We mirror the room membership on the server side so a single lookup
  // tells us whether a socket is in a room and what role it has.
  const sessionBySocket = new Map();
  const sessionByRoom = new Map(); // roomId -> Set<socketId>

  function joinSession(socketId, roomId, isHost) {
    sessionBySocket.set(socketId, { roomId, isHost });
    if (!sessionByRoom.has(roomId)) sessionByRoom.set(roomId, new Set());
    sessionByRoom.get(roomId).add(socketId);
  }
  function leaveSession(socketId) {
    const s = sessionBySocket.get(socketId);
    if (!s) return null;
    sessionBySocket.delete(socketId);
    sessionByRoom.get(s.roomId)?.delete(socketId);
    return s;
  }
  async function forgetPeer(roomId, socketId) {
    const session = getSession(socketId);
    if (!session || session.roomId !== roomId) return false;
    leaveSession(socketId);
    const socket = io.sockets.sockets.get(socketId);
    if (socket) await socket.leave(roomName(roomId));
    return true;
  }
  async function cleanupRoom(roomId) {
    for (const socketId of roomMembers(roomId)) await forgetPeer(roomId, socketId);
  }
  function getSession(socketId) {
    return sessionBySocket.get(socketId) || null;
  }
  function roomMembers(roomId) {
    return [...(sessionByRoom.get(roomId) || [])];
  }
  const roomName = (roomId) => ROOM_NAMESPACE_PREFIX + roomId;

  async function isActiveMember(socketId, roomId) {
    const session = getSession(socketId);
    const connectedSocket = io.sockets.sockets.get(socketId);
    if (!session || session.roomId !== roomId || !connectedSocket?.connected ||
      !connectedSocket.rooms.has(roomName(roomId))) {
      return false;
    }
    const members = await (cfg.storeRef ? cfg.storeRef() : null)?.roomGetMembers?.(roomId);
    return !!members?.members.has(socketId);
  }

  async function isActiveRecipient(socketId, roomId) {
    const members = await (cfg.storeRef ? cfg.storeRef() : null)?.roomGetMembers?.(roomId);
    if (!members?.members.has(socketId)) return false;
    const sockets = await io.in(socketId).fetchSockets();
    if (!sockets.some((remoteSocket) => remoteSocket.rooms.has(roomName(roomId)))) return false;
    const currentMembers = await (cfg.storeRef ? cfg.storeRef() : null)?.roomGetMembers?.(roomId);
    return !!currentMembers?.members.has(socketId);
  }

  async function relay(event, socket, roomId, to, payload, ack) {
  const invalidRoom =
    typeof roomId !== "string" ||
    !roomId ||
    roomId.length > 64;

  const invalidPeer =
    typeof to !== "string" ||
    !to ||
    to === socket.id;

  if (invalidRoom || invalidPeer) {
    log.warn("WebRTC relay rejected: invalid room or peer", {
      event,
      socketId: socket.id,
      roomIdType: typeof roomId,
      roomIdLength:
        typeof roomId === "string" ? roomId.length : null,
      targetType: typeof to,
      targetMissing: !to,
      selfTarget: to === socket.id,
      invalidRoom,
      invalidPeer,
    });

    return ack?.({
      ok: false,
      error: "bad-room-or-peer",
    });
  }

  try {
    // Verify sender belongs to the active room.
    if (!(await isActiveMember(socket.id, roomId))) {
      log.debug("WebRTC signal rejected", {
        event,
        roomId,
        socketId: socket.id,
        code: "not-in-room",
      });

      return ack?.({
        ok: false,
        error: "not-in-room",
      });
    }

    // Verify the intended recipient belongs to the same room.
    if (!(await isActiveRecipient(to, roomId))) {
      log.debug("WebRTC signal rejected", {
        event,
        roomId,
        socketId: socket.id,
        code: "peer-not-in-room",
      });

      return ack?.({
        ok: false,
        error: "peer-not-in-room",
      });
    }

    // Recheck sender membership after asynchronous validation.
    if (!(await isActiveMember(socket.id, roomId))) {
      return ack?.({
        ok: false,
        error: "not-in-room",
      });
    }

    io.to(to).emit(event, {
      from: socket.id,
      roomId,
      ...payload,
    });

    ack?.({ ok: true });

    if (!cfg.isProd) {
      log.debug("WebRTC signal forwarded", {
        event,
        roomId,
        socketId: socket.id,
        to,
      });
    }
  } catch (error) {
    log.warn("WebRTC relay failed", {
      event,
      socketId: socket.id,
      error: error.message,
    });

    ack?.({
      ok: false,
      error: "internal",
    });
  }
}

  // ----- Join a private room (Socket.IO) -----
  // Called from socket.js after the room manager has authorized the socket
  // (i.e. the host created the room, or the request was accepted).
  io.on("connection", (socket) => {
    socket.on("room:join", async ({ roomId, isHost }, ack) => {
      try {
        let m = await (cfg.storeRef ? cfg.storeRef() : null)?.roomGetMembers?.(roomId);
        if (!m) return ack?.({ ok: false, error: "not-found" });
        if (isHost && m.host !== socket.id) return ack?.({ ok: false, error: "not-host" });
        if (!isHost && !m.members.has(socket.id)) {
          return ack?.({ ok: false, error: "not-a-member" });
        }
        const existing = getSession(socket.id);
        if (existing && existing.roomId !== roomId) {
          return ack?.({ ok: false, error: "already-in-room" });
        }
        const alreadyJoined = existing?.roomId === roomId && socket.rooms.has(roomName(roomId));
        // Do not acknowledge the room until the adapter has registered it.
        await socket.join(roomName(roomId));
        m = await (cfg.storeRef ? cfg.storeRef() : null)?.roomGetMembers?.(roomId);
        const stillAuthorized = isHost ? m?.host === socket.id : m?.members.has(socket.id);
        if (!socket.connected || !stillAuthorized) {
          await socket.leave(roomName(roomId));
          return ack?.({ ok: false, error: "not-a-member" });
        }
        joinSession(socket.id, roomId, isHost);
        // Tell the joiner who else is in the room.
        const others = [];
        for (const [sid, entry] of m.members) {
          if (sid === socket.id) continue;
          others.push({ socketId: sid, username: entry.username, isHost: !!entry.isHost });
        }
        // Tell the others about the new joiner.
        if (!alreadyJoined) {
          socket.to(roomName(roomId)).emit("room:peer-joined", {
            roomId,
            socketId: socket.id,
            username: socket.data?.username || null,
            isHost,
          });
        }
        if (!cfg.isProd) {
          log.debug("private room join completed", { roomId, socket: socket.id, isHost });
        }
        ack?.({ ok: true, self: { socketId: socket.id, isHost }, others, host: m.host });
      } catch (e) {
        log.warn("room:join failed", { err: e.message });
        ack?.({ ok: false, error: "internal" });
      }
    });

    // ----- Signaling relay (mesh) -----
    socket.on("webrtc:offer", async (data = {}, ack) => {
      const signal = data && typeof data === "object" ? data : {};
      if (!Object.prototype.hasOwnProperty.call(signal, "roomId")) {
        if (!cfg.isProd) {
          log.debug("WebRTC signaling handler skipped", {
            event: "webrtc:offer",
            feature: typeof signal.matchId === "string" ? "random-match" : "unclassified",
            payloadKeys: Object.keys(signal),
            matchId: signal.matchId,
            socketId: socket.id,
            selectedHandler: "socket.js random-match dispatcher",
          });
        }
        return;
      }
      const { to, sdp, roomId } = signal;
      if (!cfg.isProd) {
        log.debug("WebRTC signaling handler selected", {
          event: "webrtc:offer",
          feature: "private-room",
          payloadKeys: Object.keys(signal),
          roomId,
          socketId: socket.id,
          selectedHandler: "sfu.js private-room relay",
        });
      }
      if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > SDP_MAX) {
        return ack?.({ ok: false, error: "bad-sdp" });
      }
      await relay("webrtc:offer", socket, roomId, to, { sdp }, ack);
    });
    socket.on("webrtc:answer", async (data = {}, ack) => {
      const signal = data && typeof data === "object" ? data : {};
      if (!Object.prototype.hasOwnProperty.call(signal, "roomId")) {
        if (!cfg.isProd) {
          log.debug("WebRTC signaling handler skipped", {
            event: "webrtc:answer",
            feature: typeof signal.matchId === "string" ? "random-match" : "unclassified",
            payloadKeys: Object.keys(signal),
            matchId: signal.matchId,
            socketId: socket.id,
            selectedHandler: "socket.js random-match dispatcher",
          });
        }
        return;
      }
      const { to, sdp, roomId } = signal;
      if (!cfg.isProd) {
        log.debug("WebRTC signaling handler selected", {
          event: "webrtc:answer",
          feature: "private-room",
          payloadKeys: Object.keys(signal),
          roomId,
          socketId: socket.id,
          selectedHandler: "sfu.js private-room relay",
        });
      }
      if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > SDP_MAX) {
        return ack?.({ ok: false, error: "bad-sdp" });
      }
      await relay("webrtc:answer", socket, roomId, to, { sdp }, ack);
    });
    socket.on("webrtc:ice", async (data = {}, ack) => {
      const signal = data && typeof data === "object" ? data : {};
      if (!Object.prototype.hasOwnProperty.call(signal, "roomId")) {
        if (!cfg.isProd) {
          log.debug("WebRTC signaling handler selected", {
            event: "webrtc:ice",
            feature: "private-room",
            payloadKeys: Object.keys(signal),
            matchId: signal.matchId,
            socketId: socket.id,
            selectedHandler: "sfu.js private-room relay (validation)",
          });
        }
        return relay("webrtc:ice", socket, signal.roomId, signal.to, { candidate: signal.candidate }, ack);
      }
      const { to, candidate, roomId } = signal;
      if (!cfg.isProd) {
        log.debug("WebRTC signaling handler selected", {
          event: "webrtc:ice",
          feature: "private-room",
          payloadKeys: Object.keys(signal),
          roomId,
          socketId: socket.id,
          selectedHandler: "sfu.js private-room relay",
        });
      }
      if (!candidate || typeof candidate !== "object" || JSON.stringify(candidate).length > ICE_MAX) {
        return ack?.({ ok: false, error: "bad-ice" });
      }
      await relay("webrtc:ice", socket, roomId, to, { candidate }, ack);
    });

    // ----- In-room chat -----
    socket.on("room:chat", async ({ roomId, text } = {}, ack) => {
      if (!await isActiveMember(socket.id, roomId)) return ack?.({ ok: false, error: "not-in-room" });
      const t = String(text || "").trim();
      if (!t || t.length > 500) return ack?.({ ok: false, error: "bad-message" });
      const username = socket.data?.username || "anon";
      io.to(roomName(roomId)).emit("room:chat", {
        from: socket.id,
        username,
        text: t,
        ts: Date.now(),
      });
      ack?.({ ok: true });
    });

    // ----- Status: mic / cam toggles (broadcast to peers) -----
    socket.on("room:status", async ({ roomId, mic, cam } = {}, ack) => {
      if (!await isActiveMember(socket.id, roomId)) return ack?.({ ok: false, error: "not-in-room" });
      socket.to(roomName(roomId)).emit("room:status", {
        from: socket.id,
        mic: !!mic,
        cam: !!cam,
        ts: Date.now(),
      });
      ack?.({ ok: true });
    });

    // ----- Explicit leave (also called automatically on disconnect) -----
    socket.on("room:leave", async (_, ack) => {
      const s = leaveSession(socket.id);
      if (s) {
        await socket.leave(roomName(s.roomId));
        socket.to(roomName(s.roomId)).emit("room:peer-left", {
          roomId: s.roomId,
          socketId: socket.id,
        });
        const room = await rooms?.detach(socket.id);
        if (room?.roomClosed) {
          io.to(roomName(s.roomId)).emit("room:closed", { roomId: s.roomId, reason: "empty" });
          await cleanupRoom(s.roomId);
        } else if (room?.members) {
          broadcastPeers(s.roomId, room.members.host, room.members.members);
        }
      }
      ack?.({ ok: true });
    });

    // ----- Disconnect: clear the signaling session -----
    socket.on("disconnect", () => {
      const s = leaveSession(socket.id);
      if (s) socket.to(ROOM_NAMESPACE_PREFIX + s.roomId).emit("room:peer-left", {
        roomId: s.roomId,
        socketId: socket.id,
        reason: "disconnected",
      });
      if (s && !cfg.isProd) {
        log.debug("private room signaling cleanup", { roomId: s.roomId, socket: socket.id });
      }
    });
  });

  // ----- Helpers used by the room manager when membership changes -----
  function broadcastPeers(roomId, host, members) {
    io.to(ROOM_NAMESPACE_PREFIX + roomId).emit("room:peers", {
      roomId,
      host,
      members: [...members.entries()].map(([sid, e]) => ({
        socketId: sid,
        username: e.username,
        isHost: !!e.isHost,
      })),
    });
  }
  function announceLeave(roomId, socketId, reason) {
    io.to(ROOM_NAMESPACE_PREFIX + roomId).emit("room:peer-left", {
      roomId,
      socketId,
      reason,
    });
  }
  function announceClosed(roomId, reason) {
    io.to(ROOM_NAMESPACE_PREFIX + roomId).emit("room:closed", { roomId, reason });
  }

  return {
    broadcastPeers,
    announceLeave,
    announceClosed,
    cleanupRoom,
    forgetPeer,
    getSession,
    roomMembers,
    ROOM_NAMESPACE_PREFIX,
  };
}

// (Normalization helpers live in rooms.js; tests import them from there.)
