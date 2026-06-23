"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DomainAuthProvider, useDomain } from "@/lib/domain-store";
import { DomainShell } from "@/components/DomainShell";

export default function DomainLayout({ children }: { children: ReactNode }) {
  return (
    <DomainAuthProvider>
      <Gate>{children}</Gate>
    </DomainAuthProvider>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { current, hydrated } = useDomain();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !current) router.replace("/login?domain=1");
  }, [hydrated, current, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-ink-50 grid place-items-center">
        <p className="text-sm text-ink-500">Loading…</p>
      </div>
    );
  }
  if (!current) return null;
  return <DomainShell>{children}</DomainShell>;
}