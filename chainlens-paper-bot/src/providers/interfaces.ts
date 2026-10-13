import type { NormalizedQuote, ChainId } from "../domain/types.js";
import { AppError } from "../domain/errors.js";

export interface MarketDataProvider {
  readonly name: string;
  chains(): ChainId[];
  fetchToken(chain: ChainId, address: string): Promise<unknown>;
}

export interface QuoteProvider {
  readonly name: string;
  chains(): ChainId[];
  /** Read-only quote. NEVER submits a transaction. */
  getQuote(req: { chain: ChainId; tokenIn: string; tokenOut: string; amountIn: bigint }): Promise<NormalizedQuote>;
}

/** Normalize provider errors into structured AppErrors. */
export function normalizeProviderError(provider: string, e: unknown): AppError {
  if (e instanceof AppError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new AppError("PROVIDER", `${provider}: ${msg}`, { retryable: true, cause: e });
}

/** Quote freshness/validity gate: stale or unsuitable quotes never produce fills. */
export function assertQuoteUsable(q: NormalizedQuote, nowMs: number, maxPriceImpactBps: number, ttlOverrideMs?: number): void {
  const ttl = ttlOverrideMs ?? q.ttlMs;
  if (nowMs - q.quotedAtMs > ttl) throw new AppError("QUOTE_EXPIRED", `quote expired (age ${nowMs - q.quotedAtMs}ms > ttl ${ttl}ms)`);
  if (q.expectedAmountOut <= 0n) throw new AppError("QUOTE_UNAVAILABLE", "quote returned zero output; missing data must not become zero");
  if (q.priceImpactBps !== null && q.priceImpactBps > maxPriceImpactBps) {
    throw new AppError("RISK_REJECTED", `price impact ${q.priceImpactBps}bps exceeds max ${maxPriceImpactBps}bps`);
  }
}
