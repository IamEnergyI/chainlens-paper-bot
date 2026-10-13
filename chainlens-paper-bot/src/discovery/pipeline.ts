import type pg from "pg";
import { AppError } from "../domain/errors.js";
import type { ChainId, NormalizedToken, TokenEligibility } from "../domain/types.js";
import type { Clock } from "../domain/clock.js";

export interface RawChainEvent {
  source: string;
  externalId: string; // unique per source for dedup
  chain: ChainId;
  tokenAddress: string;
  poolId: string | null;
  tokenCreatedAtMs: number | null;
  poolCreatedAtMs: number | null;
  raw: unknown;
}

/**
 * Discovery pipeline: event -> normalize -> identify -> dedup -> enrich ->
 * validate freshness -> store snapshot -> feed. Strategy evaluation is a
 * separate, independent step (never coupled to discovery).
 */
export class DiscoveryPipeline {
  constructor(private db: pg.PoolClient, private clock: Clock) {}

  /** Step 4: deduplicate. Returns true if the event is new. */
  async dedupe(ev: RawChainEvent): Promise<boolean> {
    const r = await this.db.query(
      `INSERT INTO processed_events (source, external_id) VALUES ($1,$2)
       ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
      [ev.source, ev.externalId]
    );
    return r.rows.length > 0;
  }

  /** Steps 3,7,8: upsert token, snapshot, feed. */
  async storeToken(token: NormalizedToken): Promise<number> {
    const r = await this.db.query(
      `INSERT INTO tokens (chain, address, name, symbol, decimals, pool_id, token_created_at, pool_created_at, eligibility, confidence, provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (chain, address) DO UPDATE SET
         name=COALESCE(EXCLUDED.name, tokens.name),
         symbol=COALESCE(EXCLUDED.symbol, tokens.symbol),
         pool_id=COALESCE(EXCLUDED.pool_id, tokens.pool_id),
         last_seen_at=now(),
         eligibility=GREATEST(tokens.eligibility, EXCLUDED.eligibility::text)::text
       RETURNING id`,
      [
        token.chain, token.address, token.name, token.symbol, token.decimals, token.poolId,
        token.tokenCreatedAtMs ? new Date(token.tokenCreatedAtMs) : null,
        token.poolCreatedAtMs ? new Date(token.poolCreatedAtMs) : null,
        token.eligibility, token.confidence, JSON.stringify(token.provenance)
      ]
    );
    return r.rows[0].id as number;
  }

  async storeSnapshot(tokenId: number, token: NormalizedToken): Promise<void> {
    await this.db.query(
      `INSERT INTO market_snapshots
        (token_id, price, market_cap_usd, market_cap_basis, liquidity_usd, volume_24h_usd, holder_count, holder_concentration_top10, authorities_revoked, source, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        tokenId,
        token.price?.value ?? null,
        token.marketCap?.value.toString() ?? null,
        token.marketCapBasis,
        token.liquidityUsd?.value.toString() ?? null,
        token.volume24hUsd?.value.toString() ?? null,
        token.holderCount?.value ?? null,
        token.holderConcentrationTop10?.value ?? null,
        token.authoritiesRevoked?.value ?? null,
        token.price?.source ?? "unknown",
        new Date(token.price?.observedAtMs ?? this.clock.nowMs())
      ]
    );
  }

  /** Step 6: freshness/data-quality validation. Missing data must not become zero. */
  validateFreshness(token: NormalizedToken, maxAgeMs: number): void {
    if (token.price === null) {
      throw new AppError("DATA_MISSING", `token ${token.address}: price unknown; cannot promote eligibility`);
    }
    const age = this.clock.nowMs() - token.price.observedAtMs;
    if (age > maxAgeMs) {
      throw new AppError("DATA_STALE", `token ${token.address}: price stale (${age}ms > ${maxAgeMs}ms)`);
    }
  }

  promoteEligibility(token: NormalizedToken): TokenEligibility {
    if (token.eligibility === "Detected" && token.price !== null) return "Analyzable";
    return token.eligibility;
  }
}
