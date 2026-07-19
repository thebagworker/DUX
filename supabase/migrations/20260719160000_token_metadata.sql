-- Cached on-chain / pump.fun token metadata (name, symbol, image).
--
-- Populated continuously by the PumpPortal "subscribeNewToken" listener
-- (scripts/pump-metadata-listener.mjs). The token-profiles API LEFT JOINs this
-- table so DUX can show a real name and logo even when the token owner has not
-- uploaded their own icon yet. Keyed by mint so it is independent of whether a
-- DUX profile exists.

CREATE TABLE IF NOT EXISTS token_metadata (
  token_address text NOT NULL,
  chain_id text NOT NULL DEFAULT 'solana',
  name text,
  symbol text,
  image_url text,
  uri text,
  source text NOT NULL DEFAULT 'pumpportal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_address)
);

CREATE INDEX IF NOT EXISTS token_metadata_created_at_idx ON token_metadata (created_at);

ALTER TABLE token_metadata ENABLE ROW LEVEL SECURITY;
