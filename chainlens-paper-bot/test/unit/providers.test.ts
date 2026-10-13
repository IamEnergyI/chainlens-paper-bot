import { describe, it, expect } from "vitest";
import { assertQuoteUsable } from "../../src/providers/interfaces.js";
import type { NormalizedQuote } from "../../src/domain/types.js";

const quote = (over: Partial<NormalizedQuote> = {}): NormalizedQuote => ({
  provider: "fixture", route: "r", chain: "solana", tokenIn: "USD", tokenOut: "t",
  requestedAmountIn: 1000n, expectedAmountOut: 5000n, feeBps: 0,
  priceImpactBps: 10, quotedAtMs: 1000, ttlMs: 30_000, rawRef: null, ...over
});

describe("quote gating", () => {
  it("accepts fresh usable quote", () => {
    expect(() => assertQuoteUsable(quote(), 5_000, 1000)).not.toThrow();
  });
  it("rejects stale quote", () => {
    expect(() => assertQuoteUsable(quote(), 40_000, 1000)).toThrow(/QUOTE_EXPIRED/);
  });
  it("zero output is unavailable, not zero value", () => {
    expect(() => assertQuoteUsable(quote({ expectedAmountOut: 0n }), 2_000, 1000)).toThrow(/QUOTE_UNAVAILABLE/);
  });
  it("rejects excessive price impact", () => {
    expect(() => assertQuoteUsable(quote({ priceImpactBps: 2000 }), 2_000, 1000)).toThrow(/RISK_REJECTED/);
  });
});
