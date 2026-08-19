/**
 * DD-MM-YY <-> ISO, for the date field.
 *
 * Kept out of the component so it can be tested directly: this is the
 * half that decides whether "31-02-26" becomes a real date in a contract
 * or is refused, and that deserves tests rather than a click-through.
 */

/** ISO `yyyy-mm-dd` as `DD-MM-YY`. Empty string for anything unusable. */
export function isoToDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y.slice(2)}`;
}

/**
 * `DD-MM-YY` back to ISO, or null when it isn't a real date.
 *
 * Two-digit years read into 2000–2099. This tracks work in progress, so a
 * plausible 1970s date is far likelier to be a typo than a real one, and
 * accepting it would drop a project decades out of range.
 */
export function displayToIso(text: string): string | null {
  const m = text.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const iso = `20${yy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  // Round-tripping is what rejects 31-02-26: Date would roll it into
  // March rather than complain.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

/** Digits only, regrouped as DD-MM-YY while typing. */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)]
    .filter(Boolean)
    .join("-");
}
