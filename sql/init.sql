-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       TEXT   UNIQUE NOT NULL,
  password_hash  TEXT   NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TOKENS
CREATE TABLE IF NOT EXISTS tokens (
  user_id       INT     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT    NOT NULL CHECK (platform IN ('twitch','youtube')),
  access_token  TEXT    NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, platform)
);

-- 3. CHANNELS
CREATE TABLE IF NOT EXISTS channels (
  user_id              INT     PRIMARY KEY
                              REFERENCES users(id)
                              ON DELETE CASCADE,
  twitch_channel       TEXT,
  youtube_live_chat_id TEXT,
  youtube_video_id     TEXT,
  tiktok_username      TEXT,
  active_twitch        BOOLEAN NOT NULL DEFAULT TRUE,
  active_youtube       BOOLEAN NOT NULL DEFAULT TRUE,
  active_tiktok        BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. INDEX UTILE
CREATE INDEX IF NOT EXISTS idx_tokens_expires
  ON tokens (expires_at);

-- 5. UTILISATEUR PAR DÉFAUT (POC mono-user)
INSERT INTO users (id, username, password_hash)
VALUES (1, 'local', 'password')
ON CONFLICT (id) DO NOTHING;

-- 6. Fonction PL/pgSQL qui émet le NOTIFY
CREATE OR REPLACE FUNCTION notify_channel_update() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'channels_updated',
    NEW.user_id::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger qui l’appelle après chaque UPDATE des flags d’activité
DROP TRIGGER IF EXISTS trg_channels_update ON channels;
CREATE TRIGGER trg_channels_update
  AFTER UPDATE OF active_twitch, active_youtube, active_tiktok ON channels
  FOR EACH ROW
  EXECUTE FUNCTION notify_channel_update();
