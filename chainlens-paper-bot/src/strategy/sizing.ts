import type { MicroUsd } from "../domain/money.js";
import { toMicro } from "../domain/money.js";
import { AppError } from "../domain/errors.js";

export interface SizingInput {
  currentEquityUsd: number; // cash + marked positions
  sizingPct: number;
  minEntryUsd: number;
  maxEntryUsd: number;
  availableCashUsd: number;
  modeledFeeUsd: number; // fees + expected slippage cost
  existingExposureUsd: number;
}

/**
 * Percentage-based sizing from current equity, constrained by cash, fees and
 * configured min/max. The allocation percentage is NOT a maximum-loss bound.
 */
export function sizeEntry(input: SizingInput): MicroUsd {
  const { sizingPct, minEntryUsd, maxEntryUsd, availableCashUsd, modeledFeeUsd, existingExposureUsd } = input;
  if (sizingPct <= 0 || sizingPct > 100) throw new AppError("VALIDATION", "sizingPct out of range");
  const equity = toMicro(input.currentEquityUsd);
  let target = (equity * BigInt(Math.round(sizingPct * 100))) / 10_000n;
  target = target < toMicro(minEntryUsd) ? toMicro(minEntryUsd) : target;
  target = target > toMicro(maxEntryUsd) ? toMicro(maxEntryUsd) : target;

  const affordable = toMicro(availableCashUsd) - toMicro(modeledFeeUsd);
  if (affordable <= 0n) throw new AppError("INSUFFICIENT_FUNDS", "available cash does not cover modeled costs");
  if (target > affordable) target = affordable;
  if (target <= 0n) throw new AppError("INSUFFICIENT_FUNDS", "sized entry is zero after constraints");
  void existingExposureUsd;
  return target;
}
