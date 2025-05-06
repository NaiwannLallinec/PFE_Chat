/* services/tiktok/index.js
   — producteur TikTok : chat + viewers ➜ queue "chat‑messages"
*/

import { WebcastPushConnection } from 'tiktok-live-connector';
import pg   from 'pg';
import amqp from 'amqplib';

const { DB_URL, AMQP_URL = 'amqp://localhost' } = process.env;
const USER_ID = 1;                                   // mono‑utilisateur POC

/* ─── 1. PostgreSQL + RabbitMQ ─────────────────────────────────────────── */
const pool = new pg.Pool({ connectionString: DB_URL });

const mqConn = await amqp.connect(AMQP_URL);
const mqChan = await mqConn.createChannel();
await mqChan.assertQueue('chat-messages', { durable: true });

/* ─── 2. Récupère le pseudo TikTok --------------------------------------- */
const { rows:[c] } = await pool.query(
  'SELECT tiktok_username FROM channels WHERE user_id=$1',
  [ USER_ID ],
);
const username = c?.tiktok_username;
if (!username) throw new Error('tiktok_username manquant dans la table channels');

/* ─── 3. Connexion au live TikTok ---------------------------------------- */
const conn = new WebcastPushConnection(username);

conn.on('chat', data => {
  mqChan.sendToQueue('chat-messages', Buffer.from(JSON.stringify({
    type:     'chat',
    platform: 'TIKTOK',
    text:     `${data.nickname}: ${data.comment}`,
  })), { persistent: true });
});

conn.on('roomUser', data => {
  mqChan.sendToQueue('chat-messages', Buffer.from(JSON.stringify({
    type:     'viewers',
    platform: 'TIKTOK',
    count:    data.viewerCount,
  })), { persistent: true });
});

try {
  await conn.connect();
  console.log('[TIKTOK] live connected →', username);
} catch (e) {
  console.error('[TIKTOK] connexion échouée :', e);
  process.exit(1);
}