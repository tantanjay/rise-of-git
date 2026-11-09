import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

/*
 * Combobox: a searchable single-select for long lists (repos, projects, clients). The list opens in a portal over
 * everything (it never gets clipped by a scrolling modal), filters as you type, groups options under headers, and
 * works from the keyboard (↑ ↓ to move, Enter to pick, Esc to close).
 */

export interface ComboOption {
  value: string;
  label: string;
  /** A second line under the label (a parent path, an owner…) */
  sublabel?: string;
  /** Options with the same group are listed together under that header */
  group?: string;
  /** What the search matches, never shown (default: label, sublabel and group). Give it to widen the match (developer
   *  names, logins) or to narrow it (a repo's name only) */
  search?: string;
  /** What the closed button shows when picked (default: the label), e.g. the full parent path */
  selectedLabel?: string;
  /** Shown at the right of the row */
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface ComboboxProps {
  options: ComboOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Rows drawn at once; past it the list asks for a narrower search */
  maxShown?: number;
  disabled?: boolean;
  className?: string;
  /** Lets the selection be cleared with an ✕ */
  clearable?: boolean;
  size?: "sm" | "md";
  /** Show the search box (default: only for lists longer than 8). Pass it for lists that grow (repos, projects, Clients) */
  searchable?: boolean;
  /** Accessible name when no visible label sits next to it */
  ariaLabel?: string;
  title?: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Pick…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing matches.",
  maxShown = 150,
  disabled,
  className = "",
  clearable,
  size = "md",
  searchable,
  ariaLabel,
  title
}: ComboboxProps) {
  const withSearch = searchable ?? options.length > 8;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  // Every word of the query must appear in the label, sublabel or hidden search text
  const filtered = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const hay = norm(o.search ?? `${o.label} ${o.sublabel ?? ""} ${o.group ?? ""}`);
      return words.every((w) => hay.includes(w));
    });
  }, [options, query]);
  const shown = filtered.slice(0, maxShown);
  const pickable = shown.filter((o) => !o.disabled);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    const maxH = Math.max(160, Math.min(380, (up ? r.top : below) - 16));
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 280) - 8)), top: up ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 280), up, maxH });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  // Opening shows the picked option highlighted and in view; typing highlights the top match (Enter picks it)
  const centre = useRef(false);
  useEffect(() => {
    const at = open && !query ? pickable.findIndex((o) => o.value === value) : -1;
    centre.current = at >= 0;
    setActive(Math.max(0, at));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens or the query changes, not as options re-render
  }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const el = list.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: centre.current ? "center" : "nearest" });
    centre.current = false;
  }, [active, open]);

  const choose = (o: ComboOption) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery("");
    btn.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(pickable.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (pickable[active]) choose(pickable[active]);
    } else if (e.key === "Escape") {
      // Close the list only, not the modal behind it
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      btn.current?.focus();
    }
  };

  // Group headers in the order groups first appear
  const rows: Array<{ header: string } | { option: ComboOption; idx: number }> = [];
  let lastGroup: string | undefined;
  for (const o of shown) {
    if (o.group !== undefined && o.group !== lastGroup) rows.push({ header: o.group });
    lastGroup = o.group;
    rows.push({ option: o, idx: o.disabled ? -1 : pickable.indexOf(o) });
  }

  const pad = size === "sm" ? "px-2 py-1 text-[11px] min-h-7" : "px-3 py-2 text-sm min-h-9";

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`w-full flex items-center gap-2 rounded-xl bg-slate-950 border text-left transition disabled:opacity-50 disabled:cursor-not-allowed ${open ? "border-sky-500/70" : "border-slate-700 hover:border-slate-500"} ${pad} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
      >
        {selected?.icon}
        {/* One line, so a picker is as tall as its neighbours: the sublabel follows the label, muted, and gives way first */}
        <span className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className={`truncate ${selected ? "text-slate-100" : "text-slate-500"}`}>{selected ? selected.selectedLabel ?? selected.label : placeholder}</span>
          {selected?.sublabel && size === "md" && <span className="truncate shrink-[2] text-[11px] text-slate-500">{selected.sublabel}</span>}
        </span>
        {clearable && selected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="p-0.5 rounded text-slate-500 hover:text-slate-200"
            aria-label="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            className="fixed z-[70] rounded-xl border border-slate-600 bg-slate-900 shadow-2xl shadow-black/60 flex flex-col overflow-hidden animate-fadeIn"
            style={{ left: pos.left, width: pos.width, maxHeight: pos.maxH, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
            onKeyDown={onKey}
          >
            <div className={withSearch ? "p-2 border-b border-slate-800 relative shrink-0" : "sr-only"}>
              <Search className="w-3.5 h-3.5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 outline-none focus:border-sky-500/70"
              />
            </div>
            <div ref={list} role="listbox" className="overflow-y-auto p-1 flex-1">
              {rows.length === 0 && <div className="px-3 py-4 text-center text-xs text-slate-500">{emptyText}</div>}
              {rows.map((r, i) =>
                "header" in r ? (
                  <div key={`h${i}`} className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                    {r.header}
                  </div>
                ) : (
                  <div
                    key={r.option.value}
                    role="option"
                    aria-selected={r.option.value === value}
                    data-idx={r.idx}
                    onMouseEnter={() => r.idx >= 0 && setActive(r.idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(r.option)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer ${r.option.disabled ? "opacity-40 cursor-not-allowed" : r.idx === active ? "bg-sky-500/15 text-sky-50" : "text-slate-200"}`}
                  >
                    {r.option.icon}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{r.option.label}</span>
                      {r.option.sublabel && <span className="block truncate text-[10px] text-slate-500">{r.option.sublabel}</span>}
                    </span>
                    {r.option.hint && <span className="text-[10px] text-slate-500 shrink-0">{r.option.hint}</span>}
                    {r.option.value === value && <Check className="w-3.5 h-3.5 text-sky-300 shrink-0" />}
                  </div>
                )
              )}
              {filtered.length > shown.length && <div className="px-3 py-2 text-[10px] text-slate-500 text-center">{filtered.length - shown.length} more: type to narrow it down.</div>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
