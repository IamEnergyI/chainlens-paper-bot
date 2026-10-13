import { AppError } from "../domain/errors.js";
import type { NormalizedToken, RiskProfile } from "../domain/types.js";

export type Comparison = "gte" | "lte";
export interface ThresholdRule {
  metric: "liquidityUsd" | "marketCapUsd" | "volume24hUsd" | "holderCount" | "price" | "tokenAgeSec" | "holderConcentrationTop10";
  op: Comparison;
  /** micro-USD for *_Usd metrics; plain number otherwise */
  value: number | bigint;
}
export interface DiscoveryFilter {
  minDataFreshnessMs: number;
  rules: ThresholdRule[];
}
export interface ExitRuleSet {
  stopLossPct: number | null; // e.g. 20 = -20%
  takeProfitPct: number | null;
  maxHoldSec: number | null;
}
export interface StrategyConfig {
  template: "NewLaunchHunter" | "VolumeBreakout" | "LiquidityFirst" | "Custom";
  signalLifetimeMs: number;
  riskProfile: RiskProfile;
  discovery: DiscoveryFilter;
  entry: { sizingPct: number; minEntryUsd: number; maxEntryUsd: number };
  exits: ExitRuleSet;
  notifications: { categories: string[] };
}

/** Risk profiles tighten configurable checks; they are NOT safety guarantees. */
export const RISK_PROFILES: Record<RiskProfile, { maxDataAgeMs: number; requireAuthorityCheck: boolean; maxTop10Concentration: number | null }> = {
  Conservative: { maxDataAgeMs: 30_000, requireAuthorityCheck: true, maxTop10Concentration: 0.5 },
  Balanced: { maxDataAgeMs: 60_000, requireAuthorityCheck: true, maxTop10Concentration: null },
  EarlyEntry: { maxDataAgeMs: 15_000, requireAuthorityCheck: true, maxTop10Concentration: null }
};

export const TEMPLATE_DEFAULTS: Record<StrategyConfig["template"], Partial<StrategyConfig>> = {
  NewLaunchHunter: { signalLifetimeMs: 60_000 },
  VolumeBreakout: { signalLifetimeMs: 5 * 60_000 },
  LiquidityFirst: { signalLifetimeMs: 60_000 },
  Custom: { signalLifetimeMs: 60_000 }
};

export function validateConfig(cfg: StrategyConfig): string[] {
  const problems: string[] = [];
  if (cfg.entry.sizingPct <= 0 || cfg.entry.sizingPct > 100) problems.push("sizingPct must be in (0, 100]");
  if (cfg.entry.minEntryUsd > cfg.entry.maxEntryUsd) problems.push("minEntryUsd exceeds maxEntryUsd");
  if (cfg.exits.stopLossPct !== null && cfg.exits.stopLossPct <= 0) problems.push("stopLossPct must be positive or null");
  if (cfg.exits.takeProfitPct !== null && cfg.exits.takeProfitPct <= 0) problems.push("takeProfitPct must be positive or null");
  for (const r of cfg.discovery.rules) {
    if ((r.metric === "holderConcentrationTop10") && (Number(r.value) < 0 || Number(r.value) > 1)) {
      problems.push("holderConcentrationTop10 must be between 0 and 1");
    }
  }
  return problems;
}

function ageSec(token: NormalizedToken, nowMs: number): number | null {
  if (token.tokenCreatedAtMs === null) return null;
  return (nowMs - token.tokenCreatedAtMs) / 1000;
}

/**
 * Evaluate discovery filters + risk profile against a normalized token.
 * Missing metrics are NOT treated as zero: an unknown required metric fails
 * the check with a stated reason.
 */
export function evaluateEntry(cfg: StrategyConfig, token: NormalizedToken, nowMs: number): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const profile = RISK_PROFILES[cfg.riskProfile];

  // data freshness of price
  const priceFresh = token.price !== null && nowMs - token.price.observedAtMs <= profile.maxDataAgeMs;
  if (!priceFresh) reasons.push(`price data missing or stale (>${profile.maxDataAgeMs}ms)`);

  for (const rule of cfg.discovery.rules) {
    switch (rule.metric) {
      case "liquidityUsd": {
        if (token.liquidityUsd === null) { reasons.push("liquidity unknown"); break; }
        if (token.liquidityUsd.value < BigInt(rule.value)) reasons.push(`liquidity ${token.liquidityUsd.value} < ${rule.value}`);
        break;
      }
      case "marketCapUsd": {
        if (token.marketCap === null) { reasons.push("market cap unknown"); break; }
        if (token.marketCap.value < BigInt(rule.value)) reasons.push(`market cap below threshold`);
        break;
      }
      case "volume24hUsd": {
        if (token.volume24hUsd === null) { reasons.push("24h volume unknown"); break; }
        if (token.volume24hUsd.value < BigInt(rule.value)) reasons.push("24h volume below threshold");
        break;
      }
      case "holderCount": {
        if (token.holderCount === null) { reasons.push("holder count unknown"); break; }
        if (token.holderCount.value < Number(rule.value)) reasons.push("holder count below threshold");
        break;
      }
      case "tokenAgeSec": {
        const a = ageSec(token, nowMs);
        if (a === null) { reasons.push("token age unknown"); break; }
        const ok = rule.op === "gte" ? a >= Number(rule.value) : a <= Number(rule.value);
        if (!ok) reasons.push(`token age ${a}s failed ${rule.op} ${rule.value}`);
        break;
      }
      case "holderConcentrationTop10": {
        if (token.holderConcentrationTop10 === null) { reasons.push("holder concentration unknown"); break; }
        if (profile.maxTop10Concentration !== null && token.holderConcentrationTop10.value > profile.maxTop10Concentration) {
          reasons.push("top-10 holder concentration above profile limit");
        }
        break;
      }
      case "price": {
        if (token.price === null) { reasons.push("price unknown"); break; }
        const ok = rule.op === "gte" ? token.price.value >= Number(rule.value) : token.price.value <= Number(rule.value);
        if (!ok) reasons.push("price threshold not met");
        break;
      }
    }
  }
  if (profile.requireAuthorityCheck && token.authoritiesRevoked !== null && token.authoritiesRevoked.value === false) {
    reasons.push("token authorities not revoked (mint/freeze active)");
  }
  return { pass: reasons.length === 0, reasons };
}

/** Contradiction detection for the guided builder. */
export function findContradictions(cfg: StrategyConfig): string[] {
  const out: string[] = [];
  const ex = cfg.exits;
  if (ex.stopLossPct !== null && ex.takeProfitPct !== null && ex.takeProfitPct <= ex.stopLossPct) {
    out.push(`takeProfitPct (${ex.takeProfitPct}%) must be greater than stopLossPct (${ex.stopLossPct}%)`);
  }
  if (cfg.entry.minEntryUsd > cfg.entry.maxEntryUsd) {
    out.push(`minEntryUsd (${cfg.entry.minEntryUsd}) exceeds maxEntryUsd (${cfg.entry.maxEntryUsd})`);
  }
  return out;
}

export function mustBeActivatable(cfg: StrategyConfig): void {
  const problems = [...validateConfig(cfg), ...findContradictions(cfg)];
  if (problems.length > 0) throw new AppError("VALIDATION", `strategy cannot be activated: ${problems.join("; ")}`, { details: { problems } });
}
