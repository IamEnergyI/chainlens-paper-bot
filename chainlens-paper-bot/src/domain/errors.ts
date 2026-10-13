/** Structured application errors. Never swallow errors silently. */
export type ErrorCode =
  | "CONFIG_INVALID"
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "DATA_STALE"
  | "DATA_MISSING"
  | "QUOTE_UNAVAILABLE"
  | "QUOTE_EXPIRED"
  | "RISK_REJECTED"
  | "EXPOSURE_CAP"
  | "INSUFFICIENT_FUNDS"
  | "SIGNAL_EXPIRED"
  | "IDEMPOTENCY"
  | "PROVIDER"
  | "JOB_FAILED"
  | "PAPER_MODE_VIOLATION";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;
  constructor(code: ErrorCode, message: string, opts: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {}) {
    super(`[${code}] ${message}`, { cause: opts.cause });
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details ?? {};
    this.name = "AppError";
  }
}
export const err = (code: ErrorCode, msg: string, d?: Record<string, unknown>) => new AppError(code, msg, { details: d });
