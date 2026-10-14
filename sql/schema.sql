CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id           UUID REFERENCES groups(id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  username           TEXT NOT NULL DEFAULT '',
  password_encrypted TEXT NOT NULL,
  site               TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subgrupos: parent_id aponta para o grupo de cima (NULL = grupo principal)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES groups(id) ON DELETE CASCADE;

-- Nome único dentro do mesmo grupo pai (antes era único por usuário)
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_user_id_name_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_user_parent_name_key') THEN
    ALTER TABLE groups ADD CONSTRAINT groups_user_parent_name_key UNIQUE NULLS NOT DISTINCT (user_id, parent_id, name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS groups_parent_idx ON groups (parent_id);
CREATE INDEX IF NOT EXISTS entries_user_idx ON entries (user_id);
CREATE INDEX IF NOT EXISTS entries_group_idx ON entries (group_id);
CREATE INDEX IF NOT EXISTS groups_user_idx ON groups (user_id);
