"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Catches a render error in one part of the screen so the rest keeps
 * working. Without it, any crash bubbles to app/error.tsx and replaces the
 * whole page — navigation included — with "Something went wrong".
 *
 * `resetKey`: when it changes (e.g. the route), the boundary clears itself,
 * so moving to another page after an error doesn't keep showing it.
 */
type Props = {
  children: ReactNode;
  /** What failed, in the user's words: "This page", "The charts". */
  label?: string;
  resetKey?: unknown;
  compact?: boolean;
};

type State = { error: Error | null };

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Section crashed:", error, info.componentStack);
    }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const label = this.props.label ?? "This section";
    return (
      <div
        role="alert"
        className={`card text-center ${this.props.compact ? "p-4" : "p-8 m-6"}`}
      >
        <div className="w-10 h-10 mx-auto rounded-full bg-brand-redBg grid place-items-center mb-3">
          <AlertTriangle size={18} className="text-brand-redText" />
        </div>
        <p className="font-heading font-semibold text-ink-900 mb-1">
          {label} couldn&rsquo;t be shown
        </p>
        <p className="text-sm text-ink-500 mb-4">
          Something went wrong here. The rest of the app still works.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="btn-primary"
        >
          Try again
        </button>
      </div>
    );
  }
}
