/**
 * A project's tag position, from the client's contract down to what is
 * actually finished.
 *
 * Four numbers, and only two of them are stored:
 *
 *   Contract scope      13508   agreed with the client        (stored)
 *   Received from client 10828   released to us to work on     (stored)
 *   Still with client     2680   contract − received           (derived)
 *   Delivered             4857   approved deliveries           (derived)
 *
 * "Still with client" is derived on purpose. Storing it alongside the
 * other two would mean three numbers that have to agree, and the first
 * edit to any of them would put the set out of step.
 *
 * Delivery progress is measured against what we have RECEIVED, not
 * against the contract: you cannot deliver a tag nobody has given you,
 * and dividing by the contract would make a team look behind for work
 * the client hasn't released. Progress against the contract is reported
 * separately for anyone who wants the commercial view.
 */

export type ScopeInput = {
  /** Agreed with the client. Null when the project doesn't track it. */
  contractTags?: number | null;
  /** Released to us — the working scope. */
  totalTags: number;
  /** Approved deliveries. */
  deliveredTags: number;
};

export type ProjectScope = {
  contractTags: number | null;
  receivedTags: number;
  /** Contract minus received; null when there is no contract figure. */
  withClientTags: number | null;
  deliveredTags: number;
  /** Received but not yet delivered. */
  outstandingTags: number;
  /** Delivered ÷ received — progress on the work we hold. */
  deliveredPct: number;
  /** Delivered ÷ contract — progress on the whole commitment. */
  contractPct: number | null;
  /** True when more has been received than contracted, which usually
   *  means the contract figure is stale rather than that the numbers are
   *  wrong. Surfaced rather than silently clamped. */
  receivedExceedsContract: boolean;
};

export function projectScope(p: ScopeInput): ProjectScope {
  const received = Math.max(0, p.totalTags);
  const delivered = Math.max(0, p.deliveredTags);
  const contract =
    p.contractTags === null || p.contractTags === undefined
      ? null
      : Math.max(0, p.contractTags);

  const receivedExceedsContract = contract !== null && received > contract;

  return {
    contractTags: contract,
    receivedTags: received,
    // Clamped at zero so a stale contract figure shows "none outstanding"
    // rather than a negative count nobody can act on.
    withClientTags: contract === null ? null : Math.max(0, contract - received),
    deliveredTags: delivered,
    outstandingTags: Math.max(0, received - delivered),
    deliveredPct: received > 0 ? Math.round((delivered / received) * 100) : 0,
    contractPct:
      contract && contract > 0 ? Math.round((delivered / contract) * 100) : null,
    receivedExceedsContract,
  };
}

/** The labels, in one place, so every screen calls these the same thing. */
export const SCOPE_LABELS = {
  contract: "Contract scope",
  received: "Received from client",
  withClient: "Still with client",
  delivered: "Delivered",
  outstanding: "Outstanding with us",
} as const;
