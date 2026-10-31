import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SocketRT, fmtClock, getIceServers } from "../lib/rt.js";
import { loadPrefs, savePrefs, activeCount, toFindPayload } from "../lib/prefs.js";
import FilterModal from "../components/FilterModal.jsx";
import { getMedia, makePeerConnection, createOffer, createAnswer, listCameras, switchCamera, mediaError } from "../lib/webrtc.js";
import {
  Logo,
  Btn,
  IconBtn,
  StatusPill,
  ThemeToggle,
  AgeGate,
  ChatWindow,
  ReportPanel,
  Mic,
  MicOff,
  VideoOff,
  SwitchCamera as SwitchCameraIcon,
  Maximize2,
  SkipForward,
  Square,
  Ban,
  AlertTriangle,
  Loader2,
  Video,
} from "../components/ui.jsx";
import AdvancedFiltersButton from "../components/AdvancedFiltersButton.jsx";

const END_LABELS = {
  next: "You ended the conversation",
  stopped: "Conversation ended",
  disconnected: "The stranger disconnected",
  failed: "The connection could not be maintained",
};

export default function VideoChat() {
  const navigate = useNavigate();

  const [rtStatus, setRtStatus] = useState("connecting");
  const [phase, setPhaseState] = useState("idle"); // idle|starting|queued|connecting|live|ended|error
  const [endReason, setEndReason] = useState("");
  const [errorInfo, setErrorInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [camIdx, setCamIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [needTapAudio, setNeedTapAudio] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [refined, setRefined] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const applyingRef = useRef(false);

  const rtRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const iceFlushRef = useRef(false);
  const offerInFlightRef = useRef(null);
  const remoteOfferInFlightRef = useRef(null);
  const connectionTimerRef = useRef(null);
  const S = useRef({ phase: "idle", matchId: null, role: null, retry: 0, ice: null });
  const matchStartRef = useRef(0);
  const typingTimerRef = useRef(null);
  const toastTimerRef = useRef(null);

  const videoRef = useRef(null);
  const localRef = useRef(null);
  const stageRef = useRef(null);

  const setP = useCallback((p) => {
    S.current.phase = p;
    setPhaseState(p);
  }, []);

  /**
   * Apply a fresh set of filters: persist, terminate any in-flight
   * match/queue, and start fresh matchmaking with the new prefs.
    * Triggered by the modal's "Apply filters" button.
   */
  const openFilters = () => setFiltersOpen(true);
  const closeFilters = () => {
    setFiltersOpen(false);
    // Modal calls onClose itself; we just make sure the matchmaking state
    // machine returns to idle so the user can hit Start again with the
    // currently-applied prefs.
    if (S.current.state === "matched" || S.current.state === "connecting") {
      // safety: the modal's onClose should already have ended it
    } else if (S.current.state === "queued") {
      rtRef.current?.send("match:cancel");
    }
    setP("idle");
  };
  const applyPrefs = (next) => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    savePrefs(next);
    setPrefs(next);

    const wasMatched = S.current.state === "matched" || S.current.state === "connecting";
    const wasQueued = S.current.state === "queued";
    if (wasMatched) {
      if (S.current.matchId) rtRef.current?.send("match:next", { matchId: S.current.matchId });
      teardown(false);
      setMessages((m) => [...m, { system: true, text: "Filters updated — finding a new match…" }]);
    } else if (wasQueued) {
      rtRef.current?.send("match:cancel");
      setMessages((m) => [...m, { system: true, text: "Filters updated — finding a new match…" }]);
    }

    setRefined(false);
    setExpanded(false);
    if (S.current.expandTimer) {
      clearTimeout(S.current.expandTimer);
      S.current.expandTimer = null;
    }
    setP("queued");
    setErrorInfo(null);
    rtRef.current?.send("match:find", toFindPayload("video", next));
    applyingRef.current = false;
  };

  // Backwards-compat alias.
  const updatePrefs = (p) => {
    setPrefs(p);
    savePrefs(p);
  };

  const showToast = (msg, ms = 2600) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), ms);
  };

  const sendWebRtcSignal = (event, payload) => {
    const rt = rtRef.current;
    if (!rt) {
      console.warn("Could not send WebRTC signal: real-time client is unavailable", { event });
      return;
    }
    const result = typeof rt.sendWithAck === "function"
      ? rt.sendWithAck(event, payload)
      : rt.send(event, payload);
    Promise.resolve(result).then((response) => {
      if (response?.ok === false) {
        console.warn("WebRTC signal was rejected", { event, code: response.code || response.error });
      }
    }).catch((error) => {
      console.warn("WebRTC signal could not be sent", { event, error });
    });
  };

  const clearRemoteTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    setTyping(false);
  }, []);

  const showTyping = (matchId) => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setTyping(true);
    typingTimerRef.current = setTimeout(() => {
      if (S.current.matchId === matchId) setTyping(false);
      typingTimerRef.current = null;
    }, 1800);
  };

  const teardown = (stopLocal) => {
    const s = S.current;
    clearRemoteTyping();
    if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
    connectionTimerRef.current = null;
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* noop */
      }
      pcRef.current = null;
    }
    s.matchId = null;
    s.retry = 0;
    pendingIceRef.current = [];
    remoteStreamRef.current = null;
    const el = videoRef.current;
    if (el) el.srcObject = null;
    if (stopLocal && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      const lel = localRef.current;
      if (lel) lel.srcObject = null;
    }
  };

  const flushIce = async () => {
    if (iceFlushRef.current) return;
    iceFlushRef.current = true;
    try {
      while (pendingIceRef.current.length) {
        const entry = pendingIceRef.current[0];
        if (entry.matchId !== S.current.matchId || entry.attempt < S.current.retry) {
          pendingIceRef.current.shift();
          continue;
        }
        if (entry.attempt > S.current.retry) break;
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) break;
        pendingIceRef.current.shift();
        try {
          await pc.addIceCandidate(entry.candidate);
        } catch (error) {
          console.warn("Could not add queued video-chat ICE candidate", {
            matchId: S.current.matchId,
            attempt: entry.attempt,
            error,
          });
        }
      }
    } finally {
      iceFlushRef.current = false;
    }
  };

  const buildPc = (matchId, attempt = S.current.retry) => {
    if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
    connectionTimerRef.current = null;
    offerInFlightRef.current = null;
    remoteOfferInFlightRef.current = null;
    pendingIceRef.current = pendingIceRef.current.filter((entry) =>
      entry.matchId === matchId && entry.attempt >= attempt
    );
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        /* noop */
      }
    }
    const pc = makePeerConnection({
      iceServers: S.current.ice || [],
      onIce: (candidate) => sendWebRtcSignal("webrtc:ice-candidate", { matchId, candidate, attempt }),
      onTrack: (e) => {
        const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
        remoteStreamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          el.muted = false;
          el.play().catch(() => {
            el.muted = true;
            setNeedTapAudio(true);
          });
        }
      },
      onState: (st) => onPcState(st, pc),
      onGathering: () => {},
    });
    pcRef.current = pc;
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    armConnectionTimer(pc, S.current.role === "offerer" ? 20000 : 35000);
  };

  const armConnectionTimer = (pc, delay, onTimeout = () => onPcState("failed", pc)) => {
    if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
    connectionTimerRef.current = setTimeout(() => {
      connectionTimerRef.current = null;
      if (pcRef.current === pc && S.current.phase === "connecting") onTimeout();
    }, delay);
  };

  const doOffer = async (matchId) => {
    const pc = pcRef.current;
    if (!pc) return;
    if (pc.signalingState !== "stable") return;
    if (offerInFlightRef.current?.pc === pc) return offerInFlightRef.current.promise;
    const attempt = S.current.retry;
    const operation = (async () => {
      const sdp = await createOffer(pc);
      if (pc !== pcRef.current || matchId !== S.current.matchId || attempt !== S.current.retry) return;
      sendWebRtcSignal("webrtc:offer", {
        matchId,
        sdp: sdp.sdp,
        attempt,
        retry: attempt > 0,
      });
    })();
    const inFlight = { pc, promise: operation };
    offerInFlightRef.current = inFlight;
    try {
      await operation;
    } catch (e) {
      console.warn("createOffer failed", e);
    } finally {
      if (offerInFlightRef.current === inFlight) offerInFlightRef.current = null;
    }
  };

  const beginSession = (matchId, role) => {
    const s = S.current;
    s.matchId = matchId;
    s.role = role;
    s.retry = 0;
    setRefined(false);
    setExpanded(false);
    setNeedTapAudio(false);
    setMessages((m) => [...m, { system: true, text: "Connected — say hi!" }]);
    setP("connecting");
    buildPc(matchId);
    matchStartRef.current = Date.now();
    if (role === "offerer") doOffer(matchId);
  };

  const onRemoteOffer = async (d) => {
    const s = S.current;
    if (!d || d.matchId !== s.matchId) return;
    if (s.role !== "answerer") {
      console.warn("Ignoring offer from the wrong signaling role", { matchId: d.matchId });
      return;
    }
    const attempt = d.attempt === undefined
      ? d.retry ? Math.min(s.retry + 1, 2) : 0
      : d.attempt;
    if (!Number.isInteger(attempt)) {
      console.warn("Ignoring offer with invalid negotiation attempt", { matchId: d.matchId });
      return;
    }
    if (attempt < s.retry || attempt > 2) return;
    if (attempt > s.retry) {
      s.retry = attempt;
      buildPc(d.matchId, attempt);
    }
    let pc = pcRef.current;
    if (!pc || pc.remoteDescription?.type === "offer") return;
    if (pc.signalingState !== "stable") {
      console.warn("Ignoring offer while peer connection is not stable", { matchId: d.matchId, attempt });
      return;
    }
    if (remoteOfferInFlightRef.current === pc) return;
    remoteOfferInFlightRef.current = pc;
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: d.sdp });
      await flushIce();
      const ans = await createAnswer(pc);
      if (pc === pcRef.current && attempt === S.current.retry) {
        sendWebRtcSignal("webrtc:answer", { matchId: d.matchId, sdp: ans.sdp, attempt });
      }
    } catch (e) {
      console.warn("offer handling failed", e);
    } finally {
      if (remoteOfferInFlightRef.current === pc) remoteOfferInFlightRef.current = null;
    }
  };

  const onRemoteAnswer = async (d) => {
    const s = S.current;
    if (!d || d.matchId !== s.matchId) return;
    if (s.role !== "offerer") {
      console.warn("Ignoring answer from the wrong signaling role", { matchId: d.matchId });
      return;
    }
    const attempt = d.attempt === undefined ? s.retry : d.attempt;
    if (!Number.isInteger(attempt)) {
      console.warn("Ignoring answer with invalid negotiation attempt", { matchId: d.matchId });
      return;
    }
    if (attempt !== s.retry) return;
    const pc = pcRef.current;
    if (!pc) return;
    if (pc.signalingState !== "have-local-offer") {
      console.warn("Ignoring answer with unexpected signaling state", {
        matchId: d.matchId,
        signalingState: pc.signalingState,
      });
      return;
    }
    try {
      await pc.setRemoteDescription({ type: "answer", sdp: d.sdp });
      if (pc !== pcRef.current) return;
      await flushIce();
    } catch (e) {
      console.warn("answer handling failed", e);
    }
  };

  const onRemoteIce = (d) => {
    const s = S.current;
    if (!d || d.matchId !== s.matchId || (d.candidate !== null &&
      (!d.candidate || typeof d.candidate !== "object" || typeof d.candidate.candidate !== "string"))) return;
    const attempt = d.attempt === undefined ? s.retry : d.attempt;
    if (!Number.isInteger(attempt)) {
      console.warn("Ignoring ICE candidate with invalid negotiation attempt", { matchId: d.matchId });
      return;
    }
    if (attempt < s.retry || attempt > 2) return;
    pendingIceRef.current.push({ candidate: d.candidate, attempt, matchId: d.matchId });
    flushIce();
  };

  const onPcState = (st, pc) => {
    const s = S.current;
    if (pc !== pcRef.current) return; // stale peer connection
    if (st === "connected" || st === "completed") {
      if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
      connectionTimerRef.current = null;
      setP("live");
    } else if (st === "disconnected") {
      setP("connecting");
      armConnectionTimer(pc, 10000);
    } else if (st === "failed") {
      if (connectionTimerRef.current) clearTimeout(connectionTimerRef.current);
      connectionTimerRef.current = null;
      if (s.role === "offerer" && s.retry < 2) {
        s.retry += 1;
        buildPc(s.matchId, s.retry);
        setMessages((m) => [...m, { system: true, text: "Network hiccup — retrying connection…" }]);
        setP("connecting");
        doOffer(s.matchId);
      } else if (s.role === "answerer" && s.retry < 2) {
        armConnectionTimer(pc, 25000, endFailedConnection);
      } else {
        endFailedConnection();
      }
    }
  };

  const endFailedConnection = () => {
    teardown(false);
    setEndReason("failed");
    setP("ended");
    setMessages((m) => [...m, {
      system: true,
      text: "Peer-to-peer connection failed. Check TURN service availability and credentials, and confirm your network permits the configured TURN transports.",
    }]);
  };

  const H = useRef({});
  H.current = { beginSession, onRemoteOffer, onRemoteAnswer, onRemoteIce, teardown, showToast, showTyping, clearRemoteTyping };

  const handleEvent = useCallback(
    (ev, d = {}) => {
      const f = H.current;
      const s = S.current;
      switch (ev) {
        case "match:queued":
          f.teardown(false);
          setEndReason("");
          setRefined(!!d.refined);
          setExpanded(false);
          setP("queued");
          break;
        case "match:expanding":
          setExpanded(true);
          break;
        case "match:cancelled":
          if (S.current.phase === "queued") setP("idle");
          break;
        case "match:found":
          f.beginSession(d.matchId, d.role);
          break;
        case "match:ended":
          if (d.matchId && d.matchId === s.matchId) {
            f.teardown(false);
            setMessages((m) => [...m, { system: true, text: END_LABELS[d.reason] || "Conversation ended" }]);
            setEndReason(d.reason);
            setP("ended");
          }
          break;
        case "webrtc:offer":
          f.onRemoteOffer(d);
          break;
        case "webrtc:answer":
          f.onRemoteAnswer(d);
          break;
        case "webrtc:ice-candidate":
          f.onRemoteIce(d);
          break;
        case "chat:message":
          if (d.matchId === s.matchId && typeof d.messageId === "string" && typeof d.from === "string") {
            if (d.from !== rtRef.current?.socket?.id) f.clearRemoteTyping();
            setMessages((m) => m.some((message) => message.id === d.messageId) ? m : [
              ...m,
              { id: d.messageId, from: d.from, mine: d.from === rtRef.current?.socket?.id, text: d.text, ts: d.ts, time: fmtClock(d.ts) },
            ]);
          }
          break;
        case "chat:typing":
          if (d.matchId === s.matchId) {
            if (d.typing === false) f.clearRemoteTyping();
            else f.showTyping(d.matchId);
          }
          break;
        case "error":
          if (d && d.code !== "chat-limited" && d.event !== "match:find") f.showToast(d.message || "Something went wrong");
          break;
        case "user:reported":
          setMessages((m) => [...m, { system: true, text: "This conversation was reported to the safety team." }]);
          break;
        default:
          break;
      }
    },
    [clearRemoteTyping, setP]
  );

  useEffect(() => {
    const rt = new SocketRT({
      onEvent: handleEvent,
      onStatus: (st) => {
        setRtStatus(st);
        if (st !== "live") clearRemoteTyping();
        if (st === "failed" && S.current.matchId) {
          H.current.teardown(false);
          setEndReason("disconnected");
          setP("ended");
          setMessages((m) => [...m, { system: true, text: "Lost connection to the server." }]);
        }
      },
    });
    rtRef.current = rt;
    return () => {
      if (S.current.matchId) {
        try {
          rt.send("match:stop", { matchId: S.current.matchId });
        } catch {
          /* noop */
        }
      }
      rt.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [clearRemoteTyping, handleEvent, setP]);

  useEffect(() => {
    if (!sessionStorage.getItem("drift-age-ok")) setAgeOpen(true);
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - matchStartRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(
    () => () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const start = async () => {
    const s = S.current;
    if (["starting", "queued", "connecting", "live"].includes(s.phase)) return;
    if (!rtRef.current || !rtRef.current.online) {
      showToast("Waiting for server connection…");
      return;
    }
    setP("starting");
    setErrorInfo(null);
    setEndReason("");
    try {
      s.ice = await getIceServers();
    } catch (error) {
      setErrorInfo({
        code: "ice-config",
        title: "Video network setup unavailable",
        hint: error?.message || "The server could not provide valid ICE server settings. Please try again later.",
      });
      setP("error");
      return;
    }
    if (!s.ice.some((server) =>
      (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => typeof url === "string" && /^turns?:/i.test(url))
    )) {
      showToast("TURN relay is not configured; connections may fail on restrictive networks.");
    }
    try {
      if (!localStreamRef.current) {
        const stream = await getMedia();
        localStreamRef.current = stream;
        const lel = localRef.current;
        if (lel) {
          lel.srcObject = stream;
          lel.play().catch(() => {});
        }
        setCameras(await listCameras());
        setCamIdx(0);
      }
    } catch (err) {
      setErrorInfo(mediaError(err));
      setP("error");
      return;
    }
    setP("queued");
    rtRef.current.send("match:find", toFindPayload("video", prefs));
  };

  const next = () => {
    const s = S.current;
    if (!rtRef.current || !rtRef.current.online) return;
    if (s.phase === "queued") {
      rtRef.current.send("match:cancel");
      setP("idle");
      return;
    }
    if (s.matchId) rtRef.current.send("match:next", { matchId: s.matchId });
    teardown(false);
    setMessages([]);
    setEndReason("");
    setNeedTapAudio(false);
    setP("queued");
    rtRef.current.send("match:find", toFindPayload("video", prefs));
  };

  const stop = () => {
    const s = S.current;
    if (s.phase === "queued") rtRef.current && rtRef.current.send("match:cancel");
    else if (s.matchId) rtRef.current && rtRef.current.send("match:stop", { matchId: s.matchId });
    teardown(true);
    setMessages([]);
    setEndReason("");
    setNeedTapAudio(false);
    setMicOn(true);
    setCamOn(true);
    setP("idle");
  };

  const toggleMic = () => {
    const t = localStreamRef.current && localStreamRef.current.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setMicOn(t.enabled);
    }
  };
  const toggleCam = () => {
    const t = localStreamRef.current && localStreamRef.current.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setCamOn(t.enabled);
    }
  };
  const cycleCam = async () => {
    if (cameras.length < 2 || !localStreamRef.current) return;
    const idx = (camIdx + 1) % cameras.length;
    try {
      await switchCamera(pcRef.current, localStreamRef.current, cameras[idx].deviceId);
      setCamIdx(idx);
      showToast("Switched camera");
    } catch {
      showToast("Could not switch camera");
    }
  };
  const fullscreen = () => {
    if (stageRef.current && stageRef.current.requestFullscreen) stageRef.current.requestFullscreen().catch(() => {});
  };
  const enableAudio = () => {
    const el = videoRef.current;
    if (el) {
      el.muted = false;
      el.play().catch(() => {});
    }
    setNeedTapAudio(false);
  };
  const sendMsg = (text) => {
    if (!S.current.matchId || !rtRef.current?.online) return false;
    return rtRef.current.sendWithAck("chat:message", { matchId: S.current.matchId, text }).then((result) => result?.ok === true);
  };
  const sendTyping = (typing = true) => {
    if (S.current.matchId && S.current.phase === "live") rtRef.current && rtRef.current.send("chat:typing", { matchId: S.current.matchId, typing });
  };
  const sendReport = (reason, details) => {
    setReportBusy(true);
    if (S.current.matchId) rtRef.current && rtRef.current.send("user:report", { matchId: S.current.matchId, reason, details });
    setTimeout(() => setReportBusy(false), 600);
  };

  const inSession = phase === "live" || phase === "connecting";
  const status =
    rtStatus !== "live"
      ? { tone: "bad", label: rtStatus === "reconnecting" ? "Reconnecting…" : rtStatus === "failed" ? "Server offline" : "Connecting to server…" }
      : phase === "live"
        ? { tone: "live", label: "Live", pulse: true }
        : phase === "queued"
          ? { tone: "wait", label: "Finding a stranger…", pulse: true }
          : phase === "connecting"
            ? { tone: "wait", label: "Establishing P2P…" }
            : phase === "ended"
              ? { tone: "bad", label: "Ended" }
              : phase === "error"
                ? { tone: "bad", label: "Error" }
                : { tone: "idle", label: "Ready" };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0">
      <div className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3">
          <Link to="/" className="transition-opacity hover:opacity-80">
            <Logo size={26} />
          </Link>
          <div className="flex items-center gap-2">
            {inSession && (
              <span className="hidden rounded-full border border-line bg-panel2/60 px-3 py-1 font-mono text-xs text-mute sm:inline">
                {mm}:{ss}
              </span>
            )}
            <StatusPill tone={status.tone} label={status.label} pulse={status.pulse} />
            <ThemeToggle />
          </div>
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2">
          <div className="anim-fade-up rounded-full border border-line bg-panel px-4 py-2 text-xs text-fog shadow-xl">{toast}</div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 p-3 lg:min-h-0 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:min-h-0">
          <div ref={stageRef} className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-contain" />
            <div className="absolute bottom-3 right-3 h-24 w-36 overflow-hidden rounded-xl border border-line2 bg-black shadow-xl md:h-28 md:w-44">
              <video ref={localRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
              {!camOn && (
                <span className="absolute inset-0 grid place-items-center bg-ink/70 text-mute">
                  <VideoOff size={18} />
                </span>
              )}
            </div>

            {phase === "idle" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/85 p-6 backdrop-blur-sm">
                <div className="anim-fade-up max-w-sm text-center">
                  <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ember/15 text-ember">
                    <Video size={24} />
                  </span>
                  <h2 className="font-display text-xl font-semibold">Random video chat</h2>
                  <p className="mt-2 text-sm leading-relaxed text-mute">
                    You'll be paired with one stranger at a time. Your camera and microphone stay on your device — media flows
                    peer-to-peer and is never recorded.
                  </p>
                  <Btn size="lg" className="mt-5 w-full" onClick={start}>
                    <Video size={18} className="text-accent" />
                    Start video chat
                  </Btn>
                  <p className="mt-3 text-[11px] text-dim">Starting requests camera & microphone permission.</p>
                </div>
              </div>
            )}

            {phase === "starting" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/85">
                <div className="flex items-center gap-3 text-sm text-mute">
                  <Loader2 size={18} className="anim-spin-slow text-ember" />
                  Preparing your camera…
                </div>
              </div>
            )}

            {phase === "queued" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/80">
                <div className="text-center">
                  <div className="relative mx-auto mb-5 h-16 w-16">
                    <div className="pulse-ring absolute inset-0 rounded-full" />
                    <div className="absolute inset-0 grid place-items-center rounded-full border border-ember/40 bg-ember/10">
                      <WaitingIcon />
                    </div>
                  </div>
                  <h3 className="font-display text-lg font-semibold">Looking for someone…</h3>
                  <p className="mt-1 text-sm text-mute">We'll pair you with a stranger who also wants to chat.</p>
                  {refined && !expanded && (
                    <p className="mt-2 text-xs text-warn">
                      Refined search · {activeCount(prefs)} active filter{activeCount(prefs) > 1 ? "s" : ""} — widens automatically if it takes a
                      moment
                    </p>
                  )}
                  {expanded && <p className="mt-2 text-xs text-aqua">Searching everyone…</p>}
                  {refined && !expanded && (
                    <button
                      onClick={() => rtRef.current && rtRef.current.send("match:expand")}
                      className="mt-1.5 text-xs font-medium text-ember underline underline-offset-2 hover:opacity-80"
                    >
                      Match with anyone now
                    </button>
                  )}
                  <Btn variant="outline" className="mt-5" onClick={next}>
                    Cancel
                  </Btn>
                </div>
              </div>
            )}

            {phase === "connecting" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/70">
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel/90 px-5 py-3 text-sm text-mute">
                  <Loader2 size={16} className="anim-spin-slow text-aqua" />
                  Establishing secure peer-to-peer connection…
                </div>
              </div>
            )}

            {phase === "ended" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/85 p-6">
                <div className="anim-fade-up max-w-sm text-center">
                  <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ghost text-mute">
                    <Square size={22} />
                  </span>
                  <h3 className="font-display text-xl font-semibold">{END_LABELS[endReason] || "Conversation ended"}</h3>
                  {endReason === "failed" && (
                    <p className="mt-2 text-sm text-mute">
                      {S.current.ice?.some((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => /^turns?:/i.test(url)))
                        ? "Direct peer-to-peer traffic may be blocked on one network. Try again or check your connection."
                        : "Direct peer-to-peer traffic may be blocked on one network. This server has no TURN relay configured; configure TURN_URL and credentials on the backend, then try again."}
                    </p>
                  )}
                  <div className="mt-5 flex justify-center gap-3">
                    <Btn onClick={next}>
                      <SkipForward size={16} className="text-accent" />
                      Next stranger
                    </Btn>
                    <Btn variant="outline" onClick={stop}>
                      Stop
                    </Btn>
                  </div>
                </div>
              </div>
            )}

            {phase === "error" && errorInfo && (
              <div className="absolute inset-0 grid place-items-center bg-ink/90 p-6">
                <div className="anim-fade-up max-w-sm text-center">
                  <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-danger/15 text-danger">
                    <AlertTriangle size={22} />
                  </span>
                  <h3 className="font-display text-lg font-semibold">{errorInfo.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{errorInfo.hint}</p>
                  <div className="mt-5 flex justify-center gap-3">
                    <Btn onClick={start}>Try again</Btn>
                    <Btn variant="outline" onClick={() => navigate("/")}>
                      Back home
                    </Btn>
                  </div>
                </div>
              </div>
            )}

            {needTapAudio && phase !== "idle" && (
              <button
                onClick={enableAudio}
                className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-warn/50 bg-warn/15 px-4 py-2 text-xs font-medium text-warn backdrop-blur"
              >
                Tap to enable audio
              </button>
            )}
          </div>

          {/* Inline FilterPanel removed — the floating chat-panel button now
              drives the same UI via <FilterModal> at the page level below. */}

          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-line bg-panel p-2.5">
            <IconBtn title={micOn ? "Mute microphone" : "Unmute microphone"} active={micOn} onClick={toggleMic} disabled={phase === "idle" || phase === "error"}>
              {micOn ? <Mic size={18} /> : <MicOff size={18} className="text-danger" />}
            </IconBtn>
            <IconBtn title={camOn ? "Turn camera off" : "Turn camera on"} active={camOn} onClick={toggleCam} disabled={phase === "idle" || phase === "error"}>
              {camOn ? <Video size={18} /> : <VideoOff size={18} className="text-danger" />}
            </IconBtn>
            <IconBtn title="Switch camera" onClick={cycleCam} disabled={cameras.length < 2 || !inSession}>
              <SwitchCameraIcon size={18} />
            </IconBtn>
            <IconBtn title="Fullscreen" onClick={fullscreen} disabled={phase === "idle"}>
              <Maximize2 size={18} />
            </IconBtn>
            <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
            <Btn onClick={next} disabled={phase === "starting" || (phase === "idle" && rtStatus !== "live")}>
              <SkipForward size={16} className="text-accent" />
              {phase === "queued" ? "Cancel" : "Next"}
            </Btn>
            <Btn variant="danger" onClick={stop} disabled={phase === "idle" || phase === "starting"}>
              <Square size={15} />
              Stop
            </Btn>
            <IconBtn title="Report stranger" onClick={() => setReportOpen(true)} disabled={!inSession} className="border-danger/40 text-danger hover:bg-danger/15">
              <Ban size={18} />
            </IconBtn>
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-col gap-2 lg:w-[380px]">
          {(phase === "idle" || phase === "ended" || phase === "error") && (
            <div className="flex shrink-0 items-center">
              <AdvancedFiltersButton
                onClick={openFilters}
                activeCount={activeCount(prefs)}
                active={filtersOpen}
              />
            </div>
          )}
          <aside className="relative flex h-[46vh] min-h-[320px] w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-display text-sm font-semibold">Chat</h3>
            <span className="text-[11px] text-dim">Enter to send · Shift+Enter for new line</span>
          </div>
          <div className="min-h-0 flex-1">
            <ChatWindow messages={messages} typing={typing} canSend={phase === "live"} onSend={sendMsg} onTyping={sendTyping} />
          </div>
          </aside>
        </div>
      </main>

      <FilterModal
        open={filtersOpen}
        prefs={prefs}
        onOpen={() => {
          // pause any current match/queue so the user is configuring, not chatting
          if (S.current.state === "queued") {
            rtRef.current?.send("match:cancel");
            setP("idle");
          } else if (S.current.state === "matched" || S.current.state === "connecting") {
            if (S.current.matchId) rtRef.current?.send("match:next", { matchId: S.current.matchId });
            teardown(false);
            setP("idle");
          }
        }}
        onClose={closeFilters}
        onApply={(next) => {
          applyPrefs(next);
          setFiltersOpen(false);
        }}
      />

      <AgeGate
        open={ageOpen}
        onConfirm={() => {
          sessionStorage.setItem("drift-age-ok", "1");
          setAgeOpen(false);
        }}
        onDecline={() => navigate("/")}
      />
      {reportOpen && <ReportPanel onReport={sendReport} onClose={() => setReportOpen(false)} busy={reportBusy} />}
    </div>
  );
}

function WaitingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ff6a3d" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16.2 14.2c2.3.2 4 1.8 4.5 4.3" />
    </svg>
  );
}
