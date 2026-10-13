import { describe, it, expect } from "vitest";
import { DiscoveryPipeline } from "../../src/discovery/pipeline.js";
import { FixedClock } from "../../src/domain/clock.js";
import { makeToken } from "../fixtures/token.js";
import type { RawChainEvent } from "../../src/discovery/pipeline.js";
import { AppError } from "../../src/domain/errors.js";

class FakeDb {
  queries: string[] = [];
  dup = new Set<string>();
  async query(sql: string, params: unknown[] = []) {
    this.queries.push(sql);
    if (sql.startsWith("INSERT INTO processed_events")) {
      const key = `${params[0]}:${params[1]}`;
      if (this.dup.has(key)) return { rows: [], rowCount: 0 };
      this.dup.add(key);
      return { rows: [{ id: 1 }], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO tokens")) return { rows: [{ id: 7 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }
}

const ev = (id: string): RawChainEvent => ({
  source: "pump", externalId: id, chain: "solana",
  tokenAddress: "mint", poolId: "p", tokenCreatedAtMs: null, poolCreatedAtMs: null, raw: {}
});

describe("discovery pipeline", () => {
  it("dedupes repeated events", async () => {
    const db = new FakeDb() as never;
    const pipe = new DiscoveryPipeline(db, new FixedClock(0));
    expect(await pipe.dedupe(ev("e1"))).toBe(true);
    expect(await pipe.dedupe(ev("e1"))).toBe(false);
  });
  it("rejects missing price instead of treating it as zero", () => {
    const db = new FakeDb() as never;
    const pipe = new DiscoveryPipeline(db, new FixedClock(1_000));
    const t = makeToken({ price: null });
    expect(() => pipe.validateFreshness(t, 60_000)).toThrow(AppError);
    expect(() => pipe.validateFreshness(t, 60_000)).toThrow(/DATA_MISSING/);
  });
  it("rejects stale price", () => {
    const db = new FakeDb() as never;
    const pipe = new DiscoveryPipeline(db, new FixedClock(10_000_000));
    const t = makeToken({ price: { value: 1, source: "x", observedAtMs: 0 } });
    expect(() => pipe.validateFreshness(t, 60_000)).toThrow(/DATA_STALE/);
  });
});
