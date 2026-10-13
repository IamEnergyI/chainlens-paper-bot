import { describe, it, expect } from "vitest";
import { microsFromDecimalString, mulRate, toMicro, toUsd } from "../../src/domain/money.js";

describe("money", () => {
  it("round-trips usd <-> micros", () => {
    expect(toMicro(1000)).toBe(1_000_000_000n);
    expect(toUsd(1_500_000n)).toBe(1.5);
  });
  it("parses decimal strings exactly", () => {
    expect(microsFromDecimalString("0.000001")).toBe(1n);
    expect(microsFromDecimalString("-12.345678")).toBe(-12_345_678n);
  });
  it("rejects malformed decimals", () => {
    expect(() => microsFromDecimalString("1.0000001")).toThrow();
  });
  it("multiplies rates with bigint precision", () => {
    expect(mulRate(toMicro(100), 3n, 4n)).toBe(toMicro(75));
  });
});
