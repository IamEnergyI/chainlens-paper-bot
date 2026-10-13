import type { NormalizedToken } from "../../src/domain/types.js";

export function makeToken(overrides: Partial<NormalizedToken> = {}): NormalizedToken {
  return {
    chain: "solana",
    address: "SoMeMint111111111111111111111111111111111",
    name: "Fixture Token",
    symbol: "FIX",
    decimals: 9,
    poolId: "pool-1",
    tokenCreatedAtMs: 1_700_000_000_000,
    poolCreatedAtMs: 1_700_000_000_000,
    eligibility: "Analyzable",
    price: { value: 0.000012, source: "fixture", observedAtMs: 1_700_000_060_000 },
    marketCap: { value: 12_000_000n, source: "fixture", observedAtMs: 1_700_000_060_000 },
    marketCapBasis: "circulating",
    liquidityUsd: { value: 250_000_000_000n, source: "fixture", observedAtMs: 1_700_000_060_000 },
    volume24hUsd: { value: 1_500_000_000_000n, source: "fixture", observedAtMs: 1_700_000_060_000 },
    holderCount: { value: 850, source: "fixture", observedAtMs: 1_700_000_060_000 },
    holderConcentrationTop10: { value: 0.32, source: "fixture", observedAtMs: 1_700_000_060_000 },
    authoritiesRevoked: { value: true, source: "fixture", observedAtMs: 1_700_000_060_000 },
    provenance: ["fixture"],
    confidence: "high",
    ...overrides
  };
}
