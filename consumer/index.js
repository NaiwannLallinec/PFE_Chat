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
    AMQP_URL = 'amqp://user:password@rabbitmq',
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
    path : '/socket.io',
    cors : {
        origin      : 'https://localhost:4000',
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

/* ─── 3. Stockage des sockets par userId ──────────────────────────────── */
const userSockets = new Map(); // userId -> Set of socket instances

io.on('connection', socket => {
    const userId = socket.handshake.auth?.userId;
    console.log(`[socket] client ${socket.id} - userId: ${userId}`);

    if (userId) {
        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId).add(socket);

        socket.on('disconnect', () => {
            userSockets.get(userId)?.delete(socket);
            if (userSockets.get(userId)?.size === 0) {
                userSockets.delete(userId);
            }
        });
    }

});

/* ─── 4. RabbitMQ consumer ────────────────────────────────────────────── */
(async ()=>{
    const conn = await amqp.connect(AMQP_URL);
    const ch   = await conn.createChannel();
    await ch.assertQueue('chat-messages', { durable: true });

    ch.consume('chat-messages', msg =>{
        if (!msg) return;
        const payload = JSON.parse(msg.content.toString());

        if (payload.type === 'chat') {
            const users = Array.isArray(payload.user_ids) ? payload.user_ids : [];
            if (Array.isArray(users) && users.length > 0) {
                // Envoi ciblé
                users.forEach(userId => {
                    const sockets = userSockets.get(userId);
                    if (sockets) {
                        for (const sock of sockets) {
                            sock.emit('chat_message', payload);
                        }
                    }
                });
            } else {
                // Broadcast si pas de users spécifiés
                io.emit('chat_message', payload);
            }
        }

        else if (payload.type === 'viewers') {
                const key = payload.platform.toLowerCase();
                currentViewers[key] = payload.count;

                const users = Array.isArray(payload.user_ids) ? payload.user_ids : [];

                if (users.length > 0) {
                    const total = currentViewers.twitch + currentViewers.youtube + currentViewers.tiktok;
                    const viewerPayload = { ...currentViewers, total };

                    users.forEach(userId => {
                        const sockets = userSockets.get(userId);
                        if (sockets) {
                            for (const sock of sockets) {
                                sock.emit('viewer_count', viewerPayload);
                            }
                        }
                    });
                } else {
                    // fallback broadcast global si user_ids vide ou non spécifié
                    broadcastViewers();
                }
            }


        ch.ack(msg);
    });

    console.log('[gateway]   connected to RabbitMQ /chat-messages');
})().catch(err=>{
    console.error('[gateway] RabbitMQ error:', err);
    process.exit(1);
});

/* ─── 5. Lancement HTTPS ──────────────────────────────────────────────── */
httpsSrv.listen(PORT, ()=>console.log(`chat-gateway ✓  https://localhost:${PORT}`));
