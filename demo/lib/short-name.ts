/**
 * The name the app uses to identify a person in task assignees, project
 * rosters, time logs and pickers.
 *
 * It's the first name — unless another account shares that first name,
 * in which case it's the full name ("Pushpalata Patil" vs "Pushpalata").
 * First names alone used to be the identity, so two people with the same
 * first name pooled each other's tasks, hours and project memberships.
 *
 * The server owns the list of names (see refreshShortNames in
 * lib/server-names.ts) and sends each person's label down with the data;
 * the client never computes one itself, so both sides always agree.
 */

const firstOf = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? "";
const tidy = (fullName: string) => fullName.trim().replace(/\s+/g, " ");

/** First names (lower-cased) that more than one account uses. */
let shared = new Set<string>();

/** Pure form: the label for `fullName` given everyone's full names. */
export function shortNameAmong(fullName: string, allNames: string[]): string {
  const key = firstOf(fullName).toLowerCase();
  const count = allNames.filter((n) => firstOf(n).toLowerCase() === key).length;
  return count > 1 ? tidy(fullName) : firstOf(fullName);
}

/** Replace the set of known names. Called by the server before it
 *  serializes anything; until then every name reads as a first name. */
export function setKnownNames(allNames: string[]): void {
  const seen = new Set<string>();
  const next = new Set<string>();
  for (const n of allNames) {
    const key = firstOf(n).toLowerCase();
    if (seen.has(key)) next.add(key);
    seen.add(key);
  }
  shared = next;
}

/** The label for one person, against the last known set of names. */
export function shortName(fullName: string): string {
  return shared.has(firstOf(fullName).toLowerCase())
    ? tidy(fullName)
    : firstOf(fullName);
}
