import { AppError } from "./errors.js";

export const DEFAULT_LIMITS = {
  maxActiveStrategies: 3,
  maxDrafts: 10,
  analysisRequestsPerHour: 60,
  strategyEditsPerHour: 30,
  quoteRequestsPerMinute: 20
} as const;

export function assertWithinLimit(current: number, max: number, what: string): void {
  if (current >= max) throw new AppError("VALIDATION", `${what} limit exceeded (${current}/${max})`);
}
