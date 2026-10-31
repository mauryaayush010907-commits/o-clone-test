/**
 * Mongoose models for the sandbox preview.
 *
 * - Connection: { connId, ip, state, mode, matchId, prefs, expanded, createdAt, lastSeenAt }
 *   - Index: { connId: unique } · { lastSeenAt: 1 } (TTL via 5m refresh)
 *   - Index: { state: 1, mode: 1, createdAt: 1 } (queue scans)
 * - Match: { matchId: unique, a, b, mode, ts } (TTL via index)
 * - Pref: { connId: unique, prefs, expanded, updatedAt } (TTL)
 * - Report: { reason, details, reporterHash, reportedHash, matchId, status, createdAt }
 *
 * Safety: only metadata is stored (hashed IPs, filter sets, match metadata).
 * No chat text, no media, no PII.
 */
import mongoose, { Schema } from "mongoose";

export const ConnSchema = new Schema(
  {
    connId: { type: String, required: true, unique: true, index: true },
    ip: String,
    state: { type: String, default: "idle", index: true },
    mode: { type: String, enum: ["video", "text"], default: null },
    matchId: { type: String, default: null },
    prefs: { type: Schema.Types.Mixed, default: () => ({}) },
    expanded: { type: Boolean, default: false },
    lastFindAt: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
ConnSchema.index({ state: 1, mode: 1, createdAt: 1 });

export const MatchSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    a: { type: String, required: true },
    b: { type: String, required: true },
    mode: { type: String, enum: ["video", "text"], required: true },
    ts: { type: Date, default: Date.now, index: { expires: 600 } }, // 10-min TTL
  },
  { versionKey: false }
);

export const PrefSchema = new Schema(
  {
    connId: { type: String, required: true, unique: true, index: true },
    prefs: { type: Schema.Types.Mixed, default: () => ({}) },
    expanded: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now, index: { expires: 3600 } },
  },
  { versionKey: false }
);

export const ReportSchema = new Schema(
  {
    reason: { type: String, required: true, maxlength: 40 },
    details: { type: String, maxlength: 500 },
    reporterHash: { type: String, required: true, index: true },
    reportedHash: { type: String, required: true, index: true },
    matchId: String,
    status: { type: String, default: "pending", index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export function getModels() {
  return {
    Conn: mongoose.models.Conn || mongoose.model("Conn", ConnSchema),
    Match: mongoose.models.Match || mongoose.model("Match", MatchSchema),
    Pref: mongoose.models.Pref || mongoose.model("Pref", PrefSchema),
    Report: mongoose.models.Report || mongoose.model("Report", ReportSchema),
  };
}
