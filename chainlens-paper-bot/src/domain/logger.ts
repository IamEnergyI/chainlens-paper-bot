export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}
const SENSITIVE = /(token|secret|key|seed|phrase|password)/i;
export function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : v;
  }
  return out;
}
export function consoleLogger(level: string): Logger {
  const order = { debug: 0, info: 1, warn: 2, error: 3 };
  const min = order[level as keyof typeof order] ?? 1;
  const emit = (lvl: keyof typeof order, msg: string, meta?: Record<string, unknown>) => {
    if (order[lvl] < min) return;
    const line = meta ? `${msg} ${JSON.stringify(redact(meta))}` : msg;
    (lvl === "error" ? console.error : lvl === "warn" ? console.warn : console.log)(line);
  };
  return {
    debug: (m, meta) => emit("debug", m, meta),
    info: (m, meta) => emit("info", m, meta),
    warn: (m, meta) => emit("warn", m, meta),
    error: (m, meta) => emit("error", m, meta)
  };
}
