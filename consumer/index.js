/* consumer/index.js
   – lit la queue RabbitMQ et émet via Socket.IO
   écoute sur https://localhost:5000
*/

import 'dotenv/config';
import express  from 'express';
import https    from 'https';
import fs       from 'fs';
import path     from 'path';
import amqp     from 'amqplib';
import { Server as IOServer } from 'socket.io';
import { fileURLToPath } from 'url';

const {
  AMQP_URL = 'amqp://user:password@localhost',
  PORT     = 5000
} = process.env;

/* ─── 1. Express + HTTPS ──────────────────────────────────────────────── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, 'public')));   // sert chat.html + images

const httpsSrv = https.createServer(
  {
    key : fs.readFileSync(path.join(__dirname, '../certs/server.key')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/server.cert')),
  },
  app,
);

const io = new IOServer(httpsSrv, {
    path : '/socket.io',             // inchangé
    cors : {
     origin      : 'https://localhost:4000',   // front
      methods     : ['GET','POST'],
      credentials : true
    }
  });

/* ─── 2. Mémoire viewers live ─────────────────────────────────────────── */
const currentViewers = { twitch: 0, youtube: 0, tiktok: 0 };

function broadcastViewers() {
  const total = currentViewers.twitch + currentViewers.youtube + currentViewers.tiktok;
  io.emit('viewer_count', { ...currentViewers, total });
}

/* ─── 3. RabbitMQ consumer ────────────────────────────────────────────── */
(async ()=>{
  const conn = await amqp.connect(AMQP_URL);
  const ch   = await conn.createChannel();
  await ch.assertQueue('chat-messages', { durable: true });

  ch.consume('chat-messages', msg =>{
    if (!msg) return;
    const payload = JSON.parse(msg.content.toString());

    if (payload.type === 'chat') {
      /*  ↪  { type:'chat', platform:'TWITCH', text:'user: message' }   */
      io.emit('chat_message', payload);
    } else if (payload.type === 'viewers') {
      /*  ↪  { type:'viewers', platform:'TWITCH', count:123 }          */
      const key = payload.platform.toLowerCase();     // twitch / youtube / tiktok
      currentViewers[key] = payload.count;
      broadcastViewers();
    }

    ch.ack(msg);               // important : confirme la réception
  });

  console.log('[gateway]   connected to RabbitMQ /chat-messages');
})().catch(err=>{
  console.error('[gateway] RabbitMQ error:', err);
  process.exit(1);
});

/* ─── 4. Socket.IO connexion log (facultatif) ─────────────────────────── */
io.on('connection', socket=>{
  console.log('[socket] client', socket.id);
  // envoie l’état courant des viewers quand un client arrive
  broadcastViewers();
});

/* ─── 5. Lancement HTTPS ──────────────────────────────────────────────── */
httpsSrv.listen(PORT, ()=>console.log(`chat-gateway ✓  https://localhost:${PORT}`));