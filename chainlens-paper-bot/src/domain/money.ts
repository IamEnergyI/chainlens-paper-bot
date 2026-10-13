/**
 * Money is represented as integer micro-USD (1 USD = 1_000_000 units)
 * via bigint, persisted as PostgreSQL NUMERIC. JavaScript floating point
 * is NEVER the authoritative representation of balances.
 */
export type MicroUsd = bigint;

export const MICROS_PER_UNIT = 1_000_000n;
export const ZERO: MicroUsd = 0n;

export function toMicro(usd: number): MicroUsd {
  if (!Number.isFinite(usd)) throw new Error("non-finite amount");
  return BigInt(Math.round(usd * 1_000_000));
}
export function toUsd(m: MicroUsd): number {
  return Number(m) / 1_000_000;
}
export function microsFromDecimalString(s: string): MicroUsd {
  if (!/^-?\d+(\.\d{1,6})?$/.test(s)) throw new Error(`invalid decimal: ${s}`);
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [i = "0", f = ""] = body.split(".");
  const frac = (f + "000000").slice(0, 6);
  const v = BigInt(i) * MICROS_PER_UNIT + BigInt(frac);
  return neg ? -v : v;
}
/** Multiply micro-USD by a rate (e.g. tokens per USD) with rounding. */
export function mulRate(m: MicroUsd, rateNumerator: bigint, rateDenominator: bigint): MicroUsd {
  if (rateDenominator === 0n) throw new Error("division by zero");
  const neg = (m < 0n) !== (rateNumerator < 0n);
  const a = m < 0n ? -m : m;
  const b = rateNumerator < 0n ? -rateNumerator : rateNumerator;
  const q = (a * b) / rateDenominator;
  return neg ? -q : q;
}
export function minUsd(a: MicroUsd, b: MicroUsd): MicroUsd { return a < b ? a : b; }
