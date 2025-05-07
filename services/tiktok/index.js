/* services/tiktok/index.js
   — producteur TikTok : chat + viewers ➜ queue "chat‑messages"
*/

import 'dotenv/config';                       // charge .env (DB_URL, AMQP_URL)
import { WebcastPushConnection } from 'tiktok-live-connector';
import pg   from 'pg';
import amqp from 'amqplib';

const {
  DB_URL   = 'postgres://user:password@localhost:5432/mydatabase',
  AMQP_URL = 'amqp://user:password@localhost',   // ← localhost hors Docker
} = process.env;

const USER_ID = 1;             // mono‑user POC

/* ---- 1. PG + RabbitMQ ------------------------------------------------- */
const pool      = new pg.Pool({ connectionString: DB_URL });

const amqpConn  = await amqp.connect(AMQP_URL);
const mqChannel = await amqpConn.createChannel();
await mqChannel.assertQueue('chat-messages', { durable: true });

/* ---- 2. Récupère le pseudo TikTok ------------------------------------- */
const { rows: [chan] } =
  await pool.query('SELECT tiktok_username FROM channels WHERE user_id=$1', [USER_ID]);

if (!chan?.tiktok_username) throw new Error('tiktok_username manquant');

const tiktokUsername = chan.tiktok_username;

/* ---- 3. Connexion au live TikTok -------------------------------------- */
const conn = new WebcastPushConnection(tiktokUsername);

await conn.connect();
console.log('[TIKTOK] connected →', tiktokUsername);

/* ---- 4. Events chat --------------------------------------------------- */
conn.on('chat', data => {
  const payload = {
    type:     'chat',
    platform: 'TIKTOK',
    text:     `${data.nickname}: ${data.comment}`,
  };
  mqChannel.sendToQueue('chat-messages',
    Buffer.from(JSON.stringify(payload)), { persistent: true });
});

/* ---- 5. Viewer count (roomUser) --------------------------------------- */
conn.on('roomUser', data => {
  const payload = {
    type:     'viewers',
    platform: 'TIKTOK',
    count:    data.viewerCount,
  };
  mqChannel.sendToQueue('chat-messages',
    Buffer.from(JSON.stringify(payload)), { persistent: true });
});

/* (il n’y a pas besoin de setInterval : TikTok émet `roomUser` périodiquement) */

/* ---- 6. Gestion d'erreur basique -------------------------------------- */
conn.on('disconnected', () => {
  console.error('[TIKTOK] disconnected – le live est peut‑être terminé');
  process.exit(1);
});