"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { selectClass, type FieldSize } from "@/lib/domain-ui";

/**
 * A dropdown you can type into.
 *
 * A native `<select>` is fine for four options and useless for forty: the
 * only way to reach a name is to scroll a list that is in whatever order
 * the query returned it. Every picker that lists people, projects or
 * divisions had that problem, and they were all in insertion order.
 *
 * So: options are sorted alphabetically, and a long list gets a search box
 * at the top. Short lists do not — a filter over five items is furniture,
 * and it puts a box between you and the thing you came to click.
 *
 * Deliberately built on a button and a listbox rather than a styled
 * `<select>`: no browser lets you put an input inside a native dropdown,
 * and the alternatives all end up reimplementing this anyway.
 */

export type SelectOption = {
  value: string;
  label: string;
  /** Small print under the label — a role, a client, a count. */
  hint?: string;
  disabled?: boolean;
  /**
   * Keep this option at the top, out of the alphabetical run.
   *
   * For the entries that are not really members of the list: "Everyone",
   * "All projects", "Myself", "Ad hoc — no project". Sorting those by
   * first letter files "Myself" under M, behind half the team, when it is
   * the one entry that is always there and always reachable.
   *
   * Inferred for the two sentinel values every filter in this app already
   * uses — "" for none and "all" for no filter — so the common case needs
   * no flag.
   */
  pinned?: boolean;
};

function isPinned(o: SelectOption): boolean {
  return o.pinned === true || o.value === "" || o.value === "all";
}

/**
 * Below this many options, the search box is more clutter than help. Five
 * is roughly where a list stops being scannable at a glance.
 *
 * It started at eight, which was wrong for the case that matters most: a
 * project's divisions run to four or five entries named things like
 * "MRJN 162/169_BATCH 3", where the first fifteen characters are identical
 * and telling them apart by eye is the whole difficulty. Count is a poor
 * proxy for "hard to scan" — see LONG_LABEL, which catches that directly.
 */
export const SEARCH_THRESHOLD = 5;

/**
 * A label this long is not read at a glance, however few of them there
 * are. Lists of these get a search box on length alone.
 */
export const LONG_LABEL = 24;

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  size = "md",
  className = "",
  disabled,
  sorted = true,
  searchPlaceholder = "Type to search",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown when `value` matches nothing — the empty state, not an option. */
  placeholder?: string;
  size?: FieldSize;
  className?: string;
  disabled?: boolean;
  /**
   * Alphabetical by label. Turn off for a list whose order carries meaning
   * — a status running Pending → Approved → Rejected, or roles in rank
   * order, read wrong when sorted by first letter.
   */
  sorted?: boolean;
  searchPlaceholder?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  /**
   * Where to draw the popover, in viewport coordinates.
   *
   * It is rendered into document.body rather than beside the button,
   * because several of the places this control lives sit inside a card
   * with `overflow-hidden` — the per-person assign form is one — and an
   * absolutely positioned list inside one of those is simply cut off at
   * the card's edge. That was the bug: the division list looked truncated
   * and could not be scrolled, because the part you were reaching for had
   * been clipped away rather than hidden behind a scrollbar.
   */
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    dropUp: boolean;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const ordered = useMemo(() => {
    if (!sorted) return options;
    // Pinned entries keep the order they were given; everything else goes
    // alphabetical. localeCompare so accented names sort where a reader
    // expects, and numeric so "Phase 2" comes before "Phase 10".
    const pinned = options.filter(isPinned);
    const rest = options
      .filter((o) => !isPinned(o))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return [...pinned, ...rest];
  }, [options, sorted]);

  const showSearch =
    ordered.length >= SEARCH_THRESHOLD ||
    (ordered.length > 2 && ordered.some((o) => o.label.length > LONG_LABEL));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    // Matches the hint too: people look for "the actionee on Metro" as
    // readily as they look for a name.
    return ordered.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [ordered, query]);

  const selected = options.find((o) => o.value === value) ?? null;

  // Close on an outside click or Escape. Both, because either alone
  // leaves one obvious way out of the popover that does nothing.
  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      // The list is portaled out of this component's subtree, so
      // `root.contains` alone would treat every click inside it as an
      // outside click and close before the option fired.
      if (root.current?.contains(t)) return;
      if (menu.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Measure the trigger and decide where the list goes.
   *
   * Width is at least the trigger's, so it never looks detached, but it is
   * free to grow past it up to a sensible cap — division names like
   * "MRJN 162/169_BATCH 3" do not fit in a 180px field and truncating them
   * there leaves nothing to choose between.
   */
  const place = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const dropUp = below < 220 && above > below;
    setBox({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 8 - Math.max(r.width, 240))),
      // Placed as a plain top coordinate rather than a translate, so the
      // correction pass above can move it without fighting a transform.
      top: dropUp ? Math.max(8, r.top - Math.min(360, above)) : r.bottom,
      width: Math.max(r.width, 240),
      // Never taller than the room available, so the list always ends with
      // a scrollbar rather than running off the screen.
      maxHeight: Math.max(160, Math.min(360, dropUp ? above : below)),
      dropUp,
    });
  }, []);

  /**
   * Correct the placement once the list has a real height.
   *
   * `place` has to guess whether there is room below before the menu
   * exists, and the guess goes wrong whenever opening the menu also
   * changes the layout — expanding a person's assign form pushes the
   * trigger down the page after the measurement was taken. This runs with
   * the actual rendered height and pulls the list back inside the window.
   */
  useLayoutEffect(() => {
    const el = menu.current;
    if (!open || !el || !box) return;
    const h = el.getBoundingClientRect().height;
    const overflow = box.top + h - (window.innerHeight - 8);
    if (overflow > 1) {
      const top = Math.max(8, box.top - overflow);
      // Only when it is genuinely a move: setting the same number back
      // would re-run this effect for ever.
      if (Math.abs(top - box.top) > 1) setBox({ ...box, top });
    }
  }, [open, box]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // `true` for the capture phase: the scroller is usually an ancestor,
    // and scroll does not bubble.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (open && showSearch) search.current?.focus();
    if (!open) {
      setQuery("");
      setActive(0);
    }
  }, [open, showSearch]);

  function pick(o: SelectOption) {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = shown[active];
      if (o) pick(o);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        // Same box as every other control on the page — see domain-ui.
        // A picker that looks different from the select beside it reads as
        // a different kind of thing.
        className={`${selectClass(size, "w-full text-left")} flex items-center gap-2 pr-2`}
      >
        <span
          className={`flex-1 truncate ${selected ? "text-ink-900" : "text-ink-400"}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={menu}
            style={{
              position: "fixed",
              left: box.left,
              top: box.top,
              width: box.width,
              maxWidth: "min(32rem, calc(100vw - 16px))",
            }}
            className="z-50 rounded-card border border-ink-200 bg-white shadow-lg"
          >
          {showSearch && (
            <div className="p-2 border-b border-ink-100">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
                />
                <input
                  ref={search}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-2.5 h-8 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                />
              </div>
            </div>
          )}

          <ul
            id={listId}
            role="listbox"
            style={{ maxHeight: box.maxHeight }}
            className="overflow-y-auto py-1"
          >
            {shown.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-400 italic">
                Nothing matches &ldquo;{query}&rdquo;
              </li>
            ) : (
              shown.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    disabled={o.disabled}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={`w-full text-left px-3 py-1.5 flex items-start gap-2 text-sm disabled:opacity-40 ${
                      i === active ? "bg-ink-50" : ""
                    }`}
                  >
                    <Check
                      size={14}
                      className={`mt-0.5 shrink-0 text-brand-blue ${
                        o.value === value ? "" : "invisible"
                      }`}
                    />
                    {/* Wrapping, not truncating. The closed button truncates
                        because it has one line to work with; the list is
                        where you actually read the name, and three
                        divisions all showing "MRJN 162/169_BATC…" are not
                        a choice. */}
                    <span className="min-w-0">
                      <span className="block text-ink-900 break-words">
                        {o.label}
                      </span>
                      {o.hint && (
                        <span className="block text-xs text-ink-500 break-words">
                          {o.hint}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
