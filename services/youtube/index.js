import express from 'express';
import amqp from 'amqplib';
import fetch from 'node-fetch';
import 'dotenv/config';
import { getValidToken } from '../../shared/tokenManager.js';
import cors from 'cors';


const {
  AMQP_URL = 'amqp://localhost',
  PORT     = 3003,
} = process.env;

const app = express();
app.use(cors({ origin: 'http://localhost:4200', credentials: true })); // 👈 ajouté
app.use(express.json());

// youtube_live_chat_id → { videoId, users: Set<user_id>, intervals, lastActivity }
const ytConnections = new Map();
// user_id → youtube_live_chat_id
const userToChatId = new Map();

// RabbitMQ
const amqpConn  = await amqp.connect(AMQP_URL);
const mqChannel = await amqpConn.createChannel();
await mqChannel.assertQueue('chat-messages', { durable: true });

// === Gestion connexion YouTube Live ================================

async function createYouTubeConnection(liveChatId, videoId) {
  const users = new Set();
  let lastActivity = Date.now();
  let pageToken = null;

  console.log(`[YOUTUBE] Connexion au live ${videoId} / chatId: ${liveChatId}`);

  const token = 'ya29.a0AW4XtxiH03rt09pUVuy348OWBBMqCJyESXNwcY5x4U8ubxvUaKzDlTCtT8r6SscVgK5kO_M-W4IND9hvAzc6dHcnL4ePGOnjwAQPl18pfNzROARzM9UbDTW3-fVe21C-CtP6bKN44xD7jT7mpAKp-XX8GLPV2KWNyKK66JgLaCgYKAQMSARESFQHGX2MijNm0ksAmw2wovFYyRs6mZg0175';
  async function pollChat() {
    try {
      const url = `https://www.googleapis.com/youtube/v3/liveChat/messages`
          + `?liveChatId=${liveChatId}&part=snippet,authorDetails`;
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.error) throw new Error(JSON.stringify(data.error));

      data.items?.forEach(it => {
        lastActivity = Date.now();
        const text = `${it.authorDetails.displayName}: ${it.snippet.displayMessage}`;
        mqChannel.sendToQueue(
            'chat-messages',
            Buffer.from(JSON.stringify({
              type: 'chat',
              platform: 'YOUTUBE',
              text,
              user_ids: Array.from(users)
            })),
            { persistent: true }
        );
      });
    } catch (err) {
      console.error(`[YOUTUBE] Erreur pollChat (${videoId}):`, err.message);
    }
  }

  async function pollViewers() {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos`
          + `?part=liveStreamingDetails&id=${videoId}`;
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.error) throw new Error(JSON.stringify(data.error));

      const count = data.items?.[0]?.liveStreamingDetails?.concurrentViewers || 0;
      lastActivity = Date.now();

      mqChannel.sendToQueue(
          'chat-messages',
          Buffer.from(JSON.stringify({
            type: 'viewers',
            platform: 'YOUTUBE',
            count,
            user_ids: Array.from(users)
          })),
          { persistent: true }
      );
    } catch (err) {
      console.error(`[YOUTUBE] Erreur pollViewers (${videoId}):`, err.message);
    }
  }

  // Watchdog inactivité
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > 60_000) {
      console.warn(`[YOUTUBE] Inactivité détectée (${videoId}) → arrêt`);
      stopYouTubeConnection(liveChatId);
    }
  }, 10_000);

  const chatInterval    = setInterval(pollChat, 5000);
  const viewersInterval = setInterval(pollViewers, 30000);

  // initial
  await pollChat();
  await pollViewers();

  ytConnections.set(liveChatId, {
    videoId,
    users,
    intervals: [chatInterval, viewersInterval, watchdog],
    lastActivity
  });

  return users;
}

function stopYouTubeConnection(liveChatId) {
  const conn = ytConnections.get(liveChatId);
  if (!conn) return;

  conn.intervals.forEach(clearInterval);
  ytConnections.delete(liveChatId);
  console.log(`[YOUTUBE] Déconnexion du live chatId ${liveChatId}`);
}

// === Endpoints API ================================================

// ➕ POST /youtube/start
app.post('/youtube/start', async (req, res) => {
  const { user_id, youtube_live_chat_id, youtube_video_id } = req.body;
  if (!user_id || !youtube_live_chat_id || !youtube_video_id) {
    return res.status(400).json({ error: 'Champs requis : user_id, youtube_live_chat_id, youtube_video_id' });
  }

  if (userToChatId.has(user_id)) {
    const oldChatId = userToChatId.get(user_id);
    const oldConn = ytConnections.get(oldChatId);
    if (oldConn) {
      oldConn.users.delete(user_id);
      if (oldConn.users.size === 0) stopYouTubeConnection(oldChatId);
    }
  }

  let users;
  if (ytConnections.has(youtube_live_chat_id)) {
    users = ytConnections.get(youtube_live_chat_id).users;
    console.log(`[YOUTUBE] Ajout user ${user_id} à ${youtube_live_chat_id}`);
  } else {
    try {
      users = await createYouTubeConnection(youtube_live_chat_id, youtube_video_id);
    } catch (e) {
      console.error('[YOUTUBE] Erreur de connexion :', e.message);
      return res.status(500).json({ error: 'Connexion YouTube échouée' });
    }
  }

  users.add(user_id);
  userToChatId.set(user_id, youtube_live_chat_id);

  return res.status(200).json({ message: `Connexion YouTube OK pour user ${user_id}` });
});

// ➖ POST /youtube/stop
app.post('/youtube/stop', (req, res) => {
  const { user_id } = req.body;
  if (!userToChatId.has(user_id)) {
    return res.status(404).json({ error: 'user_id non inscrit' });
  }

  const chatId = userToChatId.get(user_id);
  const conn = ytConnections.get(chatId);
  if (conn) {
    conn.users.delete(user_id);
    if (conn.users.size === 0) stopYouTubeConnection(chatId);
  }

  userToChatId.delete(user_id);
  return res.status(200).json({ message: `Déconnecté de YouTube pour user ${user_id}` });
});

// 🔎 GET /youtube/status
app.get('/youtube/status', (_req, res) => {
  const status = {};
  for (const [chatId, { videoId, users }] of ytConnections.entries()) {
    status[chatId] = { videoId, user_ids: Array.from(users) };
  }

  res.json({
    active_streams: ytConnections.size,
    status
  });
});

// 🚀 Serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur YouTube en écoute sur http://localhost:${PORT}`);
});
