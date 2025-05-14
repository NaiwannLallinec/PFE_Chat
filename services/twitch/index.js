// services/twitch/index.js
// — Producteur Twitch : chat + viewers ➜ queue RabbitMQ "chat-messages"

import 'dotenv/config';                       // charge DB_URL, AMQP_URL
import tmi from 'tmi.js';
import pg from 'pg';
import fetch from 'node-fetch';
import amqp from 'amqplib';
import { getValidToken } from '../../shared/tokenManager.js';
import { TWITCH_CLIENT_ID } from '../../shared/config.js';

const {
  DB_URL,
  AMQP_URL = 'amqp://mq',                    // hors Docker : 'amqp://localhost'
} = process.env;

const USER_ID = 1;                            // mono-user POC

// 1. PostgreSQL + RabbitMQ --------------------------------------------------
const pool      = new pg.Pool({ connectionString: DB_URL });
const amqpConn  = await amqp.connect(AMQP_URL);
const mqChannel = await amqpConn.createChannel();
await mqChannel.assertQueue('chat-messages', { durable: true });

// 1bis. Écoute des MAJ sur channels -----------------------------------------
const listener = await pool.connect();
await listener.query('LISTEN channels_updated');
listener.on('notification', async msg => {
  const uid = Number(msg.payload);
  if (uid !== USER_ID) return;

  const { rows:[ch] } = await pool.query(
    `SELECT twitch_channel, active_twitch
       FROM channels
      WHERE user_id = $1`,
    [ USER_ID ]
  );

  // flag désactivé → on arrête
  if (!ch?.active_twitch) {
    console.log('[TWITCH] flux désactivé via BDD → arrêt');
    client.disconnect();
    process.exit(0);
  }

  // pseudo modifié → reconnexion
  if (ch.twitch_channel !== currentChannel) {
    console.log('[TWITCH] twitch_channel changé → reconnexion');
    await client.disconnect();
    startTwitchProducer(ch.twitch_channel);
  }
});

// 2. Fonction de (re)démarrage du producer Twitch --------------------------
let client;
let currentChannel;
let lastActivity;
let viewerInterval;
let inactivityWatchdog;

async function startTwitchProducer(channel) {
  currentChannel = channel;
  client = new tmi.Client({
    connection: { reconnect: true, secure: true },
    identity:   { username: 'devpfe', password: await getValidToken('twitch','oauth') },
    channels:   [ channel ],
  });

  await client.connect();
  console.log('[TWITCH] connecté au chat →', channel);

  lastActivity = Date.now();

  client.on('message', (_chan, tags, message, self) => {
    if (self) return;
    lastActivity = Date.now();
    const user = tags['display-name'] || tags.username;
    mqChannel.sendToQueue('chat-messages',
      Buffer.from(JSON.stringify({
        type:     'chat',
        platform: 'TWITCH',
        text:     `${user}: ${message}`,
      })),
      { persistent: true }
    );
  });

  // Viewer count interval
  clearInterval(viewerInterval);
  const VIEWER_INTERVAL   = 30_000; // ms
  viewerInterval = setInterval(async () => {
    try {
      const tk  = await getValidToken('twitch');
      const res = await fetch(
        `https://api.twitch.tv/helix/streams?user_login=${channel}`,
        {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${tk}`,
          },
        }
      );
      const d     = await res.json();
      const count = d.data?.length ? d.data[0].viewer_count : 0;
      lastActivity = Date.now();

      mqChannel.sendToQueue('chat-messages',
        Buffer.from(JSON.stringify({
          type:     'viewers',
          platform: 'TWITCH',
          count,
        })),
        { persistent: true }
      );
    } catch (e) {
      console.error('[TWITCH] erreur fetch viewer count :', e);
    }
  }, VIEWER_INTERVAL);

  // Activity watchdog
  clearInterval(inactivityWatchdog);
  const WATCHDOG_INTERVAL = 10_000;  // ms
  const INACTIVITY_LIMIT  = 60_000;  // ms
  inactivityWatchdog = setInterval(() => {
    if (Date.now() - lastActivity > INACTIVITY_LIMIT) {
      console.error(`[TWITCH] pas d'activité depuis ${INACTIVITY_LIMIT/1000}s → arrêt`);
      client.disconnect();
      process.exit(1);
    }
  }, WATCHDOG_INTERVAL);

  // Gestion déconnexion & erreurs
  client.on('disconnected', reason => {
    console.error('[TWITCH] disconnected :', reason);
    process.exit(1);
  });
  client.on('reconnect', () => {
    console.log('[TWITCH] tentative de reconnexion…');
  });
  client.on('error', err => {
    console.error('[TWITCH] erreur client :', err);
  });
}

// 3. Démarrage initial ------------------------------------------------------
(async () => {
  const { rows:[ch0] } = await pool.query(
    `SELECT twitch_channel
       FROM channels
      WHERE user_id = $1
        AND active_twitch = TRUE`,
    [ USER_ID ]
  );
  if (!ch0?.twitch_channel) {
    console.error('[TWITCH] twitch_channel actif manquant en BDD');
    process.exit(1);
  }

  await startTwitchProducer(ch0.twitch_channel);
})();