import { z } from "zod";

const schema = z.object({
  telegramBotToken: z.string().min(1).optional(),
  databaseUrl: z.string().min(1),
  solanaRpcUrl: z.string().url().optional(),
  jupiterQuoteBaseUrl: z.string().url().default("https://quote-api.jup.ag"),
  /** Paper mode guard: this release MUST run with paperMode=true. */
  paperMode: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .refine((v) => v === true, { message: "PAPER_MODE must be true in this release" }),
  operatorIds: z.array(z.string()).default([]),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse({
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    databaseUrl: env.DATABASE_URL,
    solanaRpcUrl: env.SOLANA_RPC_URL,
    jupiterQuoteBaseUrl: env.JUPITER_QUOTE_BASE_URL,
    paperMode: env.PAPER_MODE ?? "true",
    operatorIds: (env.OPERATOR_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL
  });
}
