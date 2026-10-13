/** Chain identifiers. Architecture supports additional chains without core rewrites. */
export const CHAINS = ["solana", "base", "starknet"] as const;
export type ChainId = (typeof CHAINS)[number];

export type TokenRef = { chain: ChainId; address: string };

/** Token eligibility states — never collapse into a single tradability flag. */
export type TokenEligibility = "Detected" | "Analyzable" | "QuoteEligible";

export type RiskProfile = "Conservative" | "Balanced" | "EarlyEntry";

export type StrategyState = "draft" | "active" | "paused" | "archived";

export type SignalStatus =
  | "SignalDetected"
  | "SignalValidated"
  | "RiskChecks"
  | "QuoteRequested"
  | "QuoteReceived"
  | "Revalidate"
  | "SimulatedExecution"
  | "FillRecorded"
  | "PositionOpen"
  | "Expired"
  | "Rejected"
  | "QuoteUnavailable"
  | "QuoteExpired"
  | "DataDegraded"
  | "SimulationFailed";

export type OrderStatus =
  | "pending"
  | "quoted"
  | "simulated"
  | "filled"
  | "failed"
  | "cancelled";

export type PositionStatus = "open" | "closing" | "closed" | "abandoned";

export type Direction = "entry" | "exit";

/** Every metric carries source + timestamp provenance. */
export interface Metric<T> {
  value: T;
  source: string;
  observedAtMs: number;
}

export interface NormalizedToken {
  chain: ChainId;
  address: string; // mint/contract address, never symbol-only
  name: string | null;
  symbol: string | null;
  decimals: number;
  poolId: string | null;
  tokenCreatedAtMs: number | null;
  poolCreatedAtMs: number | null;
  eligibility: TokenEligibility;
  price: Metric<number> | null;
  marketCap: Metric<bigint> | null; // micro-USD; basis recorded separately
  marketCapBasis: "circulating" | "total-supply" | "fully-diluted" | null;
  liquidityUsd: Metric<bigint> | null;
  volume24hUsd: Metric<bigint> | null;
  holderCount: Metric<number> | null;
  holderConcentrationTop10: Metric<number> | null;
  authoritiesRevoked: Metric<boolean> | null;
  provenance: string[];
  confidence: "high" | "medium" | "low";
}

export interface NormalizedQuote {
  provider: string;
  route: string | null;
  chain: ChainId;
  tokenIn: string;
  tokenOut: string;
  requestedAmountIn: bigint; // base units of tokenIn
  expectedAmountOut: bigint; // base units of tokenOut
  feeBps: number;
  priceImpactBps: number | null;
  quotedAtMs: number;
  ttlMs: number;
  rawRef: string | null;
}
