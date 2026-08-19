"use client";

import { useCallback, useRef } from "react";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainLeaveBoard } from "@/components/DomainLeaveBoard";
import { DomainRefreshButton } from "@/components/DomainRefreshButton";
import { useDomain } from "@/lib/domain-store";
import { canMarkAttendance } from "@/lib/domain-leave";

/**
 * Attendance and time off.
 */
export default function LeavesPage() {
  const { current } = useDomain();

  const reload = useRef<(() => Promise<unknown>) | null>(null);
  const register = useCallback((fn: () => Promise<unknown>) => {
    reload.current = fn;
  }, []);
  const refresh = useCallback(() => reload.current?.() ?? Promise.resolve(), []);

  const supervising = current ? canMarkAttendance(current.role) : false;

  return (
    <DomainPage width="wide">
      <PageHeader
        title="Attendance & leave"
        description={
          supervising
            ? "Mark your team present, absent or on a half day, and decide the requests waiting on you."
            : "Request a half day or a leave, and see where your requests got to."
        }
        actions={<DomainRefreshButton onRefresh={refresh} />}
      />

      <DomainLeaveBoard onReady={register} />
    </DomainPage>
  );
}
