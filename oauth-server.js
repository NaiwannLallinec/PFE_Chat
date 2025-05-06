/* ────────────────────────────────────────────────────────────────────────────
   oauth-server.js — agrégation Twitch + YouTube + TikTok (chat + viewers)
   ───────────────────────────────────────────────────────────────────────── */

   import express from 'express';
   import fetch from 'node-fetch';
   import fs from 'fs';
   import https from 'https';
   import path from 'path';
   import { fileURLToPath } from 'url';
   import { Server as SocketIOServer } from 'socket.io';
   import tmi from 'tmi.js';
   import { WebcastPushConnection } from 'tiktok-live-connector';
   
   /* ==  A.  Bases =========================================================== */
   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   const app  = express();
   const port = 3000;
   
   /* ==  B.  Identifiants OAuth / clés ====================================== */
   const TWITCH_CLIENT_ID     = 'jmg950fysko6arbr8ewigm7cfi0v9k';
   const TWITCH_CLIENT_SECRET = '61pdm9szz1l0as1x3vhq6vm2my8nyj';
   const TWITCH_REDIRECT_URI  = 'https://localhost:3000/callback';
   
   const YT_CLIENT_ID     = '605242602241-vsgqhm3773h68upiqj0jsq2d0ogr7mmf.apps.googleusercontent.com';
   const YT_CLIENT_SECRET = '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';
   const YT_REDIRECT_URI  = 'https://localhost:3000/callback/youtube';
   
   /* ==  C.  Fichiers persistance =========================================== */
   const TOKEN_FILE   = 'tokens.json';
   const CHANNEL_FILE = 'channels.json';
   
   /* ==  D.  HTTPS ========================================================== */
   const server = https.createServer(
     { key: fs.readFileSync('server.key'), cert: fs.readFileSync('server.cert') },
     app,
   );
   const io = new SocketIOServer(server);
   
   /* ==  E.  Middlewares ===================================================== */
   app.use(express.static(path.join(__dirname, 'public')));
   app.use(express.json());
   
   /* ==  F.  Variables runtime ============================================== */
   let twitchClient  = null;
   let youtubeTimer  = null;
   let tiktokConn    = null;
   let tiktokViewers = 0;
   
   /* ───────── 1. ROUTES UI ───────────────────────────────────────────────── */
   app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
   
   app.get('/chat', async (_req, res) => {
     if (!fs.existsSync(TOKEN_FILE)) return res.redirect('/');
     const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
     if (!(tokens.twitch && tokens.youtube)) return res.redirect('/');
     try { getChannels(); } catch { return res.redirect('/'); }
   
     if (!twitchClient || !youtubeTimer || !tiktokConn) await startChat();
     res.sendFile(path.join(__dirname, 'public', 'chat.html'));
   });
   
   app.get('/confirmation', (_req, res) =>
     res.sendFile(path.join(__dirname, 'public', 'confirmation.html')));
   
   /* ───────── 2. ROUTES OAuth ────────────────────────────────────────────── */
   app.get('/authorize-twitch', (_req, res) =>
     res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID
       }&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)
       }&response_type=code&scope=${encodeURIComponent('chat:read chat:edit')}`));
   
   app.get('/authorize-youtube', (_req, res) =>
     res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${YT_CLIENT_ID
       }&redirect_uri=${encodeURIComponent(YT_REDIRECT_URI)
       }&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly')
       }&access_type=offline&prompt=consent`));
   
   /* -- callback Twitch ----------------------------------------------------- */
   app.get('/callback', async (req, res) => {
     const { code } = req.query; if (!code) return res.send('Pas de code.');
     const body = new URLSearchParams({
       client_id: TWITCH_CLIENT_ID,
       client_secret: TWITCH_CLIENT_SECRET,
       code,
       grant_type: 'authorization_code',
       redirect_uri: TWITCH_REDIRECT_URI,
     });
     const dat = await (await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body })).json();
     if (!dat.access_token) return res.send('Erreur token Twitch.');
     const store = fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE)) : {};
     store.twitch = {
       access_token: dat.access_token,
       refresh_token: dat.refresh_token,
       expires_at: new Date(Date.now() + dat.expires_in * 1000).toISOString(),
     };
     fs.writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2));
     res.redirect('/confirmation?platform=Twitch');
   });
   
   /* -- callback YouTube ---------------------------------------------------- */
   app.get('/callback/youtube', async (req, res) => {
     const { code } = req.query; if (!code) return res.send('Pas de code.');
     const body = new URLSearchParams({
       client_id: YT_CLIENT_ID,
       client_secret: YT_CLIENT_SECRET,
       code,
       grant_type: 'authorization_code',
       redirect_uri: YT_REDIRECT_URI,
     });
     const dat = await (await fetch('https://oauth2.googleapis.com/token',
       { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).json();
     if (!dat.access_token) return res.send('Erreur token YouTube.');
     const store = fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE)) : {};
     store.youtube = {
       access_token: dat.access_token,
       refresh_token: dat.refresh_token,
       expires_at: new Date(Date.now() + dat.expires_in * 1000).toISOString(),
     };
     fs.writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2));
     res.redirect('/confirmation?platform=YouTube');
   });
   
   /* ───────── 3.  POST /save‑channels ────────────────────────────────────── */
   app.post('/save-channels', (req, res) => {
     const { twitchChannel, youtubeLiveChatId, youtubeVideoId, tiktokUsername } = req.body;
     if (!twitchChannel || !youtubeLiveChatId || !youtubeVideoId || !tiktokUsername)
       return res.status(400).json({ error: 'Paramètres manquants.' });
     fs.writeFileSync(CHANNEL_FILE, JSON.stringify({
       twitch: { channel: twitchChannel.trim() },
       youtube: { liveChatId: youtubeLiveChatId.trim(), videoId: youtubeVideoId.trim() },
       tiktok: { username: tiktokUsername.trim() },
     }, null, 2));
     res.json({ message: 'Chaînes enregistrées.' });
   });
   
   /* ───────── 4.  Helpers tokens & config ────────────────────────────────── */
   async function refreshToken(platform) {
     const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
     const params = new URLSearchParams({
       client_id: platform === 'twitch' ? TWITCH_CLIENT_ID : YT_CLIENT_ID,
       client_secret: platform === 'twitch' ? TWITCH_CLIENT_SECRET : YT_CLIENT_SECRET,
       refresh_token: tokens[platform].refresh_token,
       grant_type: 'refresh_token',
     });
     const url = platform === 'twitch'
       ? 'https://id.twitch.tv/oauth2/token'
       : 'https://oauth2.googleapis.com/token';
     const dat = await (await fetch(url, {
       method: 'POST', body: params,
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
     })).json();
     tokens[platform].access_token = dat.access_token;
     tokens[platform].expires_at = new Date(Date.now() + dat.expires_in * 1000).toISOString();
     fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
     return dat.access_token;
   }
   
   async function getValidToken(platform, fmt = 'raw') {
     const tok = JSON.parse(fs.readFileSync(TOKEN_FILE))[platform];
     if (!tok) throw new Error('no token');
     if (new Date() >= new Date(tok.expires_at)) tok.access_token = await refreshToken(platform);
     return platform === 'twitch' && fmt === 'oauth'
       ? `oauth:${tok.access_token}` : tok.access_token;
   }
   
   function getChannels() {
     const { twitch, youtube, tiktok } = JSON.parse(fs.readFileSync(CHANNEL_FILE));
     if (!twitch?.channel || !youtube?.liveChatId || !youtube?.videoId || !tiktok?.username)
       throw new Error('configuration incomplète');
     return {
       twitchChannel: twitch.channel,
       youtubeLiveChatId: youtube.liveChatId,
       youtubeVideoId: youtube.videoId,
       tiktokUsername: tiktok.username,
     };
   }
   
   /* ───────── 5.  Viewer‑count helpers ───────────────────────────────────── */
   async function fetchTwitchViewers(channel) {
     try {
       const tk = await getValidToken('twitch');
       const r = await fetch(`https://api.twitch.tv/helix/streams?user_login=${channel}`, {
         headers: { 'Client-ID': TWITCH_CLIENT_ID, Authorization: `Bearer ${tk}` },
       });
       const d = await r.json();
       return d.data?.length ? d.data[0].viewer_count : 0;
     } catch { return 0; }
   }
   
   async function fetchYTViewers(videoId, tk) {
     try {
       const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}`, {
         headers: { Authorization: `Bearer ${tk}` },
       });
       const d = await r.json();
       return d.items?.length ? Number(d.items[0].liveStreamingDetails.concurrentViewers) || 0 : 0;
     } catch { return 0; }
   }
   
   /* ───────── 6.  Démarrage agrégateur ───────────────────────────────────── */
   async function startChat() {
     const { twitchChannel, youtubeLiveChatId, youtubeVideoId, tiktokUsername } = getChannels();
   
     /* Reset connexions précédentes */
     if (twitchClient) { await twitchClient.disconnect(); twitchClient = null; }
     if (youtubeTimer) { clearInterval(youtubeTimer); youtubeTimer = null; }
     if (tiktokConn) { tiktokConn.disconnect(); tiktokConn = null; }
   
     /* Twitch chat */
     twitchClient = new tmi.Client({
       connection: { reconnect: true, secure: true },
       identity: { username: 'devpfe', password: await getValidToken('twitch', 'oauth') },
       channels: [twitchChannel],
     });
     await twitchClient.connect();
     twitchClient.on('message', (_c, tags, msg, self) => {
       if (self) return;
       const user = tags['display-name'] || tags.username;
       io.emit('chat_message', { platform: 'TWITCH', text: `${user}: ${msg}` });
     });
   
     /* YouTube chat */
     const ytTk = await getValidToken('youtube');
     async function fetchYTChat() {
       try {
         const r = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages`
           + `?liveChatId=${youtubeLiveChatId}&part=snippet,authorDetails`, {
           headers: { Authorization: `Bearer ${ytTk}` },
         });
         const d = await r.json();
         d.items?.forEach(it => {
           const user = it.authorDetails.displayName;
           io.emit('chat_message', { platform: 'YOUTUBE', text: `${user}: ${it.snippet.displayMessage}` });
         });
       } catch (e) { console.error('[YOUTUBE] chat error:', e); }
     }
     youtubeTimer = setInterval(fetchYTChat, 5000); fetchYTChat();
   
     /* TikTok chat */
     tiktokConn = new WebcastPushConnection(tiktokUsername);
     tiktokConn.on('chat', d =>
       io.emit('chat_message', { platform: 'TIKTOK', text: `${d.nickname}: ${d.comment}` }),
     );
     tiktokConn.on('roomUser', d => (tiktokViewers = d.viewerCount));
     try { await tiktokConn.connect(); } catch (e) { console.error('[TIKTOK] connect:', e); }
   
     /* Viewer counts */
     setInterval(async () => {
       const twitchV = await fetchTwitchViewers(twitchChannel);
       const ytV = await fetchYTViewers(youtubeVideoId, ytTk);
       const total = twitchV + ytV + tiktokViewers;
       io.emit('viewer_count', { twitch: twitchV, youtube: ytV, tiktok: tiktokViewers, total });
     }, 30000);
   }
   
   /* ───────── 7.  Serveur HTTPS ──────────────────────────────────────────── */
   server.listen(port, () => console.log(`HTTPS ✓  https://localhost:${port}`));
   
   /* ───────── 8.  Export facultatif ──────────────────────────────────────── */
   export { getValidToken };
   