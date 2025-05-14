// services/youtube/index.js
// — Producteur YouTube : chat + viewers ➜ queue RabbitMQ "chat-messages"

import 'dotenv/config';                       // charge DB_URL, AMQP_URL, etc.
import fetch from 'node-fetch';
import pg    from 'pg';
import amqp  from 'amqplib';
import { getValidToken } from '../../shared/tokenManager.js';

const {
  DB_URL,
  AMQP_URL = 'amqp://localhost',            // ou 'amqp://mq' en Docker
} = process.env;

const USER_ID = 1;                           // mono-user POC

// 1. PostgreSQL + RabbitMQ ------------------------------------------------
const pool     = new pg.Pool({ connectionString: DB_URL });
const amqpConn = await amqp.connect(AMQP_URL);
const mqChan   = await amqpConn.createChannel();
await mqChan.assertQueue('chat-messages', { durable: true });

// 1bis. Écoute des mises à jour de channels --------------------------------
const listener = await pool.connect();
await listener.query('LISTEN channels_updated');
listener.on('notification', async msg => {
  const uid = Number(msg.payload);
  if (uid !== USER_ID) return;

  const { rows:[ch] } = await pool.query(
    `SELECT youtube_live_chat_id, youtube_video_id, active_youtube
       FROM channels
      WHERE user_id = $1`,
    [ USER_ID ]
  );

  // si désactivé : on stoppe
  if (!ch?.active_youtube) {
    console.log('[YOUTUBE] flux désactivé via BDD → arrêt');
    clearIntervals();
    process.exit(0);
  }

  // si ID change : on redémarre
  if (ch.youtube_live_chat_id !== currentChatId || ch.youtube_video_id !== currentVideoId) {
    console.log('[YOUTUBE] IDs changés → redémarrage');
    clearIntervals();
    await startYouTubeProducer(ch.youtube_live_chat_id, ch.youtube_video_id);
  }
});

// 2. Fonction de (re)démarrage du producer YouTube ------------------------
let currentChatId, currentVideoId;
let lastActivity;
let chatInterval, viewersInterval, inactivityWatchdog;

function clearIntervals() {
  clearInterval(chatInterval);
  clearInterval(viewersInterval);
  clearInterval(inactivityWatchdog);
}

async function startYouTubeProducer(liveChatId, videoId) {
  currentChatId  = liveChatId;
  currentVideoId = videoId;
  lastActivity   = Date.now();

  console.log('[YOUTUBE] producer → chatId:', liveChatId, 'videoId:', videoId);

  // Watchdog d’inactivité
  const WATCHDOG_INTERVAL = 10_000; // ms
  const INACTIVITY_LIMIT  = 60_000; // ms
  clearInterval(inactivityWatchdog);
  inactivityWatchdog = setInterval(() => {
    if (Date.now() - lastActivity > INACTIVITY_LIMIT) {
      console.error(`[YOUTUBE] aucune activité depuis ${INACTIVITY_LIMIT/1000}s → arrêt`);
      clearIntervals();
      process.exit(1);
    }
  }, WATCHDOG_INTERVAL);

  // Polling du chat
  async function pollChat() {
    try {
      const ytToken = await getValidToken('youtube');
      const url = `https://www.googleapis.com/youtube/v3/liveChat/messages`
                + `?liveChatId=${liveChatId}&part=snippet,authorDetails`;
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${ytToken}` } });
      const data = await res.json();
      if (data.error) throw new Error(JSON.stringify(data.error));

      data.items?.forEach(it => {
        lastActivity = Date.now();
        const text = `${it.authorDetails.displayName}: ${it.snippet.displayMessage}`;
        mqChan.sendToQueue(
          'chat-messages',
          Buffer.from(JSON.stringify({ 
            type: 'chat', 
            platform: 'YOUTUBE', 
            text 
          })),
          { persistent: true }
        );
      });
    } catch (err) {
      console.error('[YOUTUBE] pollChat erreur :', err);
    }
  }

  // Polling des viewers
  async function pollViewers() {
    try {
      const ytToken = await getValidToken('youtube');
      const url = `https://www.googleapis.com/youtube/v3/videos`
                + `?part=liveStreamingDetails&id=${videoId}`;
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${ytToken}` } });
      const data = await res.json();
      if (data.error) throw new Error(JSON.stringify(data.error));

      const count = data.items?.length
        ? Number(data.items[0].liveStreamingDetails.concurrentViewers) || 0
        : 0;
      lastActivity = Date.now();

      mqChan.sendToQueue(
        'chat-messages',
        Buffer.from(JSON.stringify({ 
          type: 'viewers', 
          platform: 'YOUTUBE', 
          count 
        })),
        { persistent: true }
      );
    } catch (err) {
      console.error('[YOUTUBE] pollViewers erreur :', err);
    }
  }

  // Lancer immédiatement et planifier
  await pollChat();
  await pollViewers();
  clearInterval(chatInterval);
  clearInterval(viewersInterval);
  chatInterval    = setInterval(pollChat,    5000);
  viewersInterval = setInterval(pollViewers, 30000);
}

// 3. Démarrage initial -----------------------------------------------------
(async () => {
  const { rows:[ch0] } = await pool.query(
    `SELECT youtube_live_chat_id, youtube_video_id
       FROM channels
      WHERE user_id = $1
        AND active_youtube = TRUE`,
    [ USER_ID ]
  );
  if (!ch0?.youtube_live_chat_id || !ch0?.youtube_video_id) {
    console.error('[YOUTUBE] liveChatId ou videoId actif manquant en BDD');
    process.exit(1);
  }
  await startYouTubeProducer(ch0.youtube_live_chat_id, ch0.youtube_video_id);
})();