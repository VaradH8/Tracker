import { prisma } from "./db";
import { setKnownNames } from "./short-name";

/** How long a loaded name list is trusted. Short: a new or renamed user
 *  should get a disambiguated label within seconds, and the query is a
 *  single tiny SELECT. */
const TTL_MS = 30_000;

let loadedAt = 0;
let inflight: Promise<void> | null = null;

/** Make sure shortName() knows every account's name — inactive ones too,
 *  so a deactivated namesake doesn't flip someone's label. Called from
 *  requireUser(), which every API route goes through before serializing. */
export async function refreshShortNames(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  if (!inflight) {
    inflight = prisma.user
      .findMany({ select: { name: true } })
      .then((rows) => {
        setKnownNames(rows.map((r) => r.name));
        loadedAt = Date.now();
      })
      // Labels are cosmetic next to the request itself: on a DB hiccup
      // keep the last list and retry on the next call.
      .catch((e) => console.error("refreshShortNames failed", e))
      .finally(() => {
        inflight = null;
      });
  }
  await inflight;
}
