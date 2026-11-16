// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { FolderKanban } from "lucide-react";
import { useEffect, type ReactElement } from "react";

/**
 * Automated accessibility check (axe-core) on the shared building blocks
 * and the sign-in page: WCAG 2.0/2.1/2.2 A and AA rules. Runs in CI with
 * the rest of the tests. jsdom can't lay pages out, so colour contrast is
 * left to manual review; everything else axe knows (labels, names, roles,
 * ARIA, landmarks inside a component) is enforced here.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/account-store", () => ({
  useAccounts: () => ({ signIn: vi.fn(), current: null, hydrated: true }),
}));

import { EmptyState } from "@/components/EmptyState";
import { CardSkeleton, ListSkeleton, PageSkeleton } from "@/components/Skeleton";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ToastProvider, useToast } from "@/components/Toast";
import LoginPage from "@/app/login/page";
import { TRACKER_WELCOME, WelcomeCard } from "@/components/WelcomeCard";

const AXE_OPTIONS = {
  runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  rules: { "color-contrast": { enabled: false } },
};

async function audit(container: HTMLElement) {
  const result = await axe.run(container, AXE_OPTIONS);
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

async function violations(ui: ReactElement) {
  const { container } = render(ui);
  // Let effects (and anything they schedule) settle before auditing.
  await act(async () => {});
  return audit(container);
}

afterEach(cleanup);

function Boom(): ReactElement {
  throw new Error("boom");
}

function ToastWithAction() {
  const toast = useToast();
  // Once only: the provider hands out a fresh context value per render.
  useEffect(() => {
    toast.show("Deleted \"Spec review\".", "info", { label: "Undo", onClick: () => {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe("accessibility (axe)", () => {
  it("catches a real violation (guards against a silently-passing setup)", async () => {
    const found = await violations(<div><input type="text" /><button type="button"><svg /></button></div>);
    expect(found.some((v) => v.startsWith("label:"))).toBe(true);
    expect(found.some((v) => v.startsWith("button-name:"))).toBe(true);
  });

  it("empty state", async () => {
    expect(
      await violations(<EmptyState Icon={FolderKanban} title="No projects yet" message="Create one to get started." />),
    ).toEqual([]);
  });

  it("loading skeletons", async () => {
    expect(await violations(<div><PageSkeleton /><CardSkeleton /><ListSkeleton /></div>)).toEqual([]);
  });

  it("section error fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await violations(<SectionErrorBoundary label="The charts"><Boom /></SectionErrorBoundary>)).toEqual([]);
  });

  it("offline banner", async () => {
    const r = render(<OfflineBanner />);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(r.container.textContent).toMatch(/offline/i);
    expect(await audit(r.container)).toEqual([]);
  });

  it("toast with an Undo action", async () => {
    expect(await violations(<ToastProvider><ToastWithAction /></ToastProvider>)).toEqual([]);
  });

  it("first-run welcome card", async () => {
    window.localStorage.clear();
    const found = await violations(
      <WelcomeCard storageKey="welcome:test" firstName="Asha" {...TRACKER_WELCOME.Developer} />,
    );
    expect(found).toEqual([]);
    expect(screen.getByRole("heading", { name: /Welcome, Asha/ })).toBeTruthy();
  });

  it("first-run welcome card stays dismissed", async () => {
    window.localStorage.setItem("welcome:seen", "dismissed");
    render(<WelcomeCard storageKey="welcome:seen" firstName="Asha" {...TRACKER_WELCOME.Developer} />);
    await act(async () => {});
    expect(screen.queryByText(/Welcome, Asha/)).toBeNull();
  });

  it("sign-in page", async () => {
    expect(await violations(<LoginPage />)).toEqual([]);
    // Each field is named by its visible label, not just its placeholder.
    expect(screen.getByLabelText("Email or username")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });
});
