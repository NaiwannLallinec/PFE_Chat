import tmi from 'tmi.js';
import pg from 'pg';
import fetch from 'node-fetch';
import amqp from 'amqplib';
import 'dotenv/config';
import { getValidToken } from '../../shared/tokenManager.js';
import { TWITCH_CLIENT_ID } from '../../shared/config.js';

const { DB_URL, AMQP_URL = 'amqp://mq' } = process.env;
const USER_ID = 1;                           // mono‑user POC

/* ---- PG + RabbitMQ ----------------------------------------------------- */
const pool   = new pg.Pool({ connectionString: DB_URL });
const amqpConn  = await amqp.connect(AMQP_URL);
const mqChannel = await amqpConn.createChannel();
await mqChannel.assertQueue('chat-messages', { durable:true });

/* ---- Récupère chaînes -------------------------------------------------- */
const { rows:[chan] } =
  await pool.query('SELECT * FROM channels WHERE user_id=$1', [USER_ID]);
if (!chan?.twitch_channel) throw new Error('twitch_channel manquant');

const twitchChannel = chan.twitch_channel;

/* ---- Chat -------------------------------------------------------------- */
const client = new tmi.Client({
  connection:{ reconnect:true, secure:true },
  identity:{ username:'devpfe', password:await getValidToken('twitch','oauth') },
  channels:[ twitchChannel ],
});
await client.connect();
console.log('[TWITCH] connected →', twitchChannel);

client.on('message', (_c, tags, message, self)=>{
  if (self) return;
  const payload = {
    type:'chat',
    platform:'TWITCH',
    text:`${tags['display-name']||tags.username}: ${message}`,
  };
  mqChannel.sendToQueue('chat-messages', Buffer.from(JSON.stringify(payload)), { persistent:true });
});

/* ---- Viewer count (30 s) ---------------------------------------------- */
setInterval(async ()=>{
  const tk = await getValidToken('twitch');
  const r  = await fetch(`https://api.twitch.tv/helix/streams?user_login=${twitchChannel}`, {
    headers:{ 'Client-ID':TWITCH_CLIENT_ID, Authorization:`Bearer ${tk}` },
  });
  const d  = await r.json();
  const n  = d.data?.length ? d.data[0].viewer_count : 0;
  mqChannel.sendToQueue('chat-messages',
    Buffer.from(JSON.stringify({ type:'viewers', platform:'TWITCH', count:n })),
    { persistent:true });
}, 30000);
