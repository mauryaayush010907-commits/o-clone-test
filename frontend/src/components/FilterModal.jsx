/**
 * Floating Advanced Filters modal — opens from the "Advanced filters"
 * button at the top-left of the chat interface. Centered overlay,
 * glassmorphism, scrollable content, full filter vocabulary.
 *
 * Two-tier preference model (draft + apply), same as the previous
 * inline panel so existing wiring continues to work:
 *   - `prefs` (the applied preferences) drive matchmaking and the chat
 *     header. They are owned by the parent and persisted to localStorage.
 *   - The modal maintains an internal `draft` copy. Every control edits
 *     the draft only.
 *   - **Apply filters** calls `onApply(draft)`.
 *   - **Reset** reverts the draft to the current applied prefs.
 *   - **Close** discards unsaved changes and calls `onClose`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SlidersHorizontal,
  Search,
  User,
  Check,
  Globe,
  Users,
  X,
  Sparkles,
  AlertTriangle,
  Play,
  RotateCcw,
  Languages,
  ShieldAlert
} from "lucide-react";
import {
  COUNTRIES,
  LANGUAGES,
  GENDERS,
  defaultPrefs,
  activeCount,
  MAX_COUNTRIES,
  MAX_LANGUAGES
} from "../lib/prefs.js";
import { Btn } from "./ui.jsx";

export default function FilterModal({
  open,
  prefs,
  onApply,
  onClose,
  onOpen, // called once when the modal opens (used to pause matchmaking)
}) {
  const [draft, setDraft] = useState(prefs);
  const [languageQuery, setLanguageQuery] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [applyError, setApplyError] = useState("");
  const appliedCount = activeCount(prefs);
  const draftCount = activeCount(draft);
  const hasRequiredDetails = Boolean(draft.myCountry && draft.myGender);
  const isDirty = useMemo(() => !samePrefs(prefs, draft), [prefs, draft]);
  const wasOpen = useRef(false);
  const lastFocusRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDraft(prefs);
      setLanguageQuery("");
      setCountryQuery("");
      setApplyError("");
      lastFocusRef.current = document.activeElement;
      setTimeout(() => {
        const el = document.getElementById("filter-modal-title");
        if (el) el.focus({ preventScroll: true });
      }, 30);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isDirty) setDraft(prefs);
  }, [prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      onOpen?.();
    }
    if (!open) wasOpen.current = false;
  }, [open, onOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const resetDraft = () => {
    setDraft(prefs);
    setApplyError("");
  };
  const apply = () => {
    if (!isDirty) return;
    if (!hasRequiredDetails) {
      setApplyError("Select your country and gender in About you before applying filters.");
      return;
    }
    onApply?.(draft);
  };
  const updatePersonalDetail = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (next.myCountry && next.myGender) setApplyError("");
  };
  const handleClose = () => {
    onClose?.();
    setTimeout(() => {
      if (lastFocusRef.current && typeof lastFocusRef.current.focus === "function") {
        lastFocusRef.current.focus();
      }
    }, 0);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/70 backdrop-blur-sm anim-fade-in"
        onClick={handleClose}
      />
      <div
        className="anim-fade-up relative flex max-h-[min(86vh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur"
      >
        <div className="flex items-start gap-3 border-b border-line bg-panel/60 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ember/12 text-ember">
            <SlidersHorizontal size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="filter-modal-title" tabIndex={-1} className="font-display text-base font-semibold outline-none">
              Advanced filters
            </h2>
            <p className="mt-0.5 text-[11px] text-dim">
              Partner filters are optional; your country and gender are required to apply.{" "}
              {isDirty
                ? "Press Apply to start matchmaking with these filters."
                : "No filters = instant random matching."}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {isDirty && (
                <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn">
                  <AlertTriangle size={9} /> unsaved
                </span>
              )}
              {appliedCount > 0 && !isDirty && (
                <span className="rounded-full bg-ember/15 px-2 py-0.5 text-[10px] font-semibold text-ember">
                  {appliedCount} active
                </span>
              )}
              {draftCount > 0 && isDirty && (
                <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn">
                  {draftCount} draft
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close advanced filters"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line2 bg-panel2/60 text-mute transition-colors hover:text-fog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="nice-scroll flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="space-y-6">
            <CountryPicker
              draft={draft}
              onChange={setDraft}
              query={countryQuery}
              setQuery={setCountryQuery}
            />
            <LanguagePicker
              draft={draft}
              onChange={setDraft}
              query={languageQuery}
              setQuery={setLanguageQuery}
            />
            <SegmentField icon={Users} label="Show me" hint="Who you'd like to be matched with">
              <Segmented
                value={draft.gender || "everyone"}
                onChange={(v) => setDraft({ ...draft, gender: v === "everyone" ? null : v })}
                options={[{ id: "everyone", label: "Everyone" }, ...GENDERS]}
              />
            </SegmentField>

            <div className="rounded-xl border border-line bg-panel/70 p-3.5">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-fog">
                <User size={14} className="text-mute" />
                About you
                <span className="font-normal text-dim">— helps others' filters find you. Self-reported, unverified.</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <CountrySelect
                  label="Your country *"
                  value={draft.myCountry || ""}
                  onChange={(v) => updatePersonalDetail("myCountry", v || null)}
                  placeholder="Select country"
                />
                <div>
                  <label className="mb-1.5 block text-[11px] text-dim">Your gender *</label>
                  <Segmented
                    value={draft.myGender || "unset"}
                    onChange={(v) => updatePersonalDetail("myGender", v === "unset" ? null : v)}
                    options={[{ id: "unset", label: "Unset" }, ...GENDERS]}
                  />
                </div>

              </div>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-dim">
                <ShieldAlert size={10} /> Your selected country and gender are shared with matchmaking to support others' filters. They are self-reported and unverified.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-line bg-gradient-to-t from-panel via-panel to-panel/70 px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[11px] text-mute">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-ember/10 text-ember">
                {isDirty ? <AlertTriangle size={10} /> : <Sparkles size={10} />}
              </span>
              {isDirty
                ? "Unsaved changes — add your country and gender to apply, or Reset to revert."
                : appliedCount > 0
                  ? `${appliedCount} active filter${appliedCount > 1 ? "s" : ""} — currently matching with these preferences`
                  : "No filters — instant random matching"}
            </div>
            {applyError && (
              <p role="alert" className="mt-2 text-[11px] font-medium text-danger">
                {applyError}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="ghost" onClick={resetDraft} disabled={!isDirty}>
                <RotateCcw size={13} />
                Reset
              </Btn>
              <Btn
                size="sm"
                onClick={apply}
                disabled={!isDirty}
                title={
                  isDirty
                    ? hasRequiredDetails
                      ? "Apply filters, end the current match (if any), and start fresh matchmaking"
                      : "Select your country and gender in About you before applying filters"
                    : "No changes to apply"
                }
              >
                <Play size={13} />
                Apply filters
                {isDirty && draftCount > 0 && (
                  <span className="ml-1 rounded-full bg-accent/20 px-1.5 text-[10px] font-bold text-accent">
                    {draftCount}
                  </span>
                )}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * SelectionInputBar — shared "selection input tab" / tag-picker used by
 * every multi-select filter (countries, languages, ...). Renders an
 * always-visible bar with the current selection as removable pills and
 * a placeholder when empty. Clicking the bar opens a dropdown panel
 * anchored below: a search field and a scrollable list with checkboxes.
 *
 * Props are intentionally list-agnostic so the same component renders
 * countries, languages, or any future multi-select field without
 * duplication.
 */
function SelectionInputBar({
  label,
  hint,
  icon: Icon,
  items,
  selected,
  max,
  placeholder,
  searchPlaceholder,
  query,
  setQuery,
  showCode = true,
  onChange
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const atCap = selected.length >= max;
  const itemsByCode = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(it.code, it);
    return m;
  }, [items]);
  const selectedItems = useMemo(() => {
    return selected.map((code) => itemsByCode.get(code)).filter(Boolean);
  }, [selected, itemsByCode]);
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.code || "").toLowerCase().includes(q)
    );
  }, [items, q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (code) => {
    if (selectedSet.has(code)) {
      onChange(selected.filter((c) => c !== code));
    } else if (!atCap) {
      onChange([...selected, code]);
    }
  };
  const clear = () => onChange([]);
  const removeOne = (code) => onChange(selected.filter((c) => c !== code));

  return (
    <div ref={ref} className="relative">
      <SegmentField icon={Icon} label={label} hint={hint}>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setQuery("");
            setTimeout(() => inputRef.current?.focus(), 30);
          }}
          className={`flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border bg-panel px-2.5 py-2 text-left text-sm transition-all duration-150 ${
            open
              ? "border-ember/60 ring-2 ring-ember/15"
              : "border-line hover:border-line2"
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {selectedItems.length === 0 ? (
            <span className="flex flex-1 items-center gap-2 text-mute">
              {Icon && <Icon size={14} className="text-dim" />}
              <span className="text-[13px]">{placeholder}</span>
            </span>
          ) : (
            <div className="flex flex-1 flex-wrap gap-1.5">
              {selectedItems.map((it) => (
                <span
                  key={it.code}
                  className="inline-flex items-center gap-1 rounded-full border border-ember/40 bg-ember/15 py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-ember"
                >
                  {it.name}
                  <button
                    type="button"
                    aria-label={`Remove ${it.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOne(it.code);
                    }}
                    className="grid h-4 w-4 place-items-center rounded-full transition-colors hover:bg-ember/30"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] text-dim transition-colors hover:bg-ghost hover:text-fog"
            >
              Clear
            </button>
          )}
        </button>

        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="text-dim">
            {atCap ? (
              <span className="text-warn">Max {max} reached — remove one to add another</span>
            ) : (
              <>
                Click the bar to pick from {items.length} {items.length === 1 ? "item" : "items"}.
                {searchPlaceholder ? " Use the search to filter." : ""}
              </>
            )}
          </span>
          {selected.length > 0 && (
            <span className="rounded-full border border-line bg-panel2/60 px-2 py-0.5 font-mono text-[10px] text-mute">
              {selected.length}/{max}
            </span>
          )}
        </div>
      </SegmentField>

      {open && (
        <div className="anim-fade-in absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line bg-panel2/40 px-3">
            <Search size={14} className="text-dim" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder || "Search…"}
              aria-label={searchPlaceholder || "Search"}
              className="w-full bg-transparent py-2.5 text-sm text-fog placeholder:text-dim focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-md px-1.5 py-0.5 text-[11px] text-dim hover:bg-ghost hover:text-fog"
              >
                Clear
              </button>
            )}
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Items" className="nice-scroll max-h-60 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <li className="px-4 py-4 text-center text-xs text-dim">No matches.</li>
            ) : (
              visible.map((it) => {
                const isSel = selectedSet.has(it.code);
                const disabled = !isSel && atCap;
                return (
                  <li key={it.code}>
                    <button
                      type="button"
                      disabled={disabled}
                      role="option"
                      aria-selected={isSel}
                      onClick={() => toggle(it.code)}
                      className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                        isSel ? "bg-ember/10 text-ember" : "text-fog hover:bg-panel2/60"
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                          isSel ? "border-ember bg-ember text-accent" : "border-line2 bg-panel2/60"
                        }`}
                      >
                        {isSel && <Check size={10} />}
                      </span>
                      <span className="flex-1 truncate">{it.name}</span>
                      {showCode && (
                        <span className="font-mono text-[10px] uppercase text-dim">{it.code}</span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CountryPicker — wraps SelectionInputBar with the countries list.
   ============================================================ */
function CountryPicker({ draft, onChange, query, setQuery }) {
  const selected = draft.countries || [];
  return (
    <SelectionInputBar
      icon={Globe}
      label="Preferred countries"
      hint={`${selected.length} of ${MAX_COUNTRIES} selected · leave empty for worldwide`}
      items={COUNTRIES}
      selected={selected}
      max={MAX_COUNTRIES}
      placeholder="Add preferred countries…"
      searchPlaceholder={`Search ${COUNTRIES.length} countries…`}
      query={query}
      setQuery={setQuery}
      showCode
      onChange={(next) => onChange({ ...draft, countries: next })}
    />
  );
}

/* ============================================================
   LanguagePicker — same selection-input-tab pattern as countries.
   ============================================================ */
function LanguagePicker({ draft, onChange, query, setQuery }) {
  const selected = draft.languages || [];
  return (
    <SelectionInputBar
      icon={Languages}
      label="Preferred languages"
      hint={`${selected.length} of ${MAX_LANGUAGES} selected · leave empty for any language`}
      items={LANGUAGES}
      selected={selected}
      max={MAX_LANGUAGES}
      placeholder="Add preferred languages…"
      searchPlaceholder={`Search ${LANGUAGES.length} languages…`}
      query={query}
      setQuery={setQuery}
      showCode
      onChange={(next) => onChange({ ...draft, languages: next })}
    />
  );
}

/* ============================================================
   CountrySelect — search-driven dropdown
   ============================================================ */
function CountrySelect({ label, value, onChange, placeholder = "Unset" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  const items = useMemo(() => {
    const base = [{ code: "", name: placeholder }, { code: "xx", name: "Prefer not to say" }, ...COUNTRIES];
    if (!query.trim()) return base;
    const q = query.trim().toLowerCase();
    return base.filter((c) => c.name.toLowerCase().includes(q) || (c.code && c.code.toLowerCase().includes(q)));
  }, [query, placeholder]);
  const selectedName =
    value === ""
      ? placeholder
      : value === "xx"
        ? "Prefer not to say"
        : COUNTRIES.find((c) => c.code === value)?.name || value;
  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-[11px] text-dim">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-lg border bg-panel px-2.5 py-1.5 text-left text-xs transition-colors ${
          open ? "border-ember/60 ring-2 ring-ember/15" : "border-line hover:border-line2"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`flex-1 truncate ${value ? "text-fog" : "text-dim"}`}>{selectedName}</span>
        <svg viewBox="0 0 16 16" width="12" height="12" className={`text-mute transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="anim-fade-in absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line bg-panel2/40 px-3">
            <Search size={13} className="text-dim" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent py-2 text-sm text-fog placeholder:text-dim focus:outline-none"
            />
          </div>
          <ul role="listbox" className="nice-scroll max-h-60 overflow-y-auto py-1">
            {items.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-dim">No match</li>
            ) : (
              items.map((c) => {
                const isSel = (c.code || "") === (value || "");
                return (
                  <li key={c.code || "_unset"}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => { onChange(c.code); setOpen(false); setQuery(""); }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        isSel ? "bg-ember/10 text-ember" : "text-fog hover:bg-panel2/60"
                      }`}
                    >
                      <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border ${isSel ? "border-ember bg-ember text-accent" : "border-line2 bg-panel2/60"}`}>
                        {isSel && <Check size={9} />}
                      </span>
                      <span className="flex-1 truncate">{c.name}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function SegmentField({ icon: Icon, label, hint, children }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        {Icon && <Icon size={12} className="shrink-0 text-mute" />}
        <span className="text-xs font-medium text-mute">{label}</span>
        {hint && <span className="text-[10px] text-dim">· {hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-panel2/60 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150 ${
            value === o.id
              ? "bg-ember font-semibold text-accent shadow-[0_1px_0_0_rgba(0,0,0,0.06)_inset]"
              : "text-mute hover:text-fog"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function samePrefs(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = [
    "countries",
    "languages",
    "gender",
    "myCountry",
    "myGender",
    "myLanguage",
  ];
  for (const k of keys) {
    const av = a[k], bv = b[k];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return false;
    } else if (av !== bv) return false;
  }
  return true;
}
