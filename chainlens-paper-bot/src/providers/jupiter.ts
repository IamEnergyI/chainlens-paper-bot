import type { ChainId, NormalizedQuote } from "../domain/types.js";
import { AppError } from "../domain/errors.js";
import { normalizeProviderError, type QuoteProvider } from "./interfaces.js";

interface JupiterQuoteResponse {
  outAmount: string;
  routePlan?: unknown[];
  priceImpactPct?: string;
  swapUsdValue?: string;
}

/**
 * Jupiter v6 quote adapter (read-only).
 * VERIFICATION STATUS: integration shape per public docs pattern; live access
 * NOT verified in this environment. Contract tests run against fixtures.
 * Verify terms/quotas before production use (docs/provider-evaluation.md).
 */
export class JupiterQuoteProvider implements QuoteProvider {
  readonly name = "jupiter";
  constructor(private baseUrl: string, private fetchFn: typeof fetch = fetch) {}
  chains(): ChainId[] { return ["solana"]; }

  async getQuote(req: { chain: ChainId; tokenIn: string; tokenOut: string; amountIn: bigint }): Promise<NormalizedQuote> {
    if (req.chain !== "solana") throw new AppError("VALIDATION", "jupiter adapter supports solana only");
    // For paper trading we quote in token units; amountIn here is micro-USD of notional
    // expressed as base units by the caller for tokenIn=USDC-equivalent.
    const url = new URL("/v6/quote", this.baseUrl);
    url.searchParams.set("inputMint", req.tokenIn);
    url.searchParams.set("outputMint", req.tokenOut);
    url.searchParams.set("amount", req.amountIn.toString());
    url.searchParams.set("slippageBps", "100");
    try {
      const res = await this.fetchFn(url);
      if (!res.ok) throw new AppError("PROVIDER", `jupiter http ${res.status}`, { retryable: res.status >= 500 });
      const body = (await res.json()) as JupiterQuoteResponse;
      if (!body.outAmount) throw new AppError("QUOTE_UNAVAILABLE", "jupiter returned no outAmount");
      const impact = body.priceImpactPct ? Math.round(parseFloat(body.priceImpactPct) * 100) : null;
      return {
        provider: this.name,
        route: body.routePlan ? "route-plan" : null,
        chain: req.chain,
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        requestedAmountIn: req.amountIn,
        expectedAmountOut: BigInt(body.outAmount),
        feeBps: 0,
        priceImpactBps: impact,
        quotedAtMs: Date.now(),
        ttlMs: 30_000,
        rawRef: null
      };
    } catch (e) {
      throw normalizeProviderError(this.name, e);
    }
  }
}
