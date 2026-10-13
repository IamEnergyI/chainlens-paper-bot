-- ChainLens paper bot: initial schema (PostgreSQL / Supabase compatible).
BEGIN;

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE user_settings (
  user_id BIGINT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  risk_profile TEXT NOT NULL DEFAULT 'Balanced' CHECK (risk_profile IN ('Conservative','Balanced','EarlyEntry')),
  notification_policy TEXT NOT NULL DEFAULT 'Smart',
  notification_categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours JSONB,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usage_counters (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, counter_key, window_start)
);

CREATE TABLE tokens (
  id BIGSERIAL PRIMARY KEY,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  name TEXT,
  symbol TEXT,
  decimals INT NOT NULL DEFAULT 9,
  pool_id TEXT,
  token_created_at TIMESTAMPTZ,
  pool_created_at TIMESTAMPTZ,
  eligibility TEXT NOT NULL DEFAULT 'Detected' CHECK (eligibility IN ('Detected','Analyzable','QuoteEligible')),
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain, address)
);

CREATE TABLE market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  token_id BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  price NUMERIC(40,12),
  market_cap_usd NUMERIC(30,6),
  market_cap_basis TEXT CHECK (market_cap_basis IN ('circulating','total-supply','fully-diluted')),
  liquidity_usd NUMERIC(30,6),
  volume_24h_usd NUMERIC(30,6),
  holder_count INT,
  holder_concentration_top10 NUMERIC(8,6),
  authorities_revoked BOOLEAN,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_snapshots_token_time ON market_snapshots(token_id, observed_at DESC);

CREATE TABLE risk_assessments (
  id BIGSERIAL PRIMARY KEY,
  token_id BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  profile TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE strategies (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','paused','archived')),
  current_version_id BIGINT,
  virtual_cash_usd NUMERIC(30,6) NOT NULL DEFAULT 1000,
  simulation_run_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_strategies_user ON strategies(user_id) WHERE deleted_at IS NULL;

CREATE TABLE strategy_versions (
  id BIGSERIAL PRIMARY KEY,
  strategy_id BIGINT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  version INT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, version)
);

CREATE TABLE simulation_runs (
  id BIGSERIAL PRIMARY KEY,
  strategy_id BIGINT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE simulation_accounts (
  id BIGSERIAL PRIMARY KEY,
  strategy_id BIGINT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  simulation_run_id BIGINT NOT NULL REFERENCES simulation_runs(id),
  cash_usd NUMERIC(30,6) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, simulation_run_id)
);

-- Orders (entry or exit intent) carry both signal-status and order-status fields.
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  strategy_id BIGINT NOT NULL REFERENCES strategies(id),
  token_id BIGINT NOT NULL REFERENCES tokens(id),
  direction TEXT NOT NULL CHECK (direction IN ('entry','exit')),
  signal_status TEXT NOT NULL,
  order_status TEXT NOT NULL DEFAULT 'pending',
  requested_amount_usd NUMERIC(30,6) NOT NULL,
  quote JSONB,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_strategy ON orders(strategy_id);

CREATE TABLE positions (
  id BIGSERIAL PRIMARY KEY,
  strategy_id BIGINT NOT NULL REFERENCES strategies(id),
  token_id BIGINT NOT NULL REFERENCES tokens(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closing','closed','abandoned')),
  entry_exit_config JSONB NOT NULL, -- entry-time exit configuration snapshot
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX idx_positions_open ON positions(strategy_id) WHERE status IN ('open','closing');

CREATE TABLE fills (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  position_id BIGINT REFERENCES positions(id),
  token_amount NUMERIC(48,0) NOT NULL,
  price_usd NUMERIC(40,12) NOT NULL,
  fee_usd NUMERIC(30,6) NOT NULL,
  slippage_bps NUMERIC(10,4),
  simulated_price_usd NUMERIC(40,12) NOT NULL,
  sim_model_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable double-entry ledger. Never UPDATE or DELETE.
CREATE TABLE ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  strategy_id BIGINT NOT NULL REFERENCES strategies(id),
  simulation_run_id BIGINT NOT NULL REFERENCES simulation_runs(id),
  position_id BIGINT REFERENCES positions(id),
  order_id BIGINT REFERENCES orders(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('credit_cash','debit_cash','debit_asset','credit_asset','debit_fee','pnl_realized')),
  asset TEXT NOT NULL, -- 'USD' or chain:address
  amount NUMERIC(48,6) NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE exposure_reservations (
  id BIGSERIAL PRIMARY KEY,
  strategy_id BIGINT NOT NULL REFERENCES strategies(id),
  token_id BIGINT NOT NULL REFERENCES tokens(id),
  amount_usd NUMERIC(30,6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','released','converted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_exposure_held ON exposure_reservations(strategy_id, token_id) WHERE status = 'held';

CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  queue TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','done','dead')),
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_claim ON jobs(queue, status, run_at) WHERE status IN ('pending','leased');

CREATE TABLE processed_events (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE TABLE notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_claim ON notification_outbox(status, next_attempt_at);

CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id BIGINT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_health (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
