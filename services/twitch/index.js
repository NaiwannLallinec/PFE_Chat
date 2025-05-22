import express from 'express';
import cors from 'cors'; // 👈
import tmi from 'tmi.js';
import amqp from 'amqplib';
import fetch from 'node-fetch';
import 'dotenv/config';
import { TWITCH_CLIENT_ID } from '../../shared/config.js';

const {
  AMQP_URL = 'amqp://mq',
  PORT     = 3001,
} = process.env;

const app = express();

// ✅ fix CORS
app.use(cors({
  origin: 'http://localhost:4200', // Angular app
  credentials: true
}));
app.use(express.json());


// twitch_channel → { client, users: Set<user_id>, viewerInterval, watchdog }
const twitchConnections = new Map();

// user_id → twitch_channel
const userToChannel = new Map();

// 📦 RabbitMQ
const amqpConn  = await amqp.connect(AMQP_URL);
const mqChannel = await amqpConn.createChannel();
await mqChannel.assertQueue('chat-messages', { durable: true });

// 🚀 Démarrer une connexion Twitch (si elle n’existe pas déjà)
async function createTwitchConnection(twitch_channel, twitch_token) {
  const client = new tmi.Client({
    connection: { reconnect: true, secure: true },
    identity:   { username: 'devpfe', password: `oauth:${twitch_token}` },
    channels:   [ twitch_channel ],
  });

  await client.connect();
  console.log(`[TWITCH] connecté à #${twitch_channel}`);

  const users = new Set();
  let lastActivity = Date.now();

  client.on('message', (_chan, tags, message, self) => {
  if (self) return;
  lastActivity = Date.now();
  const user = tags['display-name'] || tags.username;

  console.log('[TWITCH][msg]', user, message); // 👈 AJOUTE ÇA

  mqChannel.sendToQueue('chat-messages',
    Buffer.from(JSON.stringify({
      type:     'chat',
      platform: 'TWITCH',
      text:     `${user}: ${message}`,
      user_ids: Array.from(users),
    })),
    { persistent: true }
  );
});


  const viewerInterval = setInterval(async () => {
    try {
      const res = await fetch(
          `https://api.twitch.tv/helix/streams?user_login=${twitch_channel}`,
          {
            headers: {
              'Client-ID': TWITCH_CLIENT_ID,
              'Authorization': `Bearer ${twitch_token}`,
            },
          }
      );
      const d = await res.json();
      if (!d.data || d.data.length === 0) {
        throw Object.assign(new Error('No active stream'), { code: 'NO_STREAM' });
      }

      const count = d.data[0].viewer_count;
      lastActivity = Date.now();

      mqChannel.sendToQueue('chat-messages',
          Buffer.from(JSON.stringify({
            type:     'viewers',
            platform: 'TWITCH',
            count,
            user_ids: Array.from(users),
          })),
          { persistent: true }
      );
    } catch (e) {
      if (e.code === 'NO_STREAM') {
        console.warn(`[TWITCH] ${twitch_channel} est hors ligne`);
      } else {
        console.error(`[TWITCH] erreur viewers sur #${twitch_channel} :`, e);
      }
    }
  }, 30_000);

  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > 60_000) {
      console.warn(`[TWITCH] inactivité sur #${twitch_channel} → déconnexion`);
      stopTwitchConnection(twitch_channel);
    }
  }, 10_000);

  twitchConnections.set(twitch_channel, { client, users, viewerInterval, watchdog });
  return users;
}

// 🧹 Stopper une connexion Twitch (si plus d’abonnés)
function stopTwitchConnection(twitch_channel) {
  const conn = twitchConnections.get(twitch_channel);
  if (!conn) return;

  conn.client.disconnect();
  clearInterval(conn.viewerInterval);
  clearInterval(conn.watchdog);
  twitchConnections.delete(twitch_channel);

  console.log(`[TWITCH] déconnecté de #${twitch_channel}`);
}

// ✅ POST /twitch/start
app.post('/twitch/start', async (req, res) => {
  const { user_id, twitch_channel, twitch_token } = req.body;

  if (!user_id || !twitch_channel || !twitch_token) {
    return res.status(400).json({ error: 'Champs requis : user_id, twitch_channel, twitch_token' });
  }

  // Si déjà abonné à un autre channel, on le retire
  if (userToChannel.has(user_id)) {
    const oldChannel = userToChannel.get(user_id);
    const conn = twitchConnections.get(oldChannel);
    if (conn) {
      conn.users.delete(user_id);
      if (conn.users.size === 0) {
        stopTwitchConnection(oldChannel);
      }
    }
  }

  // Nouvelle inscription
  let users;
  if (twitchConnections.has(twitch_channel)) {
    users = twitchConnections.get(twitch_channel).users;
    console.log(`[TWITCH] ajout user ${user_id} à #${twitch_channel}`);
  } else {
    try {
      users = await createTwitchConnection(twitch_channel, twitch_token);
    } catch (e) {
      console.error(`[TWITCH] erreur lors de la connexion à #${twitch_channel} :`, e);
      return res.status(500).json({ error: 'Impossible de se connecter au streamer' });
    }
  }

  users.add(user_id);
  userToChannel.set(user_id, twitch_channel);

  return res.status(200).json({ message: `Connexion ok pour user ${user_id} sur #${twitch_channel}` });
});

// ✅ POST /twitch/stop
app.post('/twitch/stop', (req, res) => {
  const { user_id } = req.body;

  if (!userToChannel.has(user_id)) {
    return res.status(404).json({ error: 'user_id non abonné à un streamer' });
  }

  const channel = userToChannel.get(user_id);
  const conn = twitchConnections.get(channel);

  if (conn) {
    conn.users.delete(user_id);
    if (conn.users.size === 0) {
      stopTwitchConnection(channel);
    }
  }

  userToChannel.delete(user_id);
  return res.status(200).json({ message: `Déconnexion ok pour user ${user_id}` });
});

// ✅ GET /twitch/status
app.get('/twitch/status', (req, res) => {
  const status = {};
  for (const [channel, { users }] of twitchConnections.entries()) {
    status[channel] = Array.from(users);
  }
  res.json({
    active_channels: twitchConnections.size,
    status
  });
});

// 🚀 Serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur Twitch en écoute sur http://localhost:${PORT}`);
});
