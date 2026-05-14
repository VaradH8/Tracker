"use client";

import type { ReactNode } from "react";

/**
 * Reserved for future client-side providers (theme, react-query, etc).
 * Currently a passthrough — auth state lives in localStorage via
 * lib/role.ts.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
