/* services/youtube/index.js
   — producteur YouTube : chat + viewers ➜ queue "chat‑messages"
*/

import fetch from 'node-fetch';
import pg    from 'pg';
import amqp  from 'amqplib';

import { getValidToken } from '../../shared/tokenManager.js';

const { DB_URL, AMQP_URL = 'amqp://localhost' } = process.env;
const USER_ID = 1;                                // mono‑utilisateur POC

/* ─── 1. PG + RabbitMQ ─────────────────────────────────────────────────── */
const pool   = new pg.Pool({ connectionString: DB_URL });

const mqConn = await amqp.connect(AMQP_URL);
const mqChan = await mqConn.createChannel();
await mqChan.assertQueue('chat-messages', { durable: true });

/* ─── 2. Récupère IDs YouTube (chat + video) ───────────────────────────── */
const { rows: [c] } = await pool.query(
  'SELECT youtube_live_chat_id, youtube_video_id FROM channels WHERE user_id=$1',
  [ USER_ID ],
);
const liveChatId = c?.youtube_live_chat_id;
const videoId    = c?.youtube_video_id;
if (!liveChatId || !videoId) throw new Error('IDs YouTube manquants');

/* ─── 3. Token d’accès YouTube ─────────────────────────────────────────── */
const ytToken = await getValidToken('youtube');

/* ─── 4. Polling du chat (5 s) ─────────────────────────────────────────── */
async function pollChat() {
  try {
    const url = `https://www.googleapis.com/youtube/v3/liveChat/messages`
              + `?liveChatId=${liveChatId}&part=snippet,authorDetails`;
    const r   = await fetch(url, { headers:{ Authorization:`Bearer ${ytToken}` }});
    const d   = await r.json();

    d.items?.forEach(it => {
      mqChan.sendToQueue('chat-messages', Buffer.from(JSON.stringify({
        type:     'chat',
        platform: 'YOUTUBE',
        text:     `${it.authorDetails.displayName}: ${it.snippet.displayMessage}`,
      })), { persistent:true });
    });
  } catch (e) { console.error('[YOUTUBE] chat error:', e); }
}
pollChat();
setInterval(pollChat, 5000);

/* ─── 5. Viewer‑count (30 s) ───────────────────────────────────────────── */
async function pollViewers() {
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos`
              + `?part=liveStreamingDetails&id=${videoId}`;
    const r   = await fetch(url, { headers:{ Authorization:`Bearer ${ytToken}` }});
    const d   = await r.json();
    const n   = d.items?.length ? Number(d.items[0].liveStreamingDetails.concurrentViewers)||0 : 0;

    mqChan.sendToQueue('chat-messages', Buffer.from(JSON.stringify({
      type:'viewers', platform:'YOUTUBE', count:n,
    })), { persistent:true });
  } catch (e) { console.error('[YOUTUBE] viewers error:', e); }
}
pollViewers();
setInterval(pollViewers, 30000);

console.log('[YOUTUBE] producer running → chatId', liveChatId);