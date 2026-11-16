/**
 * The caller's IP address, for rate limiting.
 *
 * `X-Forwarded-For` is a list: every proxy a request passes through
 * appends the address it received the request from. Only the entries our
 * own proxy added can be trusted — anything to their left came from the
 * client, who can write whatever they like there. Taking the FIRST entry
 * (as this code used to) let an attacker send a fresh made-up address on
 * every request and never hit the per-IP limit.
 *
 * We run behind exactly one proxy (Traefik), so the RIGHT-most entry is
 * the address Traefik saw the connection come from: the real client, or
 * at worst the office NAT. `TRUSTED_PROXY_HOPS` covers a deployment with
 * more proxies in front (e.g. a CDN + Traefik = 2).
 *
 * Falls back to `X-Real-IP` (which Traefik also sets) and then null — in
 * local dev there is usually no proxy and no header at all.
 */
export function clientIp(req: Request): string | null {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) {
      // With N trusted proxies, the client address is N entries from the
      // right. If the list is shorter than that, the left-most is all we have.
      return parts.at(Math.max(0, parts.length - hops)) ?? null;
    }
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}
