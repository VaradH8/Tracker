"use client";

import { useEffect, useState } from "react";

export type Role = "Admin" | "Manager" | "User";

const KEY = "tracker-demo-role";

export function useRole(): [Role, (r: Role) => void] {
  const [role, setRoleState] = useState<Role>("Manager");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY) as Role | null;
    if (stored === "Admin" || stored === "Manager" || stored === "User") {
      setRoleState(stored);
    }
    setHydrated(true);
  }, []);

  function setRole(r: Role) {
    window.localStorage.setItem(KEY, r);
    setRoleState(r);
  }

  return [hydrated ? role : "Manager", setRole];
}

export function landingFor(role: Role): string {
  return role === "Admin" ? "/dashboard" : "/my-day";
}
