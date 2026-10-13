import { loadConfig } from "./config/config.js";
import { consoleLogger } from "./domain/logger.js";
import { buildBotFromConfig } from "./telegram/bot.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = consoleLogger(config.logLevel);
  log.info("chainlens starting", { paperMode: config.paperMode, hasDb: Boolean(config.databaseUrl) });
  if (!config.paperMode) throw new Error("PAPER_MODE must be true in this release");
  const bot = buildBotFromConfig(config);
  if (bot) {
    log.info("starting telegram bot (long polling)");
    await bot.start();
  } else {
    log.warn("TELEGRAM_BOT_TOKEN not set; bot disabled");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
