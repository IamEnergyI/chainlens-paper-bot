# Security

- No secrets in the repo; `.env` git-ignored; `.env.example` has descriptions only.
- Server-only provider credentials; logs redact keys matching sensitive patterns.
- Every user operation validates ownership (`user_id` from Telegram identity).
- Rate limits and usage counters (see `src/domain/limits.ts`).
- All external input validated at boundaries (zod config; typed adapters).
- Fail closed: new entries are blocked when required checks are unavailable.
- **Live trading is excluded from this release.** It requires a separate security
  architecture (key management, signing, transaction limits, incident response,
  consent, legal review). Paper mode is enforced: `PAPER_MODE=false` aborts startup,
  and `test/unit/paperMode.test.ts` proves no signing/broadcast code path exists.
- Never request or store seed phrases or private keys; the Wallets menu states this.
