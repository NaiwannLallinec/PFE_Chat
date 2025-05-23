import express from 'express';
import amqp from 'amqplib';
import { WebcastPushConnection } from 'tiktok-live-connector';
import cors from 'cors';


const {
  AMQP_URL = 'amqp://rabbitmq',
  PORT     = 3002,
} = process.env;


const app = express();
app.use(cors({ origin: 'http://localhost:8080', credentials: true })); // 👈 CORS activé
app.use(express.json());


// tiktok_username → { conn, users: Set<user_id>, watchdog }
const tiktokConnections = new Map();
// user_id → tiktok_username
const userToTiktok = new Map();

// 🔗 RabbitMQ
const amqpConn  = await amqp.connect(AMQP_URL);
const mqChannel = await amqpConn.createChannel();
await mqChannel.assertQueue('chat-messages', { durable: true });

// ▶️ Connexion TikTok
async function createTikTokConnection(tiktok_username) {
  const conn = new WebcastPushConnection(tiktok_username);
  const users = new Set();
  let lastActivity = Date.now();

  await conn.connect();
  console.log(`[TIKTOK] connecté au live de ${tiktok_username}`);

  conn.on('chat', data => {
    lastActivity = Date.now();
    mqChannel.sendToQueue('chat-messages',
        Buffer.from(JSON.stringify({
          type:     'chat',
          platform: 'TIKTOK',
          text:     `${data.nickname}: ${data.comment}`,
          user_ids: Array.from(users),
        })),
        { persistent: true }
    );
  });

  conn.on('roomUser', data => {
    lastActivity = Date.now();
    mqChannel.sendToQueue('chat-messages',
        Buffer.from(JSON.stringify({
          type:     'viewers',
          platform: 'TIKTOK',
          count:    data.viewerCount,
          user_ids: Array.from(users),
        })),
        { persistent: true }
    );
  });

  conn.on('disconnected', () => {
    console.log(`[TIKTOK] ${tiktok_username} déconnecté`);
    stopTikTokConnection(tiktok_username);
  });

  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > 30_000) {
      console.warn(`[TIKTOK] inactivité sur ${tiktok_username} → arrêt`);
      conn.disconnect();
      stopTikTokConnection(tiktok_username);
    }
  }, 10_000);

  tiktokConnections.set(tiktok_username, { conn, users, watchdog });
  return users;
}

// 🛑 Stopper une connexion TikTok
function stopTikTokConnection(tiktok_username) {
  const instance = tiktokConnections.get(tiktok_username);
  if (!instance) return;

  clearInterval(instance.watchdog);
  instance.conn.disconnect();
  tiktokConnections.delete(tiktok_username);

  console.log(`[TIKTOK] arrêt complet de ${tiktok_username}`);
}

// ✅ POST /tiktok/start
app.post('/tiktok/start', async (req, res) => {
  const { user_id, tiktok_username } = req.body;

  if (!user_id || !tiktok_username) {
    return res.status(400).json({ error: 'Champs requis : user_id, tiktok_username' });
  }

  // Retirer user de toute connexion précédente
  if (userToTiktok.has(user_id)) {
    const oldUsername = userToTiktok.get(user_id);
    const conn = tiktokConnections.get(oldUsername);
    if (conn) {
      conn.users.delete(user_id);
      if (conn.users.size === 0) stopTikTokConnection(oldUsername);
    }
  }

  let users;
  if (tiktokConnections.has(tiktok_username)) {
    users = tiktokConnections.get(tiktok_username).users;
    console.log(`[TIKTOK] ajout user ${user_id} à ${tiktok_username}`);
  } else {
    try {
      users = await createTikTokConnection(tiktok_username);
    } catch (e) {
      console.error(`[TIKTOK] échec de connexion à ${tiktok_username} :`, e);
      return res.status(500).json({ error: `Impossible de se connecter à ${tiktok_username}` });
    }
  }

  users.add(user_id);
  userToTiktok.set(user_id, tiktok_username);

  return res.status(200).json({ message: `Connexion ok pour user ${user_id} sur ${tiktok_username}` });
});

// ✅ POST /tiktok/stop
app.post('/tiktok/stop', (req, res) => {
  const { user_id } = req.body;

  if (!userToTiktok.has(user_id)) {
    return res.status(404).json({ error: 'user_id non abonné à un live TikTok' });
  }

  const username = userToTiktok.get(user_id);
  const conn = tiktokConnections.get(username);
  if (conn) {
    conn.users.delete(user_id);
    if (conn.users.size === 0) stopTikTokConnection(username);
  }

  userToTiktok.delete(user_id);
  return res.status(200).json({ message: `Déconnexion ok pour user ${user_id}` });
});

// ✅ GET /tiktok/status
app.get('/tiktok/status', (req, res) => {
  const status = {};
  for (const [username, { users }] of tiktokConnections.entries()) {
    status[username] = Array.from(users);
  }
  res.json({
    active_streams: tiktokConnections.size,
    status
  });
});

// 🚀 Serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur TikTok en écoute sur http://localhost:${PORT}`);
});
