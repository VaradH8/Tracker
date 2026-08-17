/**
 * Reading a domain endpoint, where a failure is allowed to be visible.
 *
 * Most screens here load with `r.ok ? r.json() : { rows: [] }`, which
 * turns a 403 or a 500 into an empty list. On a picker that is a fair
 * trade. On a screen whose whole content is that list it is not: "No
 * tasks yet" and "the server refused" look identical, and the reader
 * concludes they have nothing to do. That is exactly how an approvals
 * history came to read as empty for days.
 *
 * This throws instead, so the caller can say what went wrong.
 */
export async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        `Couldn't load that (HTTP ${res.status}).`,
    );
  }
  return res.json() as Promise<T>;
}
