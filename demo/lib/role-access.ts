/**
 * HR role → access mapping. Shared by the server session (lib/auth.ts)
 * and the client role hook (lib/role.ts), so it carries no "use client"
 * directive.
 *
 * HR has exactly the Co-ordinator's access everywhere, plus one extra
 * privilege: downloading the Monthly / Yearly performance report
 * (see canDownloadPerformance in lib/server-access.ts). Rather than
 * teaching every Co-ordinator check about HR, the session resolves HR to
 * "Coordinator" for access decisions and keeps the real role alongside
 * for labels and the download gate.
 */

export type AnyRole =
  | "Admin"
  | "Lead"
  | "Coordinator"
  | "HR"
  | "BusinessDeveloper"
  | "Developer";

/** The role permission checks should use for someone whose account role
 *  is `role`. */
export function accessRole<R extends AnyRole>(role: R): R | "Coordinator" {
  return role === "HR" ? "Coordinator" : role;
}
