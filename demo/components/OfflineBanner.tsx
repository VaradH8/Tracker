"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Tells people when the connection drops, before they lose work to it.
 *
 * Every change in the app is saved by an API call; offline, those calls
 * fail and an edit can look done when it isn't. The banner stays up for as
 * long as the browser reports no connection, and says "Back online" for a
 * moment when it returns.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const goOffline = () => {
      clearTimeout(timer);
      setBackOnline(false);
      setOffline(true);
    };
    const goOnline = () => {
      setOffline(false);
      setBackOnline(true);
      timer = setTimeout(() => setBackOnline(false), 3000);
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline && !backOnline) return null;
  return (
    <div
      role="status"
      aria-live="assertive"
      className={`fixed top-0 inset-x-0 z-[110] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
        offline ? "bg-brand-yellowBg text-brand-yellowText border-b border-brand-yellowBorder" : "bg-brand-greenBg text-brand-greenText"
      }`}
    >
      {offline ? (
        <>
          <WifiOff size={16} aria-hidden="true" />
          You&rsquo;re offline. Changes you make now won&rsquo;t be saved until the connection is back.
        </>
      ) : (
        <>
          <Wifi size={16} aria-hidden="true" />
          Back online.
        </>
      )}
    </div>
  );
}
