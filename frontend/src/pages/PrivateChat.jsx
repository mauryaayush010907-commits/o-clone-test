import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, Loader2, Lock, Mic, MicOff, Video, VideoOff, X, MessageCircle, Users, Send, Shuffle, LogOut, AlertTriangle } from "lucide-react";
import { Logo, Btn, IconBtn, AgeGate } from "../components/ui";
import { RoomRT } from "../lib/roomRT";

/**
 * Private Anonymous Video Chat
 *   - Create a private room and share the code
 *   - Host approves up to 4 guests (5 total participants)
 *   - WebRTC mesh between authorized members
 *   - Host controls: lock room, remove members, close room
 *
 * State machine:
 *   landing          → username input + create/join cards
 *   create-result    → host sees the code + pending requests panel
 *   pending-request  → guest sees a "waiting for the host" panel
 *   in-room          → shared multi-party video room
 *
 * Mesh WebRTC: every member opens an RTCPeerConnection to every other
 * member. For 5 participants that's 4 outbound + 4 inbound = 8 connections
 * per client, which is acceptable on modern networks. The backend
 * (sfu.js) relays the SDP / ICE control plane; media bytes go peer-to-peer.
 */
export default function PrivateChat() {
  // ---- form / pre-room state ----
  const [username, setUsername] = useState(() => {
    if (typeof sessionStorage === "undefined") return "";
    return sessionStorage.getItem("drift-username") || "";
  });
  const [inputName, setInputName] = useState(username);
  const [nameError, setNameError] = useState("");
  const [rtStatus, setRtStatus] = useState("connecting");
  const [toast, setToast] = useState("");

  // ---- room state ----
  const [stage, setStage] = useState("landing");
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [roomCode, setRoomCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState([]); // [{socketId, username, isHost, joinedAt}]
  const [peerStreams, setPeerStreams] = useState({}); // socketId -> MediaStream
  const [pending, setPending] = useState([]); // [{requestId, username, ts}]
  const [roomLocked, setRoomLocked] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinInput, setJoinInput] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("join") || "";
  });
  const [copied, setCopied] = useState(""); // "code" | "link" | ""
  const [ageOpen, setAgeOpen] = useState(() => {
    if (typeof sessionStorage === "undefined") return true;
    return !sessionStorage.getItem("drift-age-ok");
  });

  // ---- in-room state ----
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [peersStatus, setPeersStatus] = useState({}); // socketId -> {mic, cam}
  const [streamRev, setStreamRev] = useState(0); // bumps when a peer stream changes

  // ---- refs (mutable, no re-render) ----
  const rtRef = useRef(null);
  const rtStatusRef = useRef("connecting");
  const roomIdRef = useRef("");
  roomIdRef.current = roomId;
  const joinedRoomRef = useRef("");
  const pendingJoinRoomRef = useRef("");
  const roomGenerationRef = useRef(0);
  const announcedPeersRef = useRef(new Set());
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // socketId -> { pc, remoteStream, username, isHost }
  const pendingIceRef = useRef(new Map());
  const rtcConfigRef = useRef(null);
  const handleEventRef = useRef(() => {});

  // -------- room socket lifecycle --------
  useEffect(() => {
    const rt = new RoomRT({
      onStatus: (s) => {
        const wasLive = rtStatusRef.current === "live";
        rtStatusRef.current = s;
        setRtStatus(s);
        if (wasLive && s !== "live" && roomIdRef.current) {
          roomGenerationRef.current += 1;
          joinedRoomRef.current = "";
          pendingJoinRoomRef.current = "";
          announcedPeersRef.current.clear();
          roomIdRef.current = "";
          setRoomId("");
          setRoomCode("");
          setIsHost(false);
          setStage("landing");
          setPeers([]);
          setPeerStreams({});
          setPending([]);
          teardownAllPeers();
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
            localStreamRef.current = null;
          }
          showToast("Room connection lost. Please join the room again.");
        }
      },
      onEvent: (ev, d) => handleEventRef.current(ev, d),
    });
    rtRef.current = rt;
    return () => {
      try { rt.send("room:leave"); } catch {}
      roomGenerationRef.current += 1;
      joinedRoomRef.current = "";
      pendingJoinRoomRef.current = "";
      announcedPeersRef.current.clear();
      rt.close();
      teardownAllPeers();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable event handler — calls all the room logic.
  const handleEvent = useCallback((ev, d) => {
    switch (ev) {
      case "room:join-request": {
        setPending((p) => p.some((request) => request.requestId === d.requestId)
          ? p
          : [...p, { requestId: d.requestId, username: d.username, ts: d.ts || Date.now() }]);
        showToast(`${d.username} wants to join`);
        break;
      }
      case "room:join-accepted": {
        if (pendingJoinRoomRef.current === d.roomId || joinedRoomRef.current === d.roomId) return;
        const generation = ++roomGenerationRef.current;
        const socket = rtRef.current?.socket;
        pendingJoinRoomRef.current = d.roomId;
        roomIdRef.current = d.roomId;
        setRoomId(d.roomId);
        setIsHost(false);
        const list = (d.members || []).filter((m) => m.socketId !== rtRef.current?.socket?.id);
        setPeers(list);
        setRoomLocked(false);
        ensureLocalMedia(generation).then((stream) => {
          if (!stream || generation !== roomGenerationRef.current ||
            roomIdRef.current !== d.roomId || rtRef.current?.socket !== socket || !socket?.connected) {
            if (pendingJoinRoomRef.current === d.roomId) pendingJoinRoomRef.current = "";
            showToast("Disconnected from the room server. Reconnect and try again.");
            return;
          }
          socket.emit("room:join", { roomId: d.roomId, isHost: false }, (ack) => {
            if (!ack?.ok || generation !== roomGenerationRef.current ||
              roomIdRef.current !== d.roomId || rtRef.current?.socket !== socket || !socket.connected) {
              if (pendingJoinRoomRef.current === d.roomId) pendingJoinRoomRef.current = "";
              if (!ack?.ok) showToast("Could not join room signaling. Please leave and rejoin.");
              return;
            }
            joinedRoomRef.current = d.roomId;
            pendingJoinRoomRef.current = "";
            setPeers((ack.others || []).filter((peer) => peer.socketId !== socket.id));
            setStage("in-room");
            showToast("You joined the room");
          });
        });
        break;
      }
      case "room:join-rejected": {
        roomGenerationRef.current += 1;
        joinedRoomRef.current = "";
        pendingJoinRoomRef.current = "";
        announcedPeersRef.current.clear();
        setRejectionReason(d?.reason || "rejected");
        setStage("landing");
        setRoomCode(""); setRoomId(""); setIsHost(false);
        roomIdRef.current = "";
        setPending([]); setPeers([]);
        break;
      }
      case "room:removed": {
        rtRef.current?.send("room:leave");
        roomGenerationRef.current += 1;
        joinedRoomRef.current = "";
        pendingJoinRoomRef.current = "";
        setStage("landing");
        setRoomCode(""); setRoomId(""); setIsHost(false);
        roomIdRef.current = "";
        setPending([]); setPeers([]);
        announcedPeersRef.current.clear();
        teardownAllPeers();
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }
        showToast("You were removed from the room");
        break;
      }
      case "room:closed": {
        rtRef.current?.send("room:leave");
        roomGenerationRef.current += 1;
        joinedRoomRef.current = "";
        pendingJoinRoomRef.current = "";
        setStage("landing");
        setRoomCode(""); setRoomId(""); setIsHost(false);
        roomIdRef.current = "";
        setPending([]); setPeers([]);
        announcedPeersRef.current.clear();
        teardownAllPeers();
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }
        showToast("The host closed the room");
        break;
      }
      case "room:peers": {
        if (d.roomId !== roomIdRef.current) return;
        const list = (d.members || []).filter((m) => m.socketId !== rtRef.current?.socket?.id);
        const currentIds = new Set(list.map((peer) => peer.socketId));
        for (const peerId of announcedPeersRef.current) {
          if (!currentIds.has(peerId)) announcedPeersRef.current.delete(peerId);
        }
        setPeers(list);
        break;
      }
      case "room:peer-joined": {
        if (d.roomId !== roomIdRef.current || joinedRoomRef.current !== d.roomId) return;
        if (d.socketId === rtRef.current?.socket?.id) return;
        if (announcedPeersRef.current.has(d.socketId)) return;
        announcedPeersRef.current.add(d.socketId);
        setPeers((prev) => {
          if (prev.find((p) => p.socketId === d.socketId)) return prev;
          return [...prev, { socketId: d.socketId, username: d.username, isHost: !!d.isHost, joinedAt: Date.now() }];
        });
        if (stageRef.current !== "in-room") return;
        const generation = roomGenerationRef.current;
        const activeRoomId = roomIdRef.current;
        ensureLocalMedia(generation).then((stream) => {
          if (stream && generation === roomGenerationRef.current &&
            activeRoomId === roomIdRef.current && stageRef.current === "in-room") {
            connectToPeer(d, true, generation, activeRoomId);
          }
        });
        break;
      }
      case "room:peer-left": {
        if (d.roomId !== roomIdRef.current) return;
        announcedPeersRef.current.delete(d.socketId);
        setPeers((prev) => prev.filter((p) => p.socketId !== d.socketId));
        teardownPeer(d.socketId);
        setPeerStreams((s) => {
          const n = { ...s };
          delete n[d.socketId];
          return n;
        });
        break;
      }
      case "room:lock-changed": {
        setRoomLocked(!!d.locked);
        showToast(d.locked ? "Room locked" : "Room unlocked");
        break;
      }
      case "room:chat": {
        if (d.roomId !== roomIdRef.current) return;
        setMessages((m) => [...m, { from: d.from, username: d.username, text: d.text, ts: d.ts, mine: d.from === rtRef.current?.socket?.id }]);
        break;
      }
      case "room:status": {
        if (d.roomId !== roomIdRef.current) return;
        setPeersStatus((s) => ({ ...s, [d.from]: { mic: !!d.mic, cam: !!d.cam } }));
        break;
      }
      case "webrtc:offer": {
        if (import.meta.env.DEV) {
          console.debug("Private-room offer received", {
            matchId: d.roomId,
            roomId: d.roomId,
            socketId: rtRef.current?.socket?.id,
            from: d.from,
          });
        }
        handleRemoteOffer(d, d.from, d.sdp);
        break;
      }
      case "webrtc:answer": {
        handleRemoteAnswer(d, d.from, d.sdp);
        break;
      }
      case "webrtc:ice": {
        handleRemoteIce(d, d.from, d.candidate);
        break;
      }
      case "error": {
        if (d && d.code === "username-taken" && Array.isArray(d.suggestions) && d.suggestions.length) {
          setNameError(`That name is taken. Try: ${d.suggestions.join(", ")}`);
        } else if (d && d.message) {
          showToast(d.message);
        }
        break;
      }
      default:
        break;
    }
  }, []);
  useEffect(() => { handleEventRef.current = handleEvent; }, [handleEvent]);

  // -------- Local media + ICE config --------
  const ensureLocalMedia = useCallback(async (generation = roomGenerationRef.current) => {
    if (generation !== roomGenerationRef.current) return null;
    if (localStreamRef.current) return localStreamRef.current;
    if (typeof window === "undefined" || !navigator?.mediaDevices) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (generation !== roomGenerationRef.current || !rtRef.current?.socket?.connected) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
      stream.getVideoTracks().forEach((t) => (t.enabled = camOn));
      if (!rtcConfigRef.current) {
        try {
          const base = (import.meta.env.VITE_API_URL || "");
          const res = await fetch(base + "/api/ice-servers");
          if (res.ok) {
            const j = await res.json();
            rtcConfigRef.current = { iceServers: j.iceServers || [{ urls: "stun:stun.l.google.com:19302" }] };
          } else {
            rtcConfigRef.current = { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] };
          }
        } catch {
          rtcConfigRef.current = { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] };
        }
      }
      if (generation !== roomGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (localStreamRef.current === stream) localStreamRef.current = null;
        return null;
      }
      // Trigger a re-render so the local <video> picks up the new stream.
      setStreamRev((r) => r + 1);
      return stream;
    } catch (e) {
      if (generation === roomGenerationRef.current) {
        showToast("Camera or microphone permission denied");
      }
      return null;
    }
  }, [micOn, camOn]);

  // -------- Mic / Cam toggles (broadcast to peers) --------
  useEffect(() => {
    const s = localStreamRef.current;
    if (!s) return;
    s.getAudioTracks().forEach((t) => (t.enabled = micOn));
    s.getVideoTracks().forEach((t) => (t.enabled = camOn));
    if (stage === "in-room") rtRef.current?.send("room:status", { roomId, mic: micOn, cam: camOn });
  }, [micOn, camOn, stage, roomId]);

  // -------- WebRTC peer connection plumbing --------
  function ensurePeerEntry(socketId, opts = {}) {
    let entry = peersRef.current.get(socketId);
    if (entry) return entry;
    const generation = roomGenerationRef.current;
    const activeRoomId = roomIdRef.current;
    const pc = new RTCPeerConnection(rtcConfigRef.current || { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] });
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    entry = {
      pc,
      remoteStream: null,
      pendingIce: pendingIceRef.current.get(socketId) || [],
      username: opts.username,
      isHost: !!opts.isHost,
      joinedAt: Date.now(),
      creatingOffer: false,
      handlingOffer: false,
      generation,
      roomId: activeRoomId,
    };
    pendingIceRef.current.delete(socketId);
    peersRef.current.set(socketId, entry);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendRoomSignal("webrtc:ice", { to: socketId, candidate: e.candidate.toJSON() }, generation, pc);
      }
    };
    pc.ontrack = (e) => {
      if (!isCurrentPeer(socketId, entry, generation, activeRoomId)) return;
      const incoming = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      entry.remoteStream = incoming;
      setPeerStreams((s) => ({ ...s, [socketId]: incoming }));
      setStreamRev((r) => r + 1);
    };
    pc.onconnectionstatechange = () => {
      if (!isCurrentPeer(socketId, entry, generation, activeRoomId)) return;
      if (["failed", "closed"].includes(pc.connectionState)) {
        teardownPeer(socketId);
        setPeerStreams((streams) => {
          if (!streams[socketId]) return streams;
          const next = { ...streams };
          delete next[socketId];
          return next;
        });
        setStreamRev((r) => r + 1);
      }
    };
    return entry;
  }

  function isCurrentPeer(socketId, entry, generation, activeRoomId) {
    const socket = rtRef.current?.socket;
    return generation === roomGenerationRef.current &&
      activeRoomId === roomIdRef.current &&
      joinedRoomRef.current === activeRoomId &&
      socket?.connected &&
      peersRef.current.get(socketId) === entry &&
      entry.generation === generation &&
      entry.roomId === activeRoomId;
  }

  async function connectToPeer(peer, initiator, generation = roomGenerationRef.current, activeRoomId = roomIdRef.current) {
    if (!peer || !peer.socketId) return;
    const stream = localStreamRef.current;
    if (!stream || generation !== roomGenerationRef.current ||
      activeRoomId !== roomIdRef.current || joinedRoomRef.current !== activeRoomId) return;
    const entry = ensurePeerEntry(peer.socketId, { username: peer.username, isHost: peer.isHost });
    if (!initiator || entry.creatingOffer || entry.pc.signalingState !== "stable") return;
    entry.creatingOffer = true;
    try {
      const offer = await entry.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      if (!isCurrentPeer(peer.socketId, entry, generation, activeRoomId)) return;
      await entry.pc.setLocalDescription(offer);
      if (!isCurrentPeer(peer.socketId, entry, generation, activeRoomId)) return;
      sendRoomSignal("webrtc:offer", { to: peer.socketId, sdp: entry.pc.localDescription?.sdp }, generation, entry.pc);
    } catch (error) {
      console.error("Could not create private-room video offer", error);
      showToast("Could not start video with a room participant.");
    } finally {
      entry.creatingOffer = false;
    }
  }

  async function handleRemoteOffer(data, from, sdp) {
    const generation = roomGenerationRef.current;
    const activeRoomId = roomIdRef.current;
    if (!data || data.roomId !== activeRoomId || joinedRoomRef.current !== activeRoomId ||
      !from || typeof sdp !== "string") return;
    const stream = localStreamRef.current || await ensureLocalMedia(generation);
    if (!stream || generation !== roomGenerationRef.current || activeRoomId !== roomIdRef.current) return;
    const entry = ensurePeerEntry(from);
    if (!isCurrentPeer(from, entry, generation, activeRoomId) || entry.handlingOffer ||
      entry.pc.signalingState !== "stable") return;
    entry.handlingOffer = true;
    try {
      await entry.pc.setRemoteDescription({ type: "offer", sdp });
      if (!isCurrentPeer(from, entry, generation, activeRoomId)) return;
      await flushPendingIce(entry);
      if (!isCurrentPeer(from, entry, generation, activeRoomId)) return;
      const answer = await entry.pc.createAnswer();
      if (!isCurrentPeer(from, entry, generation, activeRoomId)) return;
      await entry.pc.setLocalDescription(answer);
      if (!isCurrentPeer(from, entry, generation, activeRoomId)) return;
      if (import.meta.env.DEV) {
        console.debug("Private-room answer generated", {
          matchId: activeRoomId,
          roomId: activeRoomId,
          socketId: rtRef.current?.socket?.id,
          to: from,
        });
      }
      sendRoomSignal("webrtc:answer", { to: from, sdp: entry.pc.localDescription?.sdp }, generation, entry.pc);
    } catch (error) {
      console.error("Could not answer private-room video offer", error);
      showToast("Could not connect video with a room participant.");
    } finally {
      if (peersRef.current.get(from) === entry) entry.handlingOffer = false;
    }
  }

  async function handleRemoteAnswer(data, from, sdp) {
    if (!data || data.roomId !== roomIdRef.current || joinedRoomRef.current !== roomIdRef.current) return;
    const entry = peersRef.current.get(from);
    const generation = roomGenerationRef.current;
    const activeRoomId = roomIdRef.current;
    if (!entry || !isCurrentPeer(from, entry, generation, activeRoomId) ||
      entry.pc.signalingState !== "have-local-offer") return;
    try {
      await entry.pc.setRemoteDescription({ type: "answer", sdp });
      if (!isCurrentPeer(from, entry, generation, activeRoomId)) return;
      await flushPendingIce(entry);
    } catch (error) {
      console.error("Could not apply private-room video answer", error);
      showToast("Could not finish connecting video with a room participant.");
    }
  }

  async function handleRemoteIce(data, from, candidate) {
    if (!data || data.roomId !== roomIdRef.current || joinedRoomRef.current !== roomIdRef.current) return;
    const entry = peersRef.current.get(from);
    const generation = roomGenerationRef.current;
    const activeRoomId = roomIdRef.current;
    if (entry && isCurrentPeer(from, entry, generation, activeRoomId) && entry.pc.remoteDescription) {
      try {
        await entry.pc.addIceCandidate(candidate).catch((error) => {
          console.error("Could not add private-room ICE candidate", error);
        });
      } catch (error) {
        console.error("Could not add private-room ICE candidate", error);
      }
      return;
    }
    if (!entry) {
      const pending = pendingIceRef.current.get(from) || [];
      pending.push(candidate);
      pendingIceRef.current.set(from, pending);
    } else {
      entry.pendingIce.push(candidate);
    }
  }

  async function flushPendingIce(entry) {
    const candidates = entry.pendingIce.splice(0);
    for (const candidate of candidates) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch (error) {
        console.error("Could not add queued private-room ICE candidate", error);
      }
    }
  }

  function sendRoomSignal(event, payload, generation = roomGenerationRef.current, pc = null) {
    const socket = rtRef.current?.socket;
    const activeRoomId = roomIdRef.current;
    if (!socket?.connected || !activeRoomId || joinedRoomRef.current !== activeRoomId ||
      generation !== roomGenerationRef.current ||
      (pc && peersRef.current.get(payload.to)?.pc !== pc)) {
      console.warn(`Cannot send ${event}: private room connection is not ready`);
      return false;
    }
    socket.emit(event, { ...payload, roomId: activeRoomId }, (ack) => {
      if (!ack?.ok) {
        console.warn(`Private-room ${event} rejected`, {
          matchId: activeRoomId,
          roomId: activeRoomId,
          socketId: socket.id,
          code: ack?.error || "unknown-error",
        });
      }
    });
    return true;
  }

  function teardownPeer(socketId) {
    const e = peersRef.current.get(socketId);
    if (!e) return;
    try { e.pc.close(); } catch {}
    peersRef.current.delete(socketId);
    pendingIceRef.current.delete(socketId);
  }
  function teardownAllPeers() {
    for (const id of [...peersRef.current.keys()]) teardownPeer(id);
    pendingIceRef.current.clear();
  }

  // -------- Form handlers --------
  const setNameAndSave = (n) => {
    setInputName(n);
    setNameError("");
    setUsername(n);
    try { sessionStorage.setItem("drift-username", n); } catch {}
  };

  const submitName = async () => {
    const u = inputName.trim();
    if (!/^[A-Za-z0-9._-]{2,20}$/.test(u)) {
      setNameError("Username must be 2-20 characters: letters, digits, . _ -");
      return;
    }
    setNameAndSave(u);
    const ack = await new Promise((resolve) => {
      if (!rtRef.current || !rtRef.current.socket) return resolve({ ok: false, error: "no-socket" });
      const t = setTimeout(() => resolve({ ok: false, error: "timeout" }), 5000);
      const onOk = (r) => { if (r && r.username === u) { clearTimeout(t); resolve(r); } };
      rtRef.current.socket.once("username:set:ok", onOk);
      rtRef.current.send("username:set", { username: u });
    });
    if (ack && ack.ok) {
      setUsername(u);
      setNameError("");
    } else if (ack && ack.code === "username-taken" && ack.suggestions) {
      setNameError(`That name is taken. Try: ${ack.suggestions.join(", ")}`);
    } else if (ack && ack.message) {
      setNameError(ack.message);
    }
  };

  const createRoom = async () => {
    if (rtStatus !== "live") { showToast("Connecting…"); return; }
    const rt = rtRef.current;
    const socket = rt?.socket;
    const generation = ++roomGenerationRef.current;
    if (!socket?.connected) { showToast("Connecting…"); return; }
    const ack = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 5000);
      socket.emit("room:create", {}, (r) => { clearTimeout(t); resolve(r); });
    });
    if (!ack || !ack.ok) { showToast("Could not create room"); return; }
    if (generation !== roomGenerationRef.current || rtRef.current?.socket !== socket || !socket.connected) {
      socket.emit("room:close", { roomId: ack.roomId });
      return;
    }
    const joinAck = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 5000);
      socket.emit("room:join", { roomId: ack.roomId, isHost: true }, (result) => {
        clearTimeout(t);
        resolve(result);
      });
    });
    if (!joinAck?.ok || generation !== roomGenerationRef.current ||
      rtRef.current?.socket !== socket || !socket.connected) {
      socket.emit("room:close", { roomId: ack.roomId });
      showToast("Could not join room signaling. Please create the room again.");
      return;
    }
    joinedRoomRef.current = ack.roomId;
    pendingJoinRoomRef.current = "";
    announcedPeersRef.current.clear();
    if (import.meta.env.DEV) {
      console.debug("Private-room join completed", {
        matchId: ack.roomId,
        roomId: ack.roomId,
        socketId: socket.id,
      });
    }
    setRoomCode(ack.code);
    roomIdRef.current = ack.roomId;
    setRoomId(ack.roomId);
    setIsHost(true);
    setStage("create-result");
  };

  const requestJoin = async () => {
    if (rtStatus !== "live") { showToast("Connecting…"); return; }
    setJoinError("");
    const code = joinInput.trim().toUpperCase();
    if (!code) { setJoinError("Please enter a room code."); return; }
    rtRef.current.send("room:request-join", { code });
    const ack = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 5000);
      rtRef.current.socket?.once("room:request-join:ok", (r) => { clearTimeout(t); resolve(r); });
    });
    if (!ack) { setJoinError("No response from server."); return; }
    if (!ack.ok) {
      const map = {
        "not-found": "No room with that code (it may have expired).",
        "room-locked": "This room is locked by the host.",
        "room-full": "This room is full (5 participants max).",
        "rate-limited": "Too many attempts — try again in a minute.",
        "bad-code-format": "That code doesn't look right. Check it and try again.",
        "no-username": "Pick a username first.",
        "already-pending": "You already have a pending request for this room.",
        "too-many-pending": "The host has a lot of pending requests right now — try again later.",
      };
      setJoinError(map[ack.code] || ack.message || "Could not join.");
      return;
    }
    setRoomId(ack.roomId);
    roomIdRef.current = ack.roomId;
    setStage("pending-request");
  };

  const cancelJoin = () => {
    if (roomId) rtRef.current?.send("room:cancel-request", { roomId, requestId: "" });
    setStage("landing");
    setRoomId(""); setRoomCode(""); setIsHost(false);
    roomIdRef.current = "";
  };

  const acceptPending = (requestId) => {
    if (!roomId) return;
    rtRef.current?.send("room:accept", { roomId, requestId });
    setPending((p) => p.filter((x) => x.requestId !== requestId));
  };
  const rejectPending = (requestId) => {
    if (!roomId) return;
    rtRef.current?.send("room:reject", { roomId, requestId });
    setPending((p) => p.filter((x) => x.requestId !== requestId));
  };

  const lockToggle = () => {
    if (!roomId) return;
    rtRef.current?.send("room:lock", { roomId, locked: !roomLocked });
  };

  const removePeer = (socketId) => {
    if (!roomId) return;
    rtRef.current?.send("room:remove", { roomId, socketId });
  };

  const closeRoom = () => {
    if (!roomId) return;
    rtRef.current?.send("room:close", { roomId });
  };

  const enterRoom = async () => {
    if (!roomId) return;
    setStage("in-room");
    const generation = roomGenerationRef.current;
    const activeRoomId = roomId;
    const stream = await ensureLocalMedia(generation);
    if (!stream || generation !== roomGenerationRef.current ||
      activeRoomId !== roomIdRef.current || joinedRoomRef.current !== activeRoomId) return;
    for (const peer of peers) {
      connectToPeer(peer, true, generation, activeRoomId);
    }
  };

  const leaveRoom = () => {
    if (isHost && roomIdRef.current) rtRef.current?.send("room:close", { roomId: roomIdRef.current });
    else rtRef.current?.send("room:leave");
    roomGenerationRef.current += 1;
    joinedRoomRef.current = "";
    pendingJoinRoomRef.current = "";
    announcedPeersRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    teardownAllPeers();
    setStage("landing");
    setRoomId(""); setRoomCode(""); setIsHost(false);
    roomIdRef.current = "";
    setPending([]); setPeers([]); setMessages([]); setPeersStatus({}); setPeerStreams({});
  };

  const sendText = () => {
    const t = text.trim();
    if (!t || !roomId) return;
    const socket = rtRef.current?.socket;
    if (!socket?.connected) {
      showToast("Message could not be sent. Reconnecting to the room…");
      return;
    }
    socket.emit("room:chat", { roomId: roomIdRef.current, text: t }, (ack) => {
      if (!ack?.ok) {
        showToast("Message could not be sent. Please try again.");
        return;
      }
      setText("");
    });
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast((m) => (m === msg ? "" : m)), 3000);
  };

  const invitationLink = useMemo(() => {
    if (!roomCode) return "";
    if (typeof window === "undefined") return `https://drift.example/private?join=${roomCode}`;
    return `${window.location.origin}/private?join=${roomCode}`;
  }, [roomCode]);

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-fog">
      <div className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3">
          <Link to="/" className="transition-opacity hover:opacity-80">
            <Logo size={26} />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] text-mute sm:inline-flex items-center gap-1.5">
              {rtStatus === "live" ? <><span className="h-1.5 w-1.5 rounded-full bg-aqua" /> Live</> : rtStatus === "failed" ? "Disconnected" : "Connecting…"}
            </span>
            <span className="rounded-full border border-line2 bg-panel2/60 px-2 py-0.5 text-[11px] text-mute">{username || "guest"}</span>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
        {stage === "landing" && (
          <EmptyState
            username={inputName}
            setUsername={setInputName}
            nameError={nameError}
            submitName={submitName}
            joinInput={joinInput}
            setJoinInput={setJoinInput}
            joinError={joinError}
            createRoom={createRoom}
            requestJoin={requestJoin}
            rtStatus={rtStatus}
          />
        )}
        {stage === "create-result" && (
          <CreateResult
            code={roomCode}
            link={invitationLink}
            pending={pending}
            onAccept={acceptPending}
            onReject={rejectPending}
            onEnter={enterRoom}
            onClose={closeRoom}
            onCopy={(which) => {
              const txt = which === "code" ? roomCode : invitationLink;
              if (navigator.clipboard) navigator.clipboard.writeText(txt);
              setCopied(which);
              setTimeout(() => setCopied(""), 1500);
            }}
            copied={copied}
            locked={roomLocked}
            onLockToggle={lockToggle}
            peers={peers}
            rtStatus={rtStatus}
            username={username}
            onLeave={leaveRoom}
          />
        )}
        {stage === "pending-request" && (
          <PendingState code={roomCode} onCancel={cancelJoin} rtStatus={rtStatus} />
        )}
        {stage === "in-room" && (
          <InRoom
            peers={peers}
            pending={pending}
            onAccept={acceptPending}
            onReject={rejectPending}
            peersStatus={peersStatus}
            peerStreams={peerStreams}
            streamRev={streamRev}
            localStreamRef={localStreamRef}
            isHost={isHost}
            micOn={micOn}
            camOn={camOn}
            onToggleMic={() => setMicOn((m) => !m)}
            onToggleCam={() => setCamOn((c) => !c)}
            messages={messages}
            text={text}
            setText={setText}
            sendText={sendText}
            onRemove={removePeer}
            onClose={closeRoom}
            onLeave={leaveRoom}
            roomLocked={roomLocked}
            onLockToggle={lockToggle}
            rtStatus={rtStatus}
            username={username}
          />
        )}
      </main>

      {toast && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-full border border-line bg-panel/90 px-4 py-2 text-xs text-fog shadow-xl backdrop-blur">{toast}</div>
        </div>
      )}

      <AgeGate
        open={ageOpen}
        onConfirm={() => { try { sessionStorage.setItem("drift-age-ok", "1"); } catch {} setAgeOpen(false); }}
        onDecline={() => { try { sessionStorage.setItem("drift-age-ok", "1"); } catch {} setAgeOpen(false); }}
      />
    </div>
  );
}

/* ============== Empty state ============== */
function EmptyState({ username, setUsername, nameError, submitName, joinInput, setJoinInput, joinError, createRoom, requestJoin, rtStatus }) {
  return (
    <>
      <header className="anim-fade-up mt-2 text-center">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-ember/40 bg-ember/10 px-2.5 py-1 text-[11px] font-medium text-ember">
          <Lock size={11} /> Host-approved · 5-person cap · End-to-end media
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Private Anonymous Video Chat</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-mute">
          Create a private room, share your room code, and chat with people you approve.
        </p>
      </header>

      <section className="anim-fade-up rounded-2xl border border-line bg-panel p-4">
        <label className="mb-1.5 block text-xs font-medium text-mute">Your username</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitName(); }}
            placeholder="Pick a username (2-20 chars, letters/digits/._-)"
            className="flex-1 rounded-xl border border-line bg-panel2/60 px-3 py-2.5 text-sm text-fog placeholder:text-dim focus:border-ember/60 focus:outline-none"
          />
          <Btn onClick={submitName} disabled={!username.trim()}>Save</Btn>
        </div>
        {nameError && <p className="mt-1.5 text-xs text-warn">{nameError}</p>}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          onClick={createRoom}
          disabled={rtStatus !== "live" || !username.trim()}
          className="anim-fade-up group flex flex-col items-start gap-2 rounded-2xl border border-line bg-panel p-5 text-left transition-all hover:border-ember/40 disabled:opacity-50"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ember/15 text-ember">
            <Lock size={18} />
          </span>
          <h3 className="font-display text-base font-semibold">Create Private Room</h3>
          <p className="text-xs text-mute">
            Start a room and get a code. Share it (or the link) with people you want to chat with.
          </p>
        </button>

        <div className="anim-fade-up flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-aqua/15 text-aqua">
            <Shuffle size={18} />
          </span>
          <h3 className="font-display text-base font-semibold">Join Private Room</h3>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") requestJoin(); }}
            placeholder="Enter room code (e.g. AL482917)"
            className="rounded-xl border border-line bg-panel2/60 px-3 py-2.5 font-mono uppercase tracking-wider text-sm text-fog placeholder:text-dim focus:border-ember/60 focus:outline-none"
            maxLength={12}
          />
          {joinError && <p className="text-xs text-warn">{joinError}</p>}
          <Btn onClick={requestJoin} disabled={rtStatus !== "live" || !joinInput.trim()}>
            <Send size={14} />
            Request to join
          </Btn>
        </div>
      </div>
    </>
  );
}

/* ============== Create result ============== */
function CreateResult({ code, link, pending, onAccept, onReject, onEnter, onClose, onCopy, copied, locked, onLockToggle, peers, rtStatus, username, onLeave }) {
  return (
    <>
      <header className="anim-fade-up text-center">
        <p className="text-[11px] uppercase tracking-wider text-mute">Your room is live</p>
        <div className="mt-2 inline-flex items-center gap-3 rounded-2xl border border-ember/40 bg-ember/10 px-5 py-3">
          <span className="font-mono text-3xl font-bold tracking-[0.3em] text-ember">{code}</span>
        </div>
        <p className="mt-2 text-xs text-mute">Share this code (or the link) with people you want to chat with.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <ActionCard
          icon={<Copy size={16} />}
          label="Room code"
          value={code}
          onCopy={() => onCopy("code")}
          copied={copied === "code"}
        />
        <ActionCard
          icon={<LinkIcon size={16} />}
          label="Invitation link"
          value={link}
          onCopy={() => onCopy("link")}
          copied={copied === "link"}
        />
      </section>

      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">Pending join requests</h3>
          <span className="rounded-full border border-line2 bg-panel2/60 px-2 py-0.5 text-[10px] font-medium text-mute">
            {peers.length + 1}/5 participants{locked ? " · locked" : ""}
          </span>
        </div>
        <PendingRequests pending={pending} onAccept={onAccept} onReject={onReject} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Btn onClick={onEnter}>
            <Video size={14} />
            Enter room
          </Btn>
          <Btn variant="ghost" onClick={onLockToggle}>
            <Lock size={14} />
            {locked ? "Unlock" : "Lock"} room
          </Btn>
          <Btn variant="danger" onClick={onClose}>
            <X size={14} />
            Close room
          </Btn>
          <Btn variant="ghost" onClick={onLeave}>
            <LogOut size={14} />
            Discard
          </Btn>
        </div>
      </section>
    </>
  );
}

function ActionCard({ icon, label, value, onCopy, copied }) {
  return (
    <div className="anim-fade-up flex items-center gap-3 rounded-2xl border border-line bg-panel p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-panel2/60 text-ember">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-mute">{label}</div>
        <div className="truncate font-mono text-sm">{value}</div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line2 bg-panel2/60 text-mute transition-colors hover:text-fog"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check size={14} className="text-aqua" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function LinkIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.41 1.41" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.41-1.41" />
    </svg>
  );
}

/* ============== Pending state ============== */
function PendingState({ code, onCancel, rtStatus }) {
  return (
    <div className="anim-fade-up mx-auto mt-8 max-w-md text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-warn/40 bg-warn/10 text-warn">
        <Loader2 size={26} className="anim-spin-slow" />
      </div>
      <h2 className="font-display text-xl font-semibold">Waiting for the host…</h2>
      <p className="mt-2 text-sm text-mute">
        You asked to join room <span className="font-mono font-bold tracking-wider text-fog">{code}</span>. The host will see your request and decide.
      </p>
      <Btn className="mt-5" variant="ghost" onClick={onCancel}>Cancel request</Btn>
    </div>
  );
}

function PendingRequests({ pending, onAccept, onReject }) {
  if (pending.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-line bg-panel2/30 py-6 text-center text-sm text-mute">
        <Users size={18} className="mb-2 text-dim" />
        No one is waiting to join.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {pending.map((request) => (
        <li key={request.requestId} className="flex items-center gap-3 rounded-xl border border-line bg-panel2/40 p-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-aqua/15 text-aqua font-display text-sm font-bold">
            {request.username.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{request.username}</div>
            <div className="text-[11px] text-dim">wants to join</div>
          </div>
          <Btn size="sm" onClick={() => onAccept(request.requestId)}>Accept</Btn>
          <Btn size="sm" variant="ghost" onClick={() => onReject(request.requestId)}>Reject</Btn>
        </li>
      ))}
    </ul>
  );
}

/* ============== In-room ============== */
function InRoom({
  peers, pending = [], onAccept, onReject, peersStatus = {}, peerStreams, streamRev, localStreamRef, isHost, micOn, camOn,
  onToggleMic, onToggleCam, messages, text, setText, sendText, onRemove, onClose, onLeave, roomLocked, onLockToggle, rtStatus, username,
}) {
  const localVideoRef = useRef(null);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStreamRef.current) el.srcObject = localStreamRef.current;
  }, [localStreamRef.current, streamRev]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const gridCols = peers.length === 0
    ? "grid-cols-1"
    : peers.length === 1
      ? "grid-cols-2"
      : "grid-cols-2 md:grid-cols-3";

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Private room</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line2 bg-panel2/60 px-2 py-0.5 text-[10px] font-medium text-mute">
            {peers.length + 1}/5 {roomLocked ? "· locked" : ""}
          </span>
          {isHost && (
            <>
              <Btn size="sm" variant="ghost" onClick={onLockToggle}>
                <Lock size={13} />
                {roomLocked ? "Unlock" : "Lock"}
              </Btn>
              <Btn size="sm" variant="danger" onClick={onClose}>
                <X size={13} />
                Close
              </Btn>
            </>
          )}
          <Btn size="sm" variant="ghost" onClick={onLeave}>
            <LogOut size={13} />
            Leave
          </Btn>
        </div>
      </header>

      {isHost && (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold">Join requests</h3>
            <span className="rounded-full border border-line2 bg-panel2/60 px-2 py-0.5 text-[10px] font-medium text-mute">
              {pending.length} waiting
            </span>
          </div>
          <PendingRequests pending={pending} onAccept={onAccept} onReject={onReject} />
        </section>
      )}

      <section className="rounded-2xl border border-line bg-black/40 p-3">
        <div className={`grid gap-2 ${gridCols}`}>
          <VideoTile
            videoRef={localVideoRef}
            stream={localStreamRef.current}
            username={username}
            isLocal
            micOn={micOn}
            camOn={camOn}
            muted
          />
          {peers.map((p) => (
            <PeerTile
              key={p.socketId}
              peer={p}
              status={peersStatus[p.socketId]}
              stream={peerStreams[p.socketId] || null}
              streamRev={streamRev}
              isHost={isHost}
              onRemove={onRemove}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <IconBtn onClick={onToggleMic} title={micOn ? "Mute mic" : "Unmute mic"} active={micOn}>
            {micOn ? <Mic size={18} /> : <MicOff size={18} className="text-danger" />}
          </IconBtn>
          <IconBtn onClick={onToggleCam} title={camOn ? "Camera off" : "Camera on"} active={camOn}>
            {camOn ? <Video size={18} /> : <VideoOff size={18} className="text-danger" />}
          </IconBtn>
          <span className="ml-2 text-[11px] text-dim">
            {rtStatus === "live" ? "Connected" : rtStatus === "reconnecting" ? "Reconnecting…" : "Offline"}
          </span>
          {isHost && peers.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-warn">
              <AlertTriangle size={11} /> You're the host — controls are visible to you only.
            </span>
          )}
        </div>
      </section>

      <section className="flex h-64 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line bg-panel2/40 px-3 py-2">
          <MessageCircle size={14} className="text-mute" />
          <h3 className="font-display text-sm font-semibold">Room chat</h3>
        </div>
        <div ref={chatScrollRef} className="chat-surface chat-scroll flex-1 overflow-y-auto p-3">
          {messages.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-xs text-mute">
              Say hi 👋
            </div>
          ) : (
            <ul className="space-y-1.5">
              {messages.map((m, i) => (
                <li key={i} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div className={`bubble ${m.mine ? "bubble-mine" : ""}`}>
                    {!m.mine && <div className="mb-0.5 text-[10px] font-medium text-ember">{m.username}</div>}
                    <span className="block whitespace-pre-wrap pr-12">{m.text}</span>
                    <span className="bubble-meta inline-flex items-center gap-1">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); sendText(); }}
          className="flex items-center gap-2 border-t border-line p-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Send a message…"
            maxLength={500}
            className="flex-1 rounded-xl border border-line bg-panel2/60 px-3 py-2 text-sm text-fog placeholder:text-dim focus:border-ember/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="grid h-9 w-9 place-items-center rounded-xl bg-ember text-accent transition-opacity disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </form>
      </section>
    </>
  );
}

const VideoTile = ({ videoRef, stream, username, isLocal, micOn, camOn, muted }) => {
  useEffect(() => {
    const el = videoRef && videoRef.current;
    if (el && stream) el.srcObject = stream;
  }, [stream, videoRef]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-line2 bg-ink/80">
      <video ref={videoRef} autoPlay playsInline muted={!!muted} className="h-full w-full object-cover" />
      {(!stream || (isLocal && !camOn)) && (
        <div className="absolute inset-0 grid place-items-center bg-ink/70 text-mute">
          <VideoOff size={20} />
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
        {username || "—"}
        {isLocal && !micOn && <MicOff size={10} className="text-danger" />}
      </div>
    </div>
  );
};

const PeerTile = ({ peer, status, stream, streamRev, isHost, onRemove }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && stream) el.srcObject = stream;
  }, [stream, streamRev]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-line2 bg-ink/80">
      <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" />
      {!stream && (
        <div className="absolute inset-0 grid place-items-center text-mute">
          <Loader2 size={20} className="anim-spin-slow" />
        </div>
      )}
      {stream && status && status.cam === false && (
        <div className="absolute inset-0 grid place-items-center bg-ink/70 text-mute">
          <VideoOff size={20} />
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
        {peer.username || "—"}
        {peer.isHost && <span className="rounded-full bg-ember/30 px-1.5 text-ember">host</span>}
        {status && status.mic === false && <MicOff size={10} className="text-danger" />}
      </div>
      {isHost && (
        <button
          onClick={() => onRemove(peer.socketId)}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg border border-danger/40 bg-danger/15 text-danger"
          title="Remove from room"
          aria-label={`Remove ${peer.username || "participant"} from room`}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
