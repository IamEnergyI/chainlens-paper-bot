import { AppError } from "./errors.js";

const ENTRY_TRANSITIONS: Record<string, string[]> = {
  SignalDetected: ["SignalValidated", "Expired", "Rejected"],
  SignalValidated: ["RiskChecks", "DataDegraded", "Expired", "Rejected"],
  RiskChecks: ["QuoteRequested", "Rejected", "QuoteUnavailable"],
  QuoteRequested: ["QuoteReceived", "QuoteUnavailable", "QuoteExpired"],
  QuoteReceived: ["Revalidate", "QuoteExpired", "QuoteUnavailable"],
  Revalidate: ["SimulatedExecution", "Rejected", "DataDegraded", "QuoteExpired"],
  SimulatedExecution: ["FillRecorded", "SimulationFailed"],
  FillRecorded: ["PositionOpen"],
  // terminal
  Expired: [],
  Rejected: [],
  QuoteUnavailable: [],
  QuoteExpired: [],
  DataDegraded: [],
  SimulationFailed: [],
  PositionOpen: []
};

const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["quoted", "failed", "cancelled"],
  quoted: ["simulated", "failed", "cancelled"],
  simulated: ["filled", "failed"],
  filled: [],
  failed: [],
  cancelled: []
};

const POSITION_TRANSITIONS: Record<string, string[]> = {
  open: ["closing", "closed", "abandoned"],
  closing: ["open", "closed", "abandoned"], // failed exit quote leaves position open
  closed: [],
  abandoned: []
};

function assertTransition(table: Record<string, string[]>, from: string, to: string, kind: string): void {
  const allowed = table[from];
  if (!allowed) throw new AppError("VALIDATION", `unknown ${kind} state: ${from}`);
  if (!allowed.includes(to)) {
    throw new AppError("VALIDATION", `illegal ${kind} transition: ${from} -> ${to}`);
  }
}

export const SignalSM = {
  canTransition: (from: string, to: string) => (ENTRY_TRANSITIONS[from] ?? []).includes(to),
  assertTransition: (from: string, to: string) => assertTransition(ENTRY_TRANSITIONS, from, to, "signal")
};
export const OrderSM = {
  canTransition: (from: string, to: string) => (ORDER_TRANSITIONS[from] ?? []).includes(to),
  assertTransition: (from: string, to: string) => assertTransition(ORDER_TRANSITIONS, from, to, "order")
};
export const PositionSM = {
  canTransition: (from: string, to: string) => (POSITION_TRANSITIONS[from] ?? []).includes(to),
  assertTransition: (from: string, to: string) => assertTransition(POSITION_TRANSITIONS, from, to, "position"),
  /** A position may only be marked closed after the exit fill + ledger commit. */
  closeRequiresCommittedFill: true
};
