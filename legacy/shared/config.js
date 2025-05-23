/* shared/config.js
   – utilitaires de configuration (PostgreSQL + constantes OAuth)
*/

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();                         // charge .env si présent

/* ─── variables d’environnement attendues ─────────────────────────────── */
export const {
  DB_URL  = 'postgres://user:password@localhost:5432/mydatabase',
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  YT_CLIENT_ID,
  YT_CLIENT_SECRET,
} = process.env;

/* ─── pool Postgres partagé ───────────────────────────────────────────── */
export const pgPool = new pg.Pool({ connectionString: DB_URL });

/* ─── helper : récupérer les chaînes d’un utilisateur ─────────────────── */
export async function getChannels(userId = 1) {
  const { rows:[c] } = await pgPool.query(
    `SELECT twitch_channel, youtube_live_chat_id, youtube_video_id, tiktok_username
       FROM channels WHERE user_id = $1`,
    [ userId ]
  );
  if (!c) throw new Error('Aucune ligne channels pour cet utilisateur');

  return {
    twitchChannel:      c.twitch_channel,
    youtubeLiveChatId:  c.youtube_live_chat_id,
    youtubeVideoId:     c.youtube_video_id,
    tiktokUsername:     c.tiktok_username,
  };
}
