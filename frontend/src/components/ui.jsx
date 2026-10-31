import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Video,
  VideoOff,
  MessageCircle,
  Mic,
  MicOff,
  SwitchCamera,
  Maximize2,
  X,
  SkipForward,
  Send,
  Square,
  AlertTriangle,
  Ban,
  Loader2,
  Lock,
  Users,
  ShieldCheck,
  Radio,
  EyeOff,
  Sun,
  Moon,
  SlidersHorizontal,
} from "lucide-react";
import { getStats } from "../lib/rt.js";

export {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MessageCircle,
  SwitchCamera,
  Maximize2,
  X,
  SkipForward,
  Send,
  Square,
  AlertTriangle,
  Ban,
  Loader2,
  Lock,
  Users,
  ShieldCheck,
  Radio,
  EyeOff,
  SlidersHorizontal,
};

export function Logo({ size = 28, withWord = true }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <span
        className="grid place-items-center rounded-xl bg-gradient-to-br from-ember to-ember2 shadow-[0_4px_18px_rgba(255,106,61,0.35)]"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#0b1017" strokeWidth="2.6" strokeLinecap="round">
          <path d="M5 12a7 7 0 0 1 7-7 7 7 0 0 1 6 3.5" />
          <path d="M19 12a7 7 0 0 1-7 7 7 7 0 0 1-6-3.5" />
        </svg>
      </span>
      {withWord && (
        <span className="font-display text-[17px] font-bold tracking-tight">
          Drift<span className="text-ember">.</span>
        </span>
      )}
    </span>
  );
}

export function Btn({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-ember focus-visible:outline-offset-2";
  const variants = {
    primary:
      "bg-gradient-to-br from-ember to-ember2 text-accent font-semibold shadow-[0_6px_24px_rgba(255,106,61,0.3)] hover:shadow-[0_8px_30px_rgba(255,106,61,0.45)] hover:brightness-105",
    outline: "border border-line2 bg-panel2/60 text-fog hover:bg-panel2 hover:border-dim",
    ghost: "text-mute hover:text-fog hover:bg-ghost",
    danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
    aqua: "bg-aqua/15 border border-aqua/40 text-aqua hover:bg-aqua/25",
  };
  const sizes = { md: "px-4 py-2.5 text-sm", lg: "px-6 py-3.5 text-base", sm: "px-3 py-1.5 text-xs" };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function IconBtn({ title, active = true, className = "", children, ...props }) {
  return (
    <button
      title={title}
      aria-label={title}
      className={`grid h-11 w-11 place-items-center rounded-xl border transition-all duration-150 active:scale-95 disabled:opacity-35 disabled:pointer-events-none ${
        active ? "border-line2 bg-panel2 text-fog hover:bg-line/60" : "border-danger/50 bg-danger/15 text-danger"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const TONES = {
  live: "bg-aqua/15 text-aqua border-aqua/30",
  wait: "bg-warn/15 text-warn border-warn/30",
  bad: "bg-danger/15 text-danger border-danger/30",
  idle: "bg-ghost text-mute border-line2",
};
export function StatusPill({ tone = "idle", label, pulse = false }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${TONES[tone]}`}>
      <span className="relative flex h-2 w-2">
        {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
      </span>
      {label}
    </span>
  );
}

export function AgeGate({ open, onConfirm, onDecline }) {
  const [checked, setChecked] = useState(false);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm anim-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl anim-fade-up">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ember/15 text-ember">
            <Lock size={18} />
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold">Before you start</h3>
            <p className="text-xs text-mute">Drift is intended for adults only.</p>
          </div>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-mute">
          You will be connected with strangers you have never met. You must be <strong className="text-fog">18 years or older</strong>. Do not
          share your name, address, phone number, school, or any other personal information. See the{" "}
          <Link to="/guidelines" className="text-ember hover:underline">
            community guidelines
          </Link>
          .
        </p>
        <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel2/50 p-3 text-sm">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ff6a3d]" />
          <span>I am at least 18 years old, and I agree to follow the community guidelines.</span>
        </label>
        <div className="flex gap-3">
          <Btn variant="outline" className="flex-1" onClick={onDecline}>
            Go back
          </Btn>
          <Btn className="flex-1" disabled={!checked} onClick={onConfirm}>
            Enter Drift
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function ChatWindow({
  messages,
  typing,
  canSend,
  onSend,
  onTyping,
  placeholder = "Type a message…",
  hideList = false,
  chatSurface = false,
  composerClassName = "",
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const sendLockRef = useRef(false);
  const draftVersionRef = useRef(0);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  const send = async () => {
    const submittedText = text;
    const t = submittedText.trim();
    if (!t || !canSend || sending || sendLockRef.current) return;
    sendLockRef.current = true;
    const submittedDraftVersion = draftVersionRef.current;
    setSending(true);
    setSendError("");
    try {
      const result = await onSend(t);
      if (result === false || (result && result.ok === false)) {
        setSendError("Message could not be sent. Check your connection and try again.");
        return;
      }
      setText((current) => draftVersionRef.current === submittedDraftVersion ? "" : current);
      if (draftVersionRef.current === submittedDraftVersion && onTyping) onTyping(false);
      inputRef.current?.focus();
    } catch {
      setSendError("Message could not be sent. Check your connection and try again.");
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hideList && (
        <div
          ref={boxRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 ${
            chatSurface ? "chat-surface chat-scroll" : "nice-scroll space-y-2"
          }`}
        >
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel2 text-mute">
                <MessageCircle size={20} />
              </div>
              <p className="text-sm text-mute">Say hello 👋</p>
              <p className="mx-auto mt-1 max-w-[220px] text-xs text-dim">Be kind, be curious, and never share personal information.</p>
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.system ? (
            <div key={m.id || i} className="anim-msg flex justify-center">
              <span className="rounded-full border border-line bg-panel2/70 px-3 py-1 text-[11px] text-mute">{m.text}</span>
            </div>
          ) : chatSurface ? (
            <div key={m.id || i} className={`anim-msg ${m.mine ? "bubble-row-mine" : "bubble-row"}`}>
              <div className={`bubble ${m.mine ? "bubble-mine" : ""}`}>
                <span className="block whitespace-pre-wrap pr-12">{m.text}</span>
                <span className="bubble-meta inline-flex items-center gap-1">
                  {m.time}
                  {m.mine && (
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M2 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(3 0)" />
                    </svg>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div key={m.id || i} className={`anim-msg flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                  m.mine ? "rounded-br-md bg-ember text-accent" : "rounded-bl-md border border-line bg-panel2 text-fog"
                }`}
              >
                {m.text}
                <div className={`mt-0.5 text-right text-[10px] ${m.mine ? "text-accent/60" : "text-dim"}`}>{m.time}</div>
              </div>
            </div>
          )
        )}
        {typing && (
          chatSurface ? (
            <div className="bubble-row">
              <div className="bubble" style={{ width: 56 }}>
                <span className="flex items-center gap-1 py-0.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "currentColor", opacity: 0.5, animation: "typingPulse 1.1s infinite" }} />
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "currentColor", opacity: 0.5, animation: "typingPulse 1.1s 0.18s infinite" }} />
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "currentColor", opacity: 0.5, animation: "typingPulse 1.1s 0.36s infinite" }} />
                </span>
              </div>
            </div>
          ) : (
            <div className="anim-msg flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-line bg-panel2 px-3.5 py-3">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-mute" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-mute" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-mute" />
              </div>
            </div>
          )
        )}
      </div>
      )}
      <div className={`shrink-0 border-t border-line p-3 ${composerClassName}`}>
        {!canSend ? (
          <div className="grid h-12 place-items-center rounded-xl border border-line bg-panel2/40 text-xs text-dim">
            Messaging is available once you are connected
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={500}
              onChange={(e) => {
                draftVersionRef.current += 1;
                setText(e.target.value);
                if (onTyping) onTyping(e.target.value.length > 0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              className="nice-scroll max-h-28 min-h-12 flex-1 resize-none rounded-xl border border-line bg-panel2/60 px-3.5 py-3 text-sm text-fog placeholder:text-dim focus:border-ember/60 focus:outline-none"
            />
            <Btn onClick={send} disabled={!text.trim() || sending} aria-label="Send message" className="h-12 w-12 !p-0">
              <Send size={18} className="text-accent" />
            </Btn>
          </div>
        )}
        {sendError && <p role="status" className="mt-2 text-xs text-danger">{sendError}</p>}
      </div>
    </div>
  );
}

const REASONS = [
  "Harassment or bullying",
  "Nudity or sexual content",
  "Hate speech or threats",
  "Illegal activity",
  "Scam or fraud",
  "Underage user",
  "Spam or ads",
  "Other",
];

export function ReportPanel({ onReport, onClose, busy }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4 backdrop-blur-sm anim-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl anim-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-danger/15 text-danger">
              <AlertTriangle size={18} />
            </span>
            <div>
              <h3 className="font-display text-lg font-semibold">Report this stranger</h3>
              <p className="text-xs text-mute">Reports are reviewed by our safety team.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-mute hover:bg-ghost hover:text-fog" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {sent ? (
          <div className="rounded-xl border border-aqua/30 bg-aqua/10 p-4 text-sm text-aqua">
            Report submitted. Thank you for keeping Drift safe. We recommend clicking <strong>Next</strong> to leave the conversation.
          </div>
        ) : (
          <>
            <label className="mb-1.5 block text-xs font-medium text-mute">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mb-4 w-full rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm focus:border-ember/60 focus:outline-none"
            >
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <label className="mb-1.5 block text-xs font-medium text-mute">Details (optional)</label>
            <textarea
              rows={3}
              maxLength={500}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happened?"
              className="mb-5 w-full resize-none rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm placeholder:text-dim focus:border-ember/60 focus:outline-none"
            />
            <div className="flex gap-3">
              <Btn variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Btn>
              <Btn
                variant="danger"
                className="flex-1"
                disabled={busy}
                onClick={() => {
                  onReport(reason, details.trim());
                  setSent(true);
                }}
              >
                {busy ? <Loader2 size={16} className="anim-spin-slow" /> : <Ban size={16} />}
                Submit report
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="transition-opacity hover:opacity-85">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <Link to="/video" className="rounded-lg px-3 py-2 text-sm text-mute transition-colors hover:bg-ghost hover:text-fog">
            Video chat
          </Link>
          <Link to="/text" className="rounded-lg px-3 py-2 text-sm text-mute transition-colors hover:bg-ghost hover:text-fog">
            Text chat
          </Link>
          <Link to="/guidelines" className="rounded-lg px-3 py-2 text-sm text-mute transition-colors hover:bg-ghost hover:text-fog">
            Safety
          </Link>
          <Link to="/privacy" className="rounded-lg px-3 py-2 text-sm text-mute transition-colors hover:bg-ghost hover:text-fog">
            Privacy
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/video">
            <Btn>
              <Video size={16} className="text-accent" />
              Start video
            </Btn>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("drift-theme", next);
    } catch {
      /* non-fatal */
    }
    setTheme(next);
  };
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle light or dark mode"
      className="grid h-9 w-9 place-items-center rounded-xl border border-line2 bg-panel2/60 text-mute transition-colors hover:text-fog"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo size={24} />
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-dim">
            Peer-to-peer video and text chat. No recordings, no message storage. Your IP is hashed and kept briefly for abuse prevention only.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-mute">
          <Link to="/privacy" className="hover:text-fog">
            Privacy policy
          </Link>
          <Link to="/terms" className="hover:text-fog">
            Terms of service
          </Link>
          <Link to="/guidelines" className="hover:text-fog">
            Community guidelines
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function ShieldCard({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line2">
      <span className="mb-3 inline-grid h-10 w-10 place-items-center rounded-xl bg-ember/12 text-ember">
        <Icon size={18} />
      </span>
      <h3 className="mb-1 font-display text-[15px] font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-mute">{children}</p>
    </div>
  );
}

export function useStats(intervalMs = 8000) {
  const [stats, setStats] = useState({ online: 0, waiting: { video: 0, text: 0 }, activeMatches: 0 });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await getStats();
      if (alive && s) setStats(s);
    };
    load();
    const t = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);
  return stats;
}
