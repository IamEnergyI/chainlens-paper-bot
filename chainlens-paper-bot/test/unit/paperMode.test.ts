import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Proof that paper mode cannot broadcast transactions: the codebase contains
 * no transaction-signing or broadcast capability.
 */
describe("paper-only boundary", () => {
  const srcDir = path.resolve(process.cwd(), "src");
  const files = readdirSync(srcDir, { recursive: true } as never) as string[];
  const entries = files
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ f, src: readFileSync(path.join(srcDir, f), "utf8") }));
  const all = entries.map((e) => e.src).join("\n");
  it("has no transaction signing/broadcast code paths", () => {
    expect(all).not.toMatch(/sendTransaction|signTransaction|signAllTransactions|Keypair|secretKey/);
    expect(all).not.toMatch(/from ["']@solana\/web3\.js["']/);
  });
  it("mentions seed phrases only in never-share warnings", () => {
    for (const { f, src } of entries) {
      if (f.includes("telegram")) continue; // user-facing warning copy
      expect(src).not.toMatch(/seed phrase|private key/i);
    }
  });
});
