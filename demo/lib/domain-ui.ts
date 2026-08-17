/**
 * Form-control styling for the Engineering module, in one place.
 *
 * Controls were previously styled at each call site, which produced five
 * different date-input sizes across six files, three select sizes, and no
 * focus ring on any of them. Anything that shares a row should share a
 * height, so the sizes live here and call sites pick one.
 */

const BASE =
  "rounded border border-ink-200 bg-white text-ink-900 text-sm transition " +
  "hover:border-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 " +
  "focus:border-brand-blue disabled:opacity-50 disabled:bg-ink-50";

/**
 * Explicit heights rather than vertical padding. `<input>`, `<select>` and
 * `<input type="date">` each derive their intrinsic height differently, so
 * identical padding produced a 38px input beside a 40px select in the same
 * row. Fixing the height makes every control type line up exactly.
 */
const SIZES = {
  /** Dense rows — inline editors, bulk-assign lines. */
  sm: "px-2.5 h-9",
  /** Standalone form fields. */
  md: "px-3 h-10",
} as const;

export type FieldSize = keyof typeof SIZES;

/** Text, number and other ordinary inputs. */
export function inputClass(size: FieldSize = "md", extra = ""): string {
  return `${BASE} ${SIZES[size]} ${extra}`;
}

/** Dropdowns. */
export function selectClass(size: FieldSize = "md", extra = ""): string {
  return `${BASE} ${SIZES[size]} ${extra}`;
}

/**
 * Multi-line text. The only control here that must NOT take a fixed
 * height — it grows with what is typed — so it uses vertical padding
 * instead of a SIZES entry rather than trying to override one. Adding
 * `h-auto` on top of `h-10` would depend on the order Tailwind happens to
 * emit its height utilities, which is not something to rely on.
 */
export function textareaClass(extra = ""): string {
  return `${BASE} px-3 py-2 leading-relaxed resize-y ${extra}`;
}

/**
 * Date inputs. Same box as everything else, plus `.eng-date` (see
 * globals.css) which drags the browser's built-in "dd/mm/yyyy" text onto
 * the app's font and greys it while empty — without that it renders in the
 * browser default and looks like a control from another application.
 */
export function dateClass(size: FieldSize = "md", extra = ""): string {
  return `${BASE} ${SIZES[size]} eng-date ${extra}`;
}
