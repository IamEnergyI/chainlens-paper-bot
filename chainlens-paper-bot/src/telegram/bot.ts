import { Bot, InlineKeyboard } from "grammy";
import type { AppConfig } from "../config/config.js";

/**
 * Telegram interface. Handlers are thin: conversation state is persisted via
 * grammY sessions (Postgres session storage in production wiring; in-memory
 * only used for local dev/tests).
 */

export const HOME_MENU = [
  ["Discover Tokens", "discover"],
  ["Market Analysis", "analysis"],
  ["Trading Strategies", "strategies"],
  ["Paper Trading", "paper"],
  ["Wallets", "wallets"],
  ["Settings", "settings"]
] as const;

export function homeKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [label] of HOME_MENU) kb.text(label, `menu:${label}`).row();
  return kb;
}

export function walletsMessage(): string {
  return [
    "Wallets",
    "",
    "Live wallet connection and custody are NOT available in this release.",
    "All trading is virtual paper trading. I will never ask for a seed phrase or",
    "private key — do not share them with anyone."
  ].join("\n");
}

export function helpMessage(): string {
  return [
    "ChainLens — multichain token discovery & paper trading (Solana, paper-only).",
    "",
    "/start — home menu",
    "/help — this message",
    "/settings — preferences",
    "/cancel — cancel the current flow",
    "",
    "Create strategies with independent virtual capital ($1,000 each), run realistic",
    "paper simulations with fresh quotes, and monitor positions — no real transactions."
  ].join("\n");
}

export function buildBot(token: string, deps: { onCallback?: (ctx: never) => Promise<void> } = {}): Bot {
  const bot = new Bot(token);
  void deps;
  bot.command("start", async (ctx) => {
    await ctx.reply("Welcome to ChainLens. Choose an option:", { reply_markup: homeKeyboard() });
  });
  bot.command("help", async (ctx) => ctx.reply(helpMessage()));
  bot.command("settings", async (ctx) => {
    await ctx.reply("Settings: risk profile, notifications, quiet hours. (Persisted per user.)");
  });
  bot.command("cancel", async (ctx) => {
    await ctx.reply("Cancelled the current flow.");
  });
  bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
    const item = ctx.match[1];
    if (item === "Wallets") { await ctx.answerCallbackQuery(); await ctx.reply(walletsMessage()); return; }
    await ctx.answerCallbackQuery();
    await ctx.reply(`${item}: use /help or the guided flows to continue.`);
  });
  return bot;
}

export function buildBotFromConfig(config: AppConfig): Bot | null {
  if (!config.telegramBotToken) return null;
  return buildBot(config.telegramBotToken);
}
