/* ────────────────────────────────────────────────────────────────────────────
   auth-service/server.js – gère l’OAuth Twitch + YouTube et stocke en BDD
   écoute sur https://localhost:4000
   ───────────────────────────────────────────────────────────────────────── */

   import express  from 'express';
   import fetch    from 'node-fetch';
   import pg       from 'pg';
   import path     from 'path';
   import https    from 'https';
   import fs       from 'fs';
   import 'dotenv/config';
   import { fileURLToPath } from 'url';
   
   /* ═════ 1. ENV & BDD ═══════════════════════════════════════════════════════ */
   const {
     DB_URL,
     TWITCH_CLIENT_ID,
     TWITCH_CLIENT_SECRET,
     YT_CLIENT_ID,
     YT_CLIENT_SECRET,
   } = process.env;
   
   const pool = new pg.Pool({ connectionString: DB_URL });
   
   /* helper : INSERT … ON CONFLICT (upsert) */
   async function upsertToken({ userId, platform, access, refresh, exp }) {
     await pool.query(
       `INSERT INTO tokens (user_id, platform, access_token, refresh_token, expires_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id, platform)
        DO UPDATE SET access_token=$3, refresh_token=$4, expires_at=$5`,
       [userId, platform, access, refresh, exp],
     );
   }
   
   /* ═════ 2. Express & HTTPS ════════════════════════════════════════════════ */
   const __dirname = path.dirname(fileURLToPath(import.meta.url));
   const rootPath  = path.join(__dirname, '..');           // dossier projet
   
   const app = express();
   app.use(express.static(path.join(__dirname, 'public')));
   app.use(express.json());
   
   /*  certificats auto‑signés :  certs/server.key  et  certs/server.cert  */
   const httpsSrv = https.createServer(
     {
       key : fs.readFileSync(path.join(rootPath, 'certs', 'server.key')),
       cert: fs.readFileSync(path.join(rootPath, 'certs', 'server.cert')),
     },
     app,
   );
   
   /* POC mono‑user (id = 1) ; ajoute une vraie auth plus tard si besoin */
   const USER_ID = 1;
   
   /* ═════ 3. Routes UI ═════════════════════════════════════════════════════ */
   app.get('/', (_req, res) =>
     res.sendFile(path.join(__dirname, 'public', 'auth.html')));
   
   app.get('/confirmation', (_req, res) =>
     res.sendFile(path.join(__dirname, 'public', 'confirmation.html')));
   
   /* ═════ 4. Lien OAuth Twitch & YouTube ═══════════════════════════════════ */
   const TWITCH_REDIRECT = 'https://localhost:4000/callback';
   const YT_REDIRECT     = 'https://localhost:4000/callback/youtube';
   
   app.get('/authorize-twitch', (_req, res) => {
     const url =
       `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}` +
       `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT)}` +
       `&response_type=code&scope=chat:read chat:edit`;
     res.redirect(url);
   });
   
   app.get('/authorize-youtube', (_req, res) => {
     const url =
       `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YT_CLIENT_ID}` +
       `&redirect_uri=${encodeURIComponent(YT_REDIRECT)}` +
       `&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly` +
       `&access_type=offline&prompt=consent`;
     res.redirect(url);
   });
   
   /* ═════ 5. Callbacks OAuth ════════════════════════════════════════════════ */
   app.get('/callback', async (req, res) => {
     const { code } = req.query;
     if (!code) return res.send('missing code');
   
     const params = new URLSearchParams({
       client_id: TWITCH_CLIENT_ID,
       client_secret: TWITCH_CLIENT_SECRET,
       code,
       grant_type: 'authorization_code',
       redirect_uri: TWITCH_REDIRECT,
     });
     const tok = await (await fetch(
       'https://id.twitch.tv/oauth2/token',
       { method: 'POST', body: params })
     ).json();
     if (!tok.access_token) return res.send('OAuth Twitch error');
   
     await upsertToken({
       userId: USER_ID,
       platform: 'twitch',
       access: tok.access_token,
       refresh: tok.refresh_token,
       exp: new Date(Date.now() + tok.expires_in * 1000),
     });
     res.redirect('/confirmation?platform=Twitch');
   });
   
   app.get('/callback/youtube', async (req, res) => {
     const { code } = req.query;
     if (!code) return res.send('missing code');
   
     const params = new URLSearchParams({
       client_id: YT_CLIENT_ID,
       client_secret: YT_CLIENT_SECRET,
       code,
       grant_type: 'authorization_code',
       redirect_uri: YT_REDIRECT,
     });
     const tok = await (await fetch(
       'https://oauth2.googleapis.com/token',
       { method: 'POST', body: params,
         headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
     ).json();
     if (!tok.access_token) return res.send('OAuth YT error');
   
     await upsertToken({
       userId: USER_ID,
       platform: 'youtube',
       access: tok.access_token,
       refresh: tok.refresh_token,
       exp: new Date(Date.now() + tok.expires_in * 1000),
     });
     res.redirect('/confirmation?platform=YouTube');
   });
   
   /* ═════ 6.  /save‑channels  ═══════════════════════════════════════════════ */
   app.post('/save-channels', async (req, res) => {
     const { twitchChannel, youtubeLiveChatId, youtubeVideoId, tiktokUsername } = req.body;
     if (!twitchChannel || !youtubeLiveChatId || !youtubeVideoId || !tiktokUsername)
       return res.status(400).json({ error: 'missing params' });
   
     await pool.query(
       `INSERT INTO channels
            (user_id, twitch_channel, youtube_live_chat_id, youtube_video_id, tiktok_username)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id)
        DO UPDATE SET twitch_channel=$2,
                      youtube_live_chat_id=$3,
                      youtube_video_id=$4,
                      tiktok_username=$5`,
       [USER_ID,
        twitchChannel.trim(),
        youtubeLiveChatId.trim(),
        youtubeVideoId.trim(),
        tiktokUsername.trim()],
     );
     res.json({ message: 'Chaînes enregistrées.' });
   });
   
   /* ═════ 7. Lancement ====================================================== */
   httpsSrv.listen(4000, () =>
     console.log('auth-service ✓  https://localhost:4000'));   