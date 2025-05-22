CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       TEXT   UNIQUE NOT NULL,
  password_hash  TEXT   NOT NULL,
  twitch_channel       TEXT,
  youtube_live_chat_id TEXT,
  youtube_video_id     TEXT,
  tiktok_username      TEXT,
  is_viewer            BOOLEAN
);

INSERT INTO users (id, username, password_hash)
VALUES (1, 'local', 'password')
ON CONFLICT (id) DO NOTHING;