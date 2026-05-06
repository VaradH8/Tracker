"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Popover({
  trigger,
  children,
  align = "left",
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          className={`absolute z-30 top-full mt-1 ${
            align === "right" ? "right-0" : "left-0"
          } card p-1 min-w-[150px] animate-in fade-in`}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
