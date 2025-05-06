/* ───────────────────────────────────────────────────────────────
   initialisation de la base  (mydatabase)
   - users       : liste des comptes appli
   - tokens      : OAuth Twitch / YouTube    (PK composite)
   - channels    : chaînes / pseudos suivis  (PK = user_id)
   ───────────────────────────────────────────────────────────── */

-- 1. USERS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id        SERIAL PRIMARY KEY,
  username  TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TOKENS ------------------------------------------------------
CREATE TABLE IF NOT EXISTS tokens (
  user_id       INT  REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT CHECK (platform IN ('twitch','youtube')),

  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (user_id, platform)
);

-- 3. CHANNELS ----------------------------------------------------
CREATE TABLE IF NOT EXISTS channels (
  user_id              INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  twitch_channel       TEXT,
  youtube_live_chat_id TEXT,
  youtube_video_id     TEXT,
  tiktok_username      TEXT,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INDEXS UTILES ----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tokens_expires
  ON tokens (expires_at);

-- 5. UTILISATEUR PAR DEFAUT (mono‑user POC) ----------------------
INSERT INTO users (id, username)
VALUES (1, 'local')
ON CONFLICT (id) DO NOTHING;
