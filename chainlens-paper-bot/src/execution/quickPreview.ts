import type { NormalizedQuote } from "../domain/types.js";

export interface QuickPreviewResult {
  kind: "estimate";
  assumptions: string[];
  missingData: string[];
  modeledCostsUsd: number;
  note: string;
  quote: NormalizedQuote | null;
}

/**
 * Quick Preview: rough estimate from currently available market info.
 * It never claims a quote was executed and never creates a trade.
 */
export function quickPreview(quote: NormalizedQuote | null, missing: string[]): QuickPreviewResult {
  return {
    kind: "estimate",
    assumptions: [
      "estimate based on latest observed market data",
      "fees and slippage are modeled, not observed",
      "no order was placed and no quote was executed"
    ],
    missingData: missing,
    modeledCostsUsd: 0.01,
    note: "This is a preview only. Begin a simulation to create a recorded paper trade.",
    quote
  };
}
