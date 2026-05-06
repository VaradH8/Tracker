import { useEffect, useState } from "react";

const dotColors = ["#1A73E8", "#EA4335", "#F9AB00", "#34A853"];

export default function App() {
  const [pingStatus, setPingStatus] = useState<string>("…");

  useEffect(() => {
    fetch("/api/v1/ping")
      .then((r) => r.json())
      .then((d) => setPingStatus(d.status ?? "unknown"))
      .catch(() => setPingStatus("unreachable"));
  }, []);

  return (
    <main className="min-h-full flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-card border border-ink-200 p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          {dotColors.map((c) => (
            <span
              key={c}
              className="block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="font-heading font-semibold text-lg ml-2">
            Project Tracker
          </span>
        </div>
        <h1 className="font-heading text-2xl font-semibold mb-2">
          Phase 0 — stack alive
        </h1>
        <p className="text-ink-500 mb-6">
          The Docker stack boots, Caddy proxies <code>/api</code> to the FastAPI
          backend, and the React shell renders. Real screens land in Phase 2.
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-700">Backend ping</span>
          <span
            className={
              pingStatus === "ok"
                ? "px-3 py-1 rounded-pill bg-brand-greenBg text-brand-greenText font-medium"
                : pingStatus === "unreachable"
                  ? "px-3 py-1 rounded-pill bg-brand-redBg text-brand-redText font-medium"
                  : "px-3 py-1 rounded-pill bg-ink-100 text-ink-500 font-medium"
            }
          >
            {pingStatus}
          </span>
        </div>
      </div>
    </main>
  );
}
