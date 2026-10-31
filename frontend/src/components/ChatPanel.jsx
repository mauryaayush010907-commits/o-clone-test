"use client";

import { useState } from "react";
import { Lock, MessageCircle, MoreVertical, Phone, Search, Users, Video } from "lucide-react";
import { ChatWindow } from "@/components/ui";
import AdvancedFiltersButton from "@/components/AdvancedFiltersButton";

/**
 * ChatPanel — the themed chat surface that replaces the default
 * chat column. Inspired by WhatsApp / Telegram:
 *
 *   - Soft patterned backdrop (theme-aware; see .chat-surface in globals.css)
 *   - Rounded chat bubbles with a leading/trailing caret notch
 *   - Day separator pills and right-aligned mine bubbles
 *   - Clean chat-list header with the stranger status pill
 *   - Friendly empty state ("Say hi 👋")
 *
 * Props mirror the ChatWindow it wraps, plus a header:
 *   - strangerLabel: text shown next to the avatar in the header
 *   - statusLabel/tone/pulse: passed through to the status pill
 *   - elapsedMMSS: small monospace timer shown in the header
 */
export default function ChatPanel({
  messages,
  typing,
  canSend,
  onSend,
  onTyping,
  strangerLabel = "Stranger",
  statusLabel,
  statusTone = "live",
  statusPulse = false,
  elapsedMMSS,
  rightExtras,
  /** When provided, renders an "Advanced filters" button above the chat surface. */
  onOpenFilters,
  filtersActiveCount = 0,
  filtersPaused = false,
  emptyState,
  children,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {onOpenFilters && (
        <div className="flex shrink-0 items-center">
          <AdvancedFiltersButton
            onClick={onOpenFilters}
            activeCount={filtersActiveCount}
            active={filtersPaused}
          />
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-panel/60 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-panel/90 px-4 py-2.5 backdrop-blur">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-ember/30 to-aqua/25 text-ember">
            <Users size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-sm font-semibold">{strangerLabel}</span>
              {statusLabel && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    statusTone === "live"
                      ? "border-aqua/30 bg-aqua/10 text-aqua"
                      : statusTone === "wait"
                        ? "border-warn/30 bg-warn/10 text-warn"
                        : statusTone === "bad"
                          ? "border-danger/30 bg-danger/10 text-danger"
                          : "border-line bg-panel2/60 text-mute"
                  }`}
                >
                  {statusPulse && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                    </span>
                  )}
                  {statusLabel}
                </span>
              )}
              {elapsedMMSS && (
                <span className="ml-auto hidden font-mono text-[11px] text-mute sm:inline">{elapsedMMSS}</span>
              )}
            </div>
          </div>
          {rightExtras}
        </header>

        <div className="chat-surface chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {messages.length === 0 && !typing ? (
            emptyState || <DefaultEmptyState />
          ) : (
            <div className="px-3 py-3 sm:px-4 sm:py-4">
              <BubbleList messages={messages} typing={typing} />
              <div className="mt-3 px-1">{children}</div>
            </div>
          )}
        </div>

        <ChatWindow messages={[]} typing={false} canSend={canSend} onSend={onSend} onTyping={onTyping} hideList composerClassName="shrink-0" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Bubble list — day separators, mine/peers styling, typing indicator
   ------------------------------------------------------------------ */
function BubbleList({ messages, typing }) {
  const grouped = groupByDay(messages);
  return (
    <>
      {grouped.map((group) => (
        <div key={group.day} className="space-y-1">
          {group.day !== "Today" && (
            <div className="chat-day-sep">
              <span>{group.day}</span>
            </div>
          )}
          {group.items.map((m, i) => (
            <Bubble key={m.id || i} mine={!!m.mine} text={m.text} time={m.time} status={m.status} />
          ))}
        </div>
      ))}
      {typing && <TypingBubble />}
    </>
  );
}

function Bubble({ mine, text, time, status }) {
  return (
    <div className={mine ? "bubble-row-mine" : "bubble-row"}>
      <div className={`bubble ${mine ? "bubble-mine" : ""}`}>
        <span className="block whitespace-pre-wrap pr-12">{text}</span>
        <span className="bubble-meta inline-flex items-center gap-1">
          {time}
          {mine && status === "sent" && (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M2 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(3 0)" />
            </svg>
          )}
          {mine && status === "read" && (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M1 8.5l3 3 7-7" fill="none" stroke="#53bdeb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 8.5l3 3 7-7" fill="none" stroke="#53bdeb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="bubble-row">
      <div className="bubble" style={{ width: 56 }}>
        <span className="flex items-center gap-1 py-0.5">
          <Dot delay={0} />
          <Dot delay={0.18} />
          <Dot delay={0.36} />
        </span>
      </div>
    </div>
  );
}

function Dot({ delay }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{
        background: "currentColor",
        opacity: 0.5,
        animation: "typingPulse 1.1s infinite",
        animationDelay: `${delay}s`,
      }}
    />
  );
}

function groupByDay(messages) {
  if (messages.length === 0) return [];
  const groups = [];
  let last = null;
  for (const m of messages) {
    const d = dayLabel(m.ts);
    if (!last || last.day !== d) {
      last = { day: d, items: [] };
      groups.push(last);
    }
    last.items.push(m);
  }
  return groups;
}

function dayLabel(ts) {
  if (!ts) return "Today";
  const d = new Date(ts);
  const today = new Date();
  const same = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function DefaultEmptyState() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-panel/80 shadow-sm">
          <MessageCircle size={22} className="text-ember" />
        </div>
        <p className="text-base font-medium text-fog">Say hi 👋</p>
        <p className="mx-auto mt-1 max-w-[260px] text-sm text-mute">
          Be kind, be curious, and never share personal information.
        </p>
        <p className="mx-auto mt-3 inline-flex items-center gap-1 rounded-full border border-line bg-panel/70 px-2.5 py-1 text-[11px] text-dim">
          <Lock size={11} /> End-to-end peer-to-peer
        </p>
      </div>
    </div>
  );
}
