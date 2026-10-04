package app

const schemaSQL = `
CREATE TABLE IF NOT EXISTS users(
  id text PRIMARY KEY, phone text UNIQUE NOT NULL, verified_at timestamptz NOT NULL,
  is_test boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS kv(k text PRIMARY KEY, v text NOT NULL);
CREATE TABLE IF NOT EXISTS events_catalog(
  id text PRIMARY KEY, name text NOT NULL, venue text NOT NULL, starts_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS tiers(
  id text NOT NULL, event_id text NOT NULL REFERENCES events_catalog(id), name text NOT NULL,
  price_cents int NOT NULL, seats int NOT NULL, ord int NOT NULL DEFAULT 0, PRIMARY KEY(event_id,id));
CREATE TABLE IF NOT EXISTS drops(
  id text PRIMARY KEY, event_id text NOT NULL REFERENCES events_catalog(id), mode text NOT NULL DEFAULT 'fairdrop',
  state text NOT NULL, epoch int NOT NULL DEFAULT 0,
  opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL, cutoff_at timestamptz NOT NULL,
  claim_sec int NOT NULL, auto_draw boolean NOT NULL DEFAULT false,
  seed_hash text NOT NULL, seed text, merkle_root text, public_key text NOT NULL,
  entry_count int, beacon_round bigint, beacon text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS drop_secrets(drop_id text PRIMARY KEY, seed text NOT NULL, key_blob text NOT NULL);
CREATE TABLE IF NOT EXISTS entries(
  drop_id text NOT NULL, receipt_id text NOT NULL, tier_id text NOT NULL, arrival_ms bigint NOT NULL,
  in_tarpit boolean NOT NULL DEFAULT false, replica text, UNIQUE(drop_id, receipt_id));
CREATE TABLE IF NOT EXISTS draw_results(
  drop_id text NOT NULL, tier_id text NOT NULL, rank int NOT NULL, receipt_id text NOT NULL,
  score text NOT NULL, outcome text NOT NULL, PRIMARY KEY(drop_id, tier_id, rank));
CREATE TABLE IF NOT EXISTS counterfactuals(
  drop_id text NOT NULL, policy text NOT NULL, tier_id text NOT NULL, rank int NOT NULL,
  ref_id text NOT NULL, actor text NOT NULL, PRIMARY KEY(drop_id, policy, tier_id, rank));
CREATE TABLE IF NOT EXISTS allocations(
  drop_id text NOT NULL, seat_no int NOT NULL, tier_id text NOT NULL, receipt_id text NOT NULL,
  user_id text NOT NULL, claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(drop_id, seat_no), UNIQUE(drop_id, receipt_id));
CREATE TABLE IF NOT EXISTS audit_log(
  seq bigint PRIMARY KEY, stream_id text UNIQUE NOT NULL, drop_id text NOT NULL, epoch int NOT NULL DEFAULT 0,
  event_type text NOT NULL, payload text NOT NULL, prev_hash text NOT NULL, hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_drop ON audit_log(drop_id, event_type);
CREATE TABLE IF NOT EXISTS audit_head(id int PRIMARY KEY, seq bigint NOT NULL, hash text NOT NULL);
INSERT INTO audit_head(id,seq,hash) VALUES (1,0,'0000000000000000000000000000000000000000000000000000000000000000') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS test_labels(user_id text PRIMARY KEY, kind text NOT NULL, operator_id text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS experiments(
  id text PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), result jsonb NOT NULL);
`
