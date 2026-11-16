"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DomainAuthProvider, useDomain } from "@/lib/domain-store";
import { DomainShell } from "@/components/DomainShell";
import { ShellSkeleton } from "@/components/Skeleton";

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
    if (hydrated && !current) router.replace("/login?engineering=1");
  }, [hydrated, current, router]);

  if (!hydrated) {
    return (
      <ShellSkeleton />
    );
  }
  if (!current) return null;
  return <DomainShell>{children}</DomainShell>;
}