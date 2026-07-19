CREATE TABLE IF NOT EXISTS token_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id text NOT NULL DEFAULT 'solana',
  token_address text NOT NULL,
  description text,
  icon_image_id uuid,
  header_image_id uuid,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by text NOT NULL,
  updated_by_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS token_profiles_chain_addr_idx ON token_profiles (chain_id, token_address);
CREATE INDEX IF NOT EXISTS token_profiles_updated_at_idx ON token_profiles (updated_at);
CREATE INDEX IF NOT EXISTS token_profiles_created_at_idx ON token_profiles (created_at);

CREATE TABLE IF NOT EXISTS images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data bytea NOT NULL,
  content_type text NOT NULL DEFAULT 'image/jpeg',
  bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text NOT NULL,
  wallet text NOT NULL,
  token_address text NOT NULL,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_nonces_nonce_idx ON auth_nonces (nonce);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  wallet text NOT NULL,
  role text NOT NULL,
  action text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_token_idx ON audit_log (token_address);

ALTER TABLE token_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;