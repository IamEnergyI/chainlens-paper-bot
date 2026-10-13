import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config/config.js";

describe("config", () => {
  it("fails closed when paper mode is disabled", () => {
    expect(() => loadConfig({ DATABASE_URL: "x", PAPER_MODE: "false" } as NodeJS.ProcessEnv)).toThrow(/PAPER_MODE/);
  });
  it("defaults to paper mode true", () => {
    const c = loadConfig({ DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv);
    expect(c.paperMode).toBe(true);
  });
});
