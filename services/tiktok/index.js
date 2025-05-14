// services/tiktok/index.js
// — Producteur TikTok : chat + viewers ➜ file RabbitMQ "chat-messages"

import 'dotenv/config';                       // charge .env (DB_URL, AMQP_URL)
import { WebcastPushConnection } from 'tiktok-live-connector';
import pg   from 'pg';
import amqp from 'amqplib';

const {
  DB_URL   = 'postgres://user:password@localhost:5432/mydatabase',
  AMQP_URL = 'amqp://user:password@localhost',   // hors Docker, sinon 'amqp://mq'
} = process.env;

const USER_ID = 1;             // mono-user POC

// 1. PostgreSQL + RabbitMQ -------------------------------------------------------
const pool      = new pg.Pool({ connectionString: DB_URL });
const amqpConn  = await amqp.connect(AMQP_URL);
const mqChannel = await amqpConn.createChannel();
await mqChannel.assertQueue('chat-messages', { durable: true });

// 1bis. Écoute des modifications sur table channels -----------------------------
const listener = await pool.connect();
await listener.query('LISTEN channels_updated');
listener.on('notification', async msg => {
  const uid = Number(msg.payload);
  if (uid !== USER_ID) return;

  const { rows:[ch] } = await pool.query(
    `SELECT tiktok_username, active_tiktok
       FROM channels
      WHERE user_id = $1`,
    [ USER_ID ]
  );

  // flux désactivé → on quitte proprement
  if (!ch?.active_tiktok) {
    console.log('[TIKTOK] flux désactivé via BDD → arrêt du service');
    process.exit(0);
  }

  // si le username a changé, reconnect
  if (ch.tiktok_username !== tiktokUsername) {
    console.log('[TIKTOK] username modifié:', tiktokUsername, '→', ch.tiktok_username);
    await conn.disconnect();
    startTikTokProducer(ch.tiktok_username);
  }
});

// 2. Fonction de (re)démarrage du producer TikTok -------------------------------
let tiktokUsername;
let conn;
let lastRoomUser;
let watchdog;

async function startTikTokProducer(username) {
  tiktokUsername = username;
  conn = new WebcastPushConnection(tiktokUsername);
  await conn.connect();
  console.log('[TIKTOK] connecté au live →', tiktokUsername);

  lastRoomUser = Date.now();
  conn.on('chat', data => {
    lastRoomUser = Date.now();
    mqChannel.sendToQueue('chat-messages',
      Buffer.from(JSON.stringify({
        type:     'chat',
        platform: 'TIKTOK',
        text:     `${data.nickname}: ${data.comment}`,
      })),
      { persistent: true }
    );
  });

  conn.on('roomUser', data => {
    lastRoomUser = Date.now();
    mqChannel.sendToQueue('chat-messages',
      Buffer.from(JSON.stringify({
        type:     'viewers',
        platform: 'TIKTOK',
        count:    data.viewerCount,
      })),
      { persistent: true }
    );
  });

  conn.on('disconnected', () => {
    console.log('[TIKTOK] disconnected – arrêt du service');
    process.exit(0);
  });

  // Watchdog inactivité
  clearInterval(watchdog);
  const WATCHDOG_INTERVAL = 10_000;  // 10 s
  const INACTIVITY_LIMIT  = 30_000;  // 30 s
  watchdog = setInterval(() => {
    if (Date.now() - lastRoomUser > INACTIVITY_LIMIT) {
      console.log(`[TIKTOK] plus de roomUser depuis ${INACTIVITY_LIMIT/1000}s → arrêt`);
      conn.disconnect();
      process.exit(0);
    }
  }, WATCHDOG_INTERVAL);
}

// 3. Tout démarre ici ----------------------------------------------------------
(async () => {
  // on récupère d'abord l'enregistrement actif
  const { rows:[chan0] } = await pool.query(
    `SELECT tiktok_username
       FROM channels
      WHERE user_id = $1
        AND active_tiktok = TRUE`,
    [ USER_ID ]
  );
  if (!chan0?.tiktok_username) {
    console.error('[TIKTOK] Aucun tiktok_username actif en BDD pour user_id=', USER_ID);
    process.exit(1);
  }

  // on lance le producer
  await startTikTokProducer(chan0.tiktok_username);
})();