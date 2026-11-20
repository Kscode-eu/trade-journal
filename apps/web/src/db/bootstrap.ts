import type { Pool } from "pg";

/**
 * Idempotent schema bootstrap, run by the app at startup. Self-hosted software
 * should never make its user run a migration tool; new columns arrive as
 * additive `ALTER TABLE` guards in `migrate` below.
 *
 * Keep in sync with schema.ts.
 */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  broker TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  initial_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  profit_calc_method TEXT NOT NULL DEFAULT 'fifo',
  credentials_enc TEXT,
  auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at TEXT,
  ibkr_sync_time_zone TEXT,
  snapshot_json TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  fee DOUBLE PRECISION NOT NULL DEFAULT 0,
  executed_at TEXT NOT NULL,
  asset_class TEXT,
  source TEXT NOT NULL,
  import_metadata_json TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executions_account_hash ON executions (account_id, content_hash);
CREATE INDEX IF NOT EXISTS executions_account_symbol ON executions (account_id, symbol);

CREATE TABLE IF NOT EXISTS trades (
  key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  asset_class TEXT,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  quantity DOUBLE PRECISION NOT NULL,
  open_quantity DOUBLE PRECISION NOT NULL,
  avg_entry DOUBLE PRECISION NOT NULL,
  avg_exit DOUBLE PRECISION,
  gross_pnl DOUBLE PRECISION NOT NULL,
  fees DOUBLE PRECISION NOT NULL,
  net_pnl DOUBLE PRECISION NOT NULL,
  execution_count INTEGER NOT NULL,
  execution_ids_json TEXT NOT NULL,
  exits_json TEXT NOT NULL,
  duration_ms BIGINT,
  notes TEXT,
  tags_json TEXT,
  mistakes_json TEXT,
  playbook_id TEXT,
  rating INTEGER,
  stop_loss DOUBLE PRECISION,
  profit_target DOUBLE PRECISION,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS trades_account_closed ON trades (account_id, closed_at);
CREATE INDEX IF NOT EXISTS trades_symbol ON trades (symbol);
CREATE INDEX IF NOT EXISTS trades_opened ON trades (opened_at);
CREATE INDEX IF NOT EXISTS trades_account_opened ON trades (account_id, opened_at);

CREATE TABLE IF NOT EXISTS market_csv_datasets (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, symbol TEXT NOT NULL,
 resolution TEXT NOT NULL, currency TEXT NOT NULL, price_basis TEXT NOT NULL,
 bars_json TEXT NOT NULL, imported_at TEXT NOT NULL,
 bar_count INTEGER NOT NULL, first_time BIGINT NOT NULL, last_time BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS market_csv_symbol_resolution ON market_csv_datasets(symbol, resolution);

CREATE TABLE IF NOT EXISTS trade_excursions (
  trade_key TEXT PRIMARY KEY REFERENCES trades(key) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  resolution TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  estimate_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_days (
  date TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags_json TEXT,
  trade_key TEXT,
  day_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_folder ON notes (folder_id);

CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rules_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BYTEA NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS attachments_owner ON attachments(owner_type, owner_id);
CREATE TABLE IF NOT EXISTS note_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trade_rule_checks (id TEXT PRIMARY KEY, trade_key TEXT NOT NULL, playbook_id TEXT NOT NULL, rule TEXT NOT NULL, followed BOOLEAN NOT NULL);
CREATE INDEX IF NOT EXISTS trade_rule_checks_trade ON trade_rule_checks(trade_key);
CREATE TABLE IF NOT EXISTS progress_rules (id TEXT PRIMARY KEY, title TEXT NOT NULL, stage TEXT NOT NULL, weekdays_json TEXT NOT NULL, created_at TEXT NOT NULL, archived_at TEXT);
CREATE TABLE IF NOT EXISTS progress_checks (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, date TEXT NOT NULL, done BOOLEAN NOT NULL);
CREATE INDEX IF NOT EXISTS progress_checks_date ON progress_checks(date);
CREATE TABLE IF NOT EXISTS missed_trades (id TEXT PRIMARY KEY, symbol TEXT NOT NULL, direction TEXT NOT NULL, observed_at TEXT NOT NULL, playbook_id TEXT, entry DOUBLE PRECISION, stop DOUBLE PRECISION, target DOUBLE PRECISION, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, archived_at TEXT);

INSERT INTO folders (id, name, kind, created_at) VALUES
  ('all', 'All notes', 'system', '2026-01-01T00:00:00Z'),
  ('trade-notes', 'Trade notes', 'system', '2026-01-01T00:00:00Z'),
  ('daily-journal', 'Daily journal', 'system', '2026-01-01T00:00:00Z'),
  ('session-recaps', 'Session recaps', 'system', '2026-01-01T00:00:00Z'),
  ('my-notes', 'My notes', 'system', '2026-01-01T00:00:00Z') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS prop_accounts (
 id TEXT PRIMARY KEY, firm TEXT NOT NULL, name TEXT NOT NULL, program TEXT NOT NULL,
 status TEXT NOT NULL, currency TEXT NOT NULL, size_minor BIGINT, parent_id TEXT REFERENCES prop_accounts(id),
 journal_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
 opened_on TEXT NOT NULL, closed_on TEXT, renewal_on TEXT, renewal_minor BIGINT, notes TEXT NOT NULL DEFAULT '',
 archived BOOLEAN NOT NULL DEFAULT FALSE, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prop_entries (
 id TEXT PRIMARY KEY, account_id TEXT REFERENCES prop_accounts(id), firm TEXT NOT NULL, kind TEXT NOT NULL,
 category TEXT NOT NULL, currency TEXT NOT NULL, amount_minor BIGINT NOT NULL, split_bps INTEGER NOT NULL,
 fee_minor BIGINT NOT NULL, occurred_on TEXT NOT NULL, due_on TEXT, status TEXT NOT NULL,
 parent_id TEXT REFERENCES prop_entries(id), reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 voided BOOLEAN NOT NULL DEFAULT FALSE, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prop_entries_account_date ON prop_entries(account_id, occurred_on);
CREATE INDEX IF NOT EXISTS prop_entries_date ON prop_entries(occurred_on);
CREATE TABLE IF NOT EXISTS prop_receipts (
 id TEXT PRIMARY KEY, payout_id TEXT NOT NULL REFERENCES prop_entries(id), kind TEXT NOT NULL, amount_minor BIGINT NOT NULL,
 occurred_on TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 voided BOOLEAN NOT NULL DEFAULT FALSE, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prop_receipts_payout ON prop_receipts(payout_id);
CREATE TABLE IF NOT EXISTS prop_audit (
 id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, before_json TEXT,
 after_json TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prop_audit_entity ON prop_audit(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS import_sources (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 format TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS import_source_aliases (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 format TEXT NOT NULL, alias_key TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS import_source_alias_unique ON import_source_aliases(account_id, format, alias_key);
CREATE TABLE IF NOT EXISTS import_batches (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 format TEXT NOT NULL, fingerprint TEXT NOT NULL, raw_hash TEXT NOT NULL, time_zone TEXT NOT NULL,
 source_ids_json TEXT NOT NULL, from_time TEXT NOT NULL, to_time TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS import_batch_unique ON import_batches(account_id, format, fingerprint);
`;

/** Serialize bootstrap across application workers and commit the schema atomically. */
export async function initializeDatabase(pool: Pool, tenantSchema?: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(734821906)");
    if (tenantSchema) {
      if (!/^(public|user_[a-f0-9]{56})$/.test(tenantSchema))
        throw new Error("Invalid journal schema");
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${tenantSchema}"`);
      await client.query("SELECT set_config('search_path', $1, true)", [tenantSchema]);
    }
    await client.query(BOOTSTRAP_SQL);
    await client.query(`
      ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at TEXT;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ibkr_sync_time_zone TEXT;
      ALTER TABLE executions ADD COLUMN IF NOT EXISTS import_metadata_json TEXT;
      ALTER TABLE market_csv_datasets ADD COLUMN IF NOT EXISTS bar_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE market_csv_datasets ADD COLUMN IF NOT EXISTS first_time BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE market_csv_datasets ADD COLUMN IF NOT EXISTS last_time BIGINT NOT NULL DEFAULT 0;
      UPDATE market_csv_datasets SET
        bar_count = jsonb_array_length(bars_json::jsonb),
        first_time = COALESCE((bars_json::jsonb -> 0 ->> 'time')::bigint, 0),
        last_time = COALESCE((bars_json::jsonb -> -1 ->> 'time')::bigint, 0)
      WHERE bar_count = 0;
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
