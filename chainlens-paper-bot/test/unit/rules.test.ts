import { describe, it, expect } from "vitest";
import { evaluateEntry, findContradictions, mustBeActivatable, validateConfig, type StrategyConfig } from "../../src/strategy/rules.js";
import { makeToken } from "../fixtures/token.js";

const NOW = 1_700_000_120_000;
const baseCfg = (): StrategyConfig => ({
  template: "NewLaunchHunter",
  signalLifetimeMs: 60_000,
  riskProfile: "Balanced",
  discovery: { minDataFreshnessMs: 60_000, rules: [{ metric: "liquidityUsd", op: "gte", value: 100_000_000_000n }] },
  entry: { sizingPct: 10, minEntryUsd: 10, maxEntryUsd: 250 },
  exits: { stopLossPct: 20, takeProfitPct: 50, maxHoldSec: null },
  notifications: { categories: ["entry", "exit"] }
});

describe("rule evaluation", () => {
  it("passes a healthy token", () => {
    const r = evaluateEntry(baseCfg(), makeToken(), NOW);
    expect(r.pass).toBe(true);
  });
  it("unknown liquidity fails with reason, not treated as zero", () => {
    const t = makeToken({ liquidityUsd: null });
    const r = evaluateEntry(baseCfg(), t, NOW);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toContain("liquidity unknown");
  });
  it("stale price fails freshness", () => {
    const t = makeToken({ price: { value: 0.1, source: "fixture", observedAtMs: NOW - 120_000 } });
    const r = evaluateEntry(baseCfg(), t, NOW);
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/stale/);
  });
  it("active authorities fail Conservative check", () => {
    const cfg = baseCfg(); cfg.riskProfile = "Conservative";
    const t = makeToken({ authoritiesRevoked: { value: false, source: "fixture", observedAtMs: NOW } });
    const r = evaluateEntry(cfg, t, NOW);
    expect(r.pass).toBe(false);
  });
});

describe("validation and contradictions", () => {
  it("detects TP <= SL contradiction", () => {
    const cfg = baseCfg(); cfg.exits.takeProfitPct = 10; cfg.exits.stopLossPct = 20;
    expect(findContradictions(cfg)).toHaveLength(1);
    expect(() => mustBeActivatable(cfg)).toThrow(/cannot be activated/);
  });
  it("accepts valid config", () => {
    expect(validateConfig(baseCfg())).toEqual([]);
    expect(findContradictions(baseCfg())).toEqual([]);
  });
});
