import { SlidersHorizontal } from "lucide-react";

export default function AdvancedFiltersButton({ onClick, activeCount = 0, active = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open advanced filters${activeCount > 0 ? ` (${activeCount} active)` : ""}`}
      className={`inline-flex items-center gap-1.5 rounded-full border bg-panel/90 px-2.5 py-1.5 text-[11px] font-medium text-mute shadow-[0_2px_8px_rgba(0,0,0,0.18)] backdrop-blur transition-colors hover:text-fog sm:gap-2 sm:px-3 sm:text-xs ${
        active
          ? "border-ember/60 text-ember"
          : activeCount > 0
            ? "border-ember/40 text-ember"
            : "border-line2 hover:border-line2"
      }`}
    >
      <SlidersHorizontal size={13} />
      <span>Advanced filters</span>
      {activeCount > 0 && (
        <span className="rounded-full bg-ember/20 px-1.5 text-[10px] font-bold tabular-nums text-ember">
          {activeCount}
        </span>
      )}
    </button>
  );
}
