import { describe, it, expect } from "vitest";
import { sizeEntry } from "../../src/strategy/sizing.js";
import { toUsd } from "../../src/domain/money.js";

const base = {
  currentEquityUsd: 1000, sizingPct: 10, minEntryUsd: 10, maxEntryUsd: 250,
  availableCashUsd: 1000, modeledFeeUsd: 0.01, existingExposureUsd: 0
};

describe("percentage sizing", () => {
  it("sizes 10% of equity", () => {
    expect(toUsd(sizeEntry(base))).toBeCloseTo(100, 6);
  });
  it("caps at max entry", () => {
    expect(toUsd(sizeEntry({ ...base, sizingPct: 80 }))).toBe(250);
  });
  it("respects available cash after fees", () => {
    expect(toUsd(sizeEntry({ ...base, availableCashUsd: 50 }))).toBeCloseTo(49.99, 6);
  });
  it("fails when cash cannot cover modeled costs", () => {
    expect(() => sizeEntry({ ...base, availableCashUsd: 0.005 })).toThrow(/INSUFFICIENT_FUNDS/);
  });
  it("floors at min entry when pct is small", () => {
    expect(toUsd(sizeEntry({ ...base, sizingPct: 0.5 }))).toBe(10);
  });
});
