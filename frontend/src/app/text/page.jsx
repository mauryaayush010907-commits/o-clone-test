"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RTClient, fmtClock } from "@/lib/rt-client";
import { loadPrefs, savePrefs, activeCount, toFindPayload } from "@/lib/prefs";
import FilterModal from "@/components/FilterModal";
import {
  Logo,
  Btn,
  StatusPill,
  ThemeToggle,
  AgeGate,
  ChatWindow,
  ReportPanel,
  MessageCircle,
  SkipForward,
  Square,
  AlertTriangle,
  Ban,
  Users,
  Loader2,
} from "@/components/ui";
import AdvancedFiltersButton from "@/components/AdvancedFiltersButton";

const END_LABELS = {
  stopped: "Conversation ended",
  disconnected: "The stranger left",
  next: "You ended the conversation",
  failed: "Connection ended",
};

export default function TextChat() {
  const router = useRouter();

  const [rtStatus, setRtStatus] = useState("connecting");
  const [phase, setPhaseState] = useState("idle"); // idle|queued|live|ended
  const [endReason, setEndReason] = useState("");
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [refined, setRefined] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const applyingRef = useRef(false);

  /**
   * Open the floating Advanced Filters modal. Pause any current
   * matchmaking so the user is configuring, not chatting.
   */
  const openFilters = () => setFiltersOpen(true);
  /**
   * Close the modal. The modal will call `onClose` itself; we make sure
   * the matchmaking state machine returns to "idle" so the user can hit
   * Start text chat again with the existing prefs.
   */
  const closeFilters = () => {
    setFiltersOpen(false);
    resumeMatchmaking();
  };

  /**
   * Apply a fresh set of filters: persist, terminate any in-flight
   * match/queue, and start fresh matchmaking with the new prefs.
   * Triggered by the modal's "Apply filters" button.
   */
  /**
   * On open: terminate the in-flight match/queue and reset to idle.
   * The user must press Start (or Apply) to begin again.
   */
  const pauseMatchmaking = () => {
    const s = S.current;
    if (s.state === "queued" && s.matchId) {
      rtRef.current?.send("match:cancel");
    } else if (s.state === "matched" && s.matchId) {
      rtRef.current?.send("match:stop", { matchId: s.matchId });
    }
    s.matchId = null;
    setMessages((m) => [...m, { system: true, text: "Matchmaking paused — editing filters." }]);
    setRefined(false);
    setExpanded(false);
    setEndReason("");
    setP("idle");
  };

  const resumeMatchmaking = () => {
    // intentionally empty — see applyPrefs for the apply path
  };

  const applyPrefs = (next) => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    savePrefs(next);
    setPrefs(next);

    const s = S.current;
    const wasMatched = s.state === "matched" || s.state === "live";
    const wasQueued = s.state === "queued";
    if (wasMatched && s.matchId) rtRef.current?.send("match:stop", { matchId: s.matchId });
    else if (wasQueued) rtRef.current?.send("match:cancel");

    s.matchId = null;
    setMessages((m) => [...m, { system: true, text: "Filters updated — finding a new match…" }]);
    setRefined(false);
    setExpanded(false);
    setEndReason("");
    setP("queued");
    rtRef.current?.send("match:find", toFindPayload("text", next));
    applyingRef.current = false;
  };

  // Backwards-compat alias kept for safety.
  const updatePrefs = (p) => {
    setPrefs(p);
    savePrefs(p);
  };

  const rtRef = useRef(null);
  const S = useRef({ phase: "idle", matchId: null });
  const matchStartRef = useRef(0);
  const typingTimerRef = useRef(null);
  const remoteTypingRevisionRef = useRef(0);
  const H = useRef({});

  const clearRemoteTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    setTyping(false);
  }, []);

  const setP = useCallback((p) => {
    S.current.phase = p;
    setPhaseState(p);
  }, []);

  H.current = { setP };

  const handleEvent = useCallback(
    (ev, d = {}) => {
      const s = S.current;
      switch (ev) {
        case "match:queued":
          clearRemoteTyping();
          remoteTypingRevisionRef.current = 0;
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
          clearRemoteTyping();
          remoteTypingRevisionRef.current = 0;
          setRefined(false);
          setExpanded(false);
          s.matchId = d.matchId;
          setMessages((m) => [...m, { system: true, text: "Connected with a stranger — be kind." }]);
          matchStartRef.current = Date.now();
          setP("live");
          break;
        case "match:ended":
          if (d.matchId && d.matchId === s.matchId) {
            s.matchId = null;
            clearRemoteTyping();
            setMessages((m) => [...m, { system: true, text: END_LABELS[d.reason] || "Conversation ended" }]);
            setEndReason(d.reason);
            setP("ended");
          }
          break;
        case "chat:message":
          if (d.matchId === s.matchId && typeof d.messageId === "string" && typeof d.from === "string") {
            if (d.from !== rtRef.current?.connId && (
              typeof d.typingRevision !== "number" || d.typingRevision >= remoteTypingRevisionRef.current
            )) {
              if (typeof d.typingRevision === "number") remoteTypingRevisionRef.current = d.typingRevision;
              clearRemoteTyping();
            }
            setMessages((m) => m.some((message) => message.id === d.messageId) ? m : [
              ...m,
              { id: d.messageId, from: d.from, mine: d.from === rtRef.current?.connId, text: d.text, ts: d.ts, time: fmtClock(d.ts) },
            ]);
          }
          break;
        case "chat:typing":
          if (d.matchId === s.matchId) {
            if (typeof d.typingRevision === "number" && d.typingRevision < remoteTypingRevisionRef.current) break;
            if (typeof d.typingRevision === "number") remoteTypingRevisionRef.current = d.typingRevision;
            if (d.typing === false) {
              clearRemoteTyping();
            } else {
              if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
              setTyping(true);
              const matchId = d.matchId;
              const revision = d.typingRevision;
              typingTimerRef.current = setTimeout(() => {
                if (S.current.matchId === matchId && (
                  typeof revision !== "number" || remoteTypingRevisionRef.current === revision
                )) setTyping(false);
                typingTimerRef.current = null;
              }, 1800);
            }
          }
          break;
        case "error":
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
    const rt = new RTClient({
      onEvent: handleEvent,
      onStatus: (st) => {
        setRtStatus(st);
        if (st !== "live") clearRemoteTyping();
        if (st === "failed" && S.current.matchId) {
          S.current.matchId = null;
          setMessages((m) => [...m, { system: true, text: "Lost connection to the server." }]);
          setEndReason("disconnected");
          H.current.setP("ended");
        }
      },
    });
    rtRef.current = rt;
    rt.connect();
    return () => {
      rt.close();
      if (S.current.matchId) {
        try {
          rt.send("match:stop", { matchId: S.current.matchId });
        } catch {
          /* noop */
        }
      }
    };
  }, [clearRemoteTyping, handleEvent]);

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !sessionStorage.getItem("drift-age-ok")) setAgeOpen(true);
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - matchStartRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => {
    if (S.current.phase !== "idle" || !rtRef.current || !rtRef.current.online) return;
    setMessages([]);
    setEndReason("");
    setP("queued");
    rtRef.current.send("match:find", toFindPayload("text", prefs));
  };

  const next = () => {
    if (!rtRef.current || !rtRef.current.online) return;
    clearRemoteTyping();
    if (S.current.phase === "queued") {
      rtRef.current.send("match:cancel");
      setP("idle");
      return;
    }
    if (S.current.matchId) rtRef.current.send("match:next", { matchId: S.current.matchId });
    S.current.matchId = null;
    setMessages([]);
    setEndReason("");
    setP("queued");
    rtRef.current.send("match:find", toFindPayload("text", prefs));
  };

  const stop = () => {
    clearRemoteTyping();
    if (S.current.phase === "queued") rtRef.current && rtRef.current.send("match:cancel");
    else if (S.current.matchId) rtRef.current && rtRef.current.send("match:stop", { matchId: S.current.matchId });
    S.current.matchId = null;
    setMessages([]);
    setEndReason("");
    setP("idle");
  };

  const sendMsg = (text) => {
    if (!S.current.matchId || !rtRef.current?.online) return false;
    return rtRef.current.send("chat:message", { matchId: S.current.matchId, text }).then((result) => result?.ok === true);
  };
  const sendTyping = (typing = true) => {
    if (S.current.matchId && S.current.phase === "live") rtRef.current && rtRef.current.send("chat:typing", { matchId: S.current.matchId, typing });
  };
  const sendReport = (reason, details) => {
    setReportBusy(true);
    if (S.current.matchId) rtRef.current && rtRef.current.send("user:report", { matchId: S.current.matchId, reason, details });
    setTimeout(() => setReportBusy(false), 600);
  };

  const status =
    rtStatus !== "live"
      ? { tone: "bad", label: rtStatus === "reconnecting" ? "Reconnecting…" : rtStatus === "failed" ? "Server offline" : "Connecting…" }
      : phase === "live"
        ? { tone: "live", label: "Connected", pulse: true }
        : phase === "queued"
          ? { tone: "wait", label: "Finding a stranger…", pulse: true }
          : phase === "ended"
            ? { tone: "bad", label: "Ended" }
            : { tone: "idle", label: "Ready" };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <div className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-3">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo size={26} />
          </Link>
          <div className="flex items-center gap-2">
            {phase === "live" && (
              <span className="hidden rounded-full border border-line bg-panel2/60 px-3 py-1 font-mono text-xs text-mute sm:inline">
                {mm}:{ss}
              </span>
            )}
            <StatusPill tone={status.tone} label={status.label} pulse={status.pulse} />
            <ThemeToggle />
          </div>
        </div>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3 p-3">
        {(phase === "idle" || phase === "ended") && (
          <div className="flex shrink-0 items-center">
            <AdvancedFiltersButton
              onClick={openFilters}
              activeCount={activeCount(prefs)}
              active={filtersOpen}
            />
          </div>
        )}
        {/* The filter modal itself is mounted at the page level below the </main>. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
          {/* Paused state behind the modal — match is suspended, not searching. */}
          {filtersOpen && (
            <div
              role="status"
              className="pointer-events-none absolute inset-x-0 top-12 z-[1] flex justify-center"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn/15 px-3 py-1 text-[11px] font-medium text-warn">
                <AlertTriangle size={11} /> Matchmaking paused
              </span>
            </div>
          )}

          {/* phase banner inside chat top */}
          {phase === "idle" && (
            <div className="grid place-items-center border-b border-line bg-panel2/30 p-6 text-center">
              <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-aqua/12 text-aqua">
                <MessageCircle size={20} />
              </span>
              <h2 className="font-display text-lg font-semibold">Text-only chat</h2>
              <p className="mt-1 max-w-sm text-sm text-mute">
                No camera, no microphone — just words. You'll be paired with another text-mode stranger.
              </p>
              <Btn size="lg" className="mt-4" onClick={start} disabled={rtStatus !== "live"}>
                <MessageCircle size={17} className="text-accent" />
                Start text chat
              </Btn>
            </div>
          )}
          {phase === "queued" && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-panel2/30 p-4">
              <Loader2 size={16} className="anim-spin-slow text-warn" />
              <span className="text-sm text-mute">Looking for a text partner…</span>
              {refined && !expanded && (
                <span className="text-xs text-warn">
                  Refined · {activeCount(prefs)} filter{activeCount(prefs) > 1 ? "s" : ""} — widening automatically if needed
                </span>
              )}
              {expanded && <span className="text-xs text-aqua">Searching everyone…</span>}
              {refined && !expanded && (
                <button
                  onClick={() => rtRef.current && rtRef.current.send("match:expand")}
                  className="text-xs font-medium text-ember underline underline-offset-2 hover:opacity-80"
                >
                  Match with anyone now
                </button>
              )}
              <button onClick={next} className="text-xs text-dim underline-offset-2 hover:text-fog hover:underline">
                Cancel
              </button>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            <ChatWindow
              messages={messages}
              typing={typing}
              canSend={phase === "live"}
              onSend={sendMsg}
              onTyping={sendTyping}
              chatSurface
              composerClassName="chat-composer"
            />
          </div>

          {/* controls */}
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line p-2.5">
            <Btn onClick={next} disabled={rtStatus !== "live"}>
              <SkipForward size={16} className="text-accent" />
              {phase === "queued" ? "Cancel search" : "Next stranger"}
            </Btn>
            <Btn variant="danger" onClick={stop} disabled={phase === "idle"}>
              <Square size={15} />
              Stop
            </Btn>
            <Btn variant="outline" onClick={() => setReportOpen(true)} disabled={phase !== "live"}>
              <Ban size={15} className="text-danger" />
              Report
            </Btn>
            <span className="ml-1 hidden items-center gap-1.5 text-[11px] text-dim sm:flex">
              <Users size={13} />
              {phase === "live" ? "Matched with one stranger" : "No active conversation"}
            </span>
          </div>
        </div>

        {phase === "ended" && (
          <div className="anim-fade-up mt-3 flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel p-5 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <h3 className="font-display font-semibold">{END_LABELS[endReason] || "Conversation ended"}</h3>
              <p className="mt-0.5 text-sm text-mute">Jump straight into a new conversation or stop for now.</p>
            </div>
            <div className="flex gap-2">
              <Btn onClick={next}>
                <SkipForward size={16} className="text-accent" />
                Next stranger
              </Btn>
              <Btn variant="outline" onClick={stop}>
                Stop
              </Btn>
            </div>
          </div>
        )}
      </main>

      <AgeGate
        open={ageOpen}
        onConfirm={() => {
          sessionStorage.setItem("drift-age-ok", "1");
          setAgeOpen(false);
        }}
        onDecline={() => router.push("/")}
      />
      {reportOpen && <ReportPanel onReport={sendReport} onClose={() => setReportOpen(false)} busy={reportBusy} />}

      <FilterModal
        open={filtersOpen}
        prefs={prefs}
        onOpen={pauseMatchmaking}
        onClose={closeFilters}
        onApply={(next) => {
          applyPrefs(next);
          setFiltersOpen(false);
        }}
      />
    </div>
  );
}
