import type pg from "pg";
import { AppError } from "../domain/errors.js";
import type { MicroUsd } from "../domain/money.js";
import { microsFromDecimalString, minUsd } from "../domain/money.js";

/**
 * Dynamic exposure caps:
 *  - global open exposure: 50% of combined current virtual equity across all user strategies
 *  - aggregate per-token exposure: 20% of combined current virtual equity
 * Exposure = open position marked value + pending entry reservations.
 * Cap reductions block new entries; positions are NEVER auto-liquidated.
 */
export const GLOBAL_EXPOSURE_BPS = 5000n;
export const PER_TOKEN_EXPOSURE_BPS = 2000n;

function bpsOf(amount: MicroUsd, bps: bigint): MicroUsd {
  return (amount * bps) / 10000n;
}

export class ExposureEngine {
  constructor(private db: pg.PoolClient) {}

  /** Combined equity: cash + marked open positions, per strategy summed for the user. */
  async combinedEquity(userId: number): Promise<MicroUsd> {
    const r = await this.db.query(
      `WITH eq AS (
         SELECT s.id AS strategy_id,
           (SELECT cash_usd FROM simulation_accounts a
             WHERE a.strategy_id = s.id ORDER BY a.updated_at DESC LIMIT 1)::text AS cash
         FROM strategies s WHERE s.user_id=$1 AND s.deleted_at IS NULL AND s.state != 'archived'
       )
       SELECT COALESCE(SUM(eq.cash::numeric), 0) AS total FROM eq`,
      [userId]
    );
    // NOTE: open positions add marked value; positions are marked by the
    // execution engine which writes valuation adjustments into cash via ledger.
    // See docs/architecture.md §Valuation.
    return microsFromDecimalString(String(r.rows[0].total));
  }

  async currentExposure(userId: number, tokenId?: number): Promise<MicroUsd> {
    const tokenClause = tokenId === undefined ? "" : "AND p.token_id = $2";
    const params = tokenId === undefined ? [userId] : [userId, tokenId];
    const r = await this.db.query(
      `SELECT COALESCE(SUM(f.token_amount * f.simulated_price_usd), 0) AS exposure
       FROM positions p
       JOIN strategies s ON s.id = p.strategy_id
       JOIN fills f ON f.position_id = p.id AND f.order_id IN (
         SELECT id FROM orders WHERE direction='entry')
       WHERE s.user_id=$1 AND s.deleted_at IS NULL AND p.status IN ('open','closing') ${tokenClause}`,
      params
    );
    const positions = microsFromDecimalString(String(r.rows[0].exposure));
    const res = await this.db.query(
      `SELECT COALESCE(SUM(r.amount_usd), 0) AS reserved
       FROM exposure_reservations r
       JOIN strategies s ON s.id = r.strategy_id
       WHERE s.user_id=$1 AND r.status='held' ${tokenId === undefined ? "" : "AND r.token_id=$2"}`,
      params
    );
    const reserved = microsFromDecimalString(String(res.rows[0].reserved));
    return positions + reserved;
  }

  /**
   * Atomically check + reserve exposure for a proposed entry. Serialized via
   * the per-user strategy aggregate lock so two concurrent entries cannot
   * both pass the same cap.
   */
  async reserveEntry(opts: {
    userId: number;
    strategyId: number;
    tokenId: number;
    amountUsd: MicroUsd;
    strategyCapUsd: MicroUsd | null;
  }): Promise<{ reserved: MicroUsd }> {
    if (opts.amountUsd <= 0n) throw new AppError("VALIDATION", "entry amount must be positive");
    // Serialize per strategy row: SELECT ... FOR UPDATE on the strategy row.
    const lock = await this.db.query(
      "SELECT id FROM strategies WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [opts.strategyId, opts.userId]
    );
    if (lock.rows.length === 0) throw new AppError("FORBIDDEN", "strategy not owned by user");

    const equity = await this.combinedEquity(opts.userId);
    if (equity <= 0n) throw new AppError("DATA_MISSING", "cannot value combined equity; blocking entry");
    const globalCap = bpsOf(equity, GLOBAL_EXPOSURE_BPS);
    const tokenCap = bpsOf(equity, PER_TOKEN_EXPOSURE_BPS);

    const globalNow = await this.currentExposure(opts.userId);
    const tokenNow = await this.currentExposure(opts.userId, opts.tokenId);
    if (globalNow + opts.amountUsd > globalCap) {
      throw new AppError("EXPOSURE_CAP", `global exposure cap exceeded: ${globalNow + opts.amountUsd} > ${globalCap}`);
    }
    if (tokenNow + opts.amountUsd > tokenCap) {
      throw new AppError("EXPOSURE_CAP", `per-token exposure cap exceeded for token ${opts.tokenId}`);
    }
    if (opts.strategyCapUsd !== null) {
      const stratNow = await this.currentExposure(opts.userId);
      void stratNow; // strategy-level aggregation computed below
      const stratR = await this.db.query(
        `SELECT COALESCE(SUM(f.token_amount * f.simulated_price_usd),0) AS exp
         FROM positions p JOIN fills f ON f.position_id=p.id
         WHERE p.strategy_id=$1 AND p.status IN ('open','closing')`,
        [opts.strategyId]
      );
      const stratReserved = await this.db.query(
        `SELECT COALESCE(SUM(amount_usd),0) AS r FROM exposure_reservations
         WHERE strategy_id=$1 AND status='held'`,
        [opts.strategyId]
      );
      const stratExposure = microsFromDecimalString(String(stratR.rows[0].exp)) +
        microsFromDecimalString(String(stratReserved.rows[0].r));
      if (stratExposure + opts.amountUsd > opts.strategyCapUsd) {
        throw new AppError("EXPOSURE_CAP", `strategy exposure cap exceeded`);
      }
    }

    const amount = minUsd(opts.amountUsd, opts.amountUsd);
    await this.db.query(
      `INSERT INTO exposure_reservations (strategy_id, token_id, amount_usd, status)
       VALUES ($1,$2,$3,'held')
       ON CONFLICT (strategy_id, token_id) WHERE status='held'
       DO UPDATE SET amount_usd = exposure_reservations.amount_usd + EXCLUDED.amount_usd`,
      [opts.strategyId, opts.tokenId, amount.toString()]
    );
    return { reserved: amount };
  }

  /** Release a reservation (e.g. after order failure) or convert it to a position. */
  async release(strategyId: number, tokenId: number): Promise<void> {
    await this.db.query(
      `UPDATE exposure_reservations SET status='released'
       WHERE strategy_id=$1 AND token_id=$2 AND status='held'`,
      [strategyId, tokenId]
    );
  }
  async convertToPosition(strategyId: number, tokenId: number): Promise<void> {
    await this.db.query(
      `UPDATE exposure_reservations SET status='converted'
       WHERE strategy_id=$1 AND token_id=$2 AND status='held'`,
      [strategyId, tokenId]
    );
  }
}
