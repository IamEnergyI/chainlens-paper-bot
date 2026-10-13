import { describe, it, expect } from "vitest";
import { SignalSM, PositionSM } from "../../src/domain/statemachine.js";

describe("state machines", () => {
  it("allows the happy-path entry flow", () => {
    const path = ["SignalValidated","RiskChecks","QuoteRequested","QuoteReceived","Revalidate","SimulatedExecution","FillRecorded","PositionOpen"];
    let cur = "SignalDetected";
    for (const next of path) { expect(SignalSM.canTransition(cur, next)).toBe(true); cur = next; }
  });
  it("rejects expired -> anything", () => {
    expect(SignalSM.canTransition("Expired", "SimulatedExecution")).toBe(false);
    expect(() => SignalSM.assertTransition("Expired", "PositionOpen")).toThrow();
  });
  it("quote failure differs from risk rejection by state", () => {
    expect(SignalSM.canTransition("RiskChecks", "QuoteUnavailable")).toBe(true);
    expect(SignalSM.canTransition("RiskChecks", "Rejected")).toBe(true);
  });
  it("exit failure leaves position open (closing -> open)", () => {
    expect(PositionSM.canTransition("closing", "open")).toBe(true);
  });
  it("closed is terminal", () => {
    expect(PositionSM.canTransition("closed", "open")).toBe(false);
  });
});
