// auth-service/server.js
// – OAuth Twitch + YouTube, stockage des chaînes et gestion des utilisateurs
// écoute sur : https://localhost:4000

import express           from 'express';
import fetch             from 'node-fetch';
import pg                from 'pg';
import path              from 'path';
import https             from 'https';
import fs                from 'fs';
import session           from 'express-session';
import bcrypt            from 'bcrypt';
import 'dotenv/config';
import { fileURLToPath } from 'url';

//
// 1.  ENV & BDD
//
const {
  DB_URL,
  SESSION_SECRET,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  YT_CLIENT_ID,
  YT_CLIENT_SECRET,
  CHAT_GATEWAY_URL
} = process.env;

const pool = new pg.Pool({ connectionString: DB_URL });

//
// helper : upsert token OAuth
//
async function upsertToken({ userId, platform, access, refresh, exp }) {
  await pool.query(
    `INSERT INTO tokens
       (user_id, platform, access_token, refresh_token, expires_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, platform)
     DO UPDATE SET access_token=$3, refresh_token=$4, expires_at=$5`,
    [userId, platform, access, refresh, exp],
  );
}

//
// 2.  Express + HTTPS + Session
//
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath  = path.join(__dirname, '..');
const app       = express();

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax' }  // secure: true en prod
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const httpsSrv = https.createServer({
  key : fs.readFileSync(path.join(rootPath, 'certs','server.key')),
  cert: fs.readFileSync(path.join(rootPath, 'certs','server.cert')),
}, app);

//
// 3.  Middlewares
//
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  next();
}


//
// 4.  Public routes: signup / login / logout
//

// Signup form
app.get('/signup.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'signup.html'))
);

// Handle signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send('Champs manquants');
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)`,
      [username, hash]
    );
  } catch {
    return res.status(400).send('Nom déjà pris');
  }
  // Auto-login
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE username=$1',
    [username]
  );
  req.session.userId = rows[0].id;
  res.redirect('/');
});

// Login form
app.get('/login.html', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'login.html'))
);

// Handle login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query(
    'SELECT id, password_hash FROM users WHERE username=$1 AND id =2',
    [username]
  );
  const user = rows[0];
  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).send('Identifiants invalides');
  }
  req.session.userId = user.id;
  res.redirect('/');
});

// Logout
app.post('/logout', (req, res) =>
  req.session.destroy(() => res.redirect('/login.html'))
);

//
// 5.  Admin-only routes: OAuth token management
//
const TWITCH_REDIRECT = 'https://localhost:4000/callback';
const YT_REDIRECT     = 'https://localhost:4000/callback/youtube';

// Start OAuth flows (admin only)
app.get('/authorize-twitch', (_req, res) => {
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}`
            + `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT)}`
            + `&response_type=code&scope=chat:read chat:edit`;
  res.redirect(url);
});
app.get('/authorize-youtube', (_req, res) => {
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YT_CLIENT_ID}`
            + `&redirect_uri=${encodeURIComponent(YT_REDIRECT)}`
            + `&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly`
            + `&access_type=offline&prompt=consent`;
  res.redirect(url);
});

// OAuth callbacks (admin only)
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('missing code');
  const params = new URLSearchParams({
    client_id:     TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    code,
    grant_type:    'authorization_code',
    redirect_uri:  TWITCH_REDIRECT,
  });
  const tok = await (await fetch('https://id.twitch.tv/oauth2/token',{
    method:'POST', body: params
  })).json();
  if (!tok.access_token) return res.send('OAuth Twitch error');
  await upsertToken({
    userId:  1,
    platform:'twitch',
    access:  tok.access_token,
    refresh: tok.refresh_token,
    exp:     new Date(Date.now() + tok.expires_in*1000),
  });
  res.redirect('/confirmation?platform=Twitch');
});

app.get('/callback/youtube', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('missing code');
  const params = new URLSearchParams({
    client_id:     YT_CLIENT_ID,
    client_secret: YT_CLIENT_SECRET,
    code,
    grant_type:    'authorization_code',
    redirect_uri:  YT_REDIRECT,
  });
  const tok = await (await fetch('https://oauth2.googleapis.com/token',{
    method:'POST', body: params,
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' }
  })).json();
  if (!tok.access_token) return res.send('OAuth YT error');
  await upsertToken({
    userId:  1,
    platform:'youtube',
    access:  tok.access_token,
    refresh: tok.refresh_token,
    exp:     new Date(Date.now() + tok.expires_in*1000),
  });
  res.redirect('/confirmation?platform=YouTube');
});

// Admin UI pages
app.get('/confirmation', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'confirmation.html'))
);

//
// 6.  Authenticated-only routes: channel config & chat
//

// Serve the channel‐config form (auth.html) to all logged-in users
app.get('/', requireAuth, (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'auth.html'))
);

// Save personal channels (also populate `by_user`)
app.post('/save-channels', requireAuth, async (req, res) => {
  const { twitchChannel, youtubeLiveChatId, youtubeVideoId, tiktokUsername } = req.body;
  if (!twitchChannel || !youtubeLiveChatId || !youtubeVideoId || !tiktokUsername) {
    return res.status(400).json({ error: 'missing params' });
  }
  await pool.query(
    `INSERT INTO channels
       (user_id, twitch_channel, youtube_live_chat_id, youtube_video_id, tiktok_username, by_user)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id)
     DO UPDATE SET
       twitch_channel       = $2,
       youtube_live_chat_id = $3,
       youtube_video_id     = $4,
       tiktok_username      = $5,
       by_user              = $6`,
    [
      req.session.userId,
      twitchChannel.trim(),
      youtubeLiveChatId.trim(),
      youtubeVideoId.trim(),
      tiktokUsername.trim(),
      req.session.userId
    ]
  );
  res.json({ message: 'Chaînes enregistrées.' });
});

// Chat gateway for all logged-in users
app.get('/chat', requireAuth, (_req, res) =>
  res.redirect('/chat.html')
);

app.get('/me', requireAuth, (req, res) => {
  res.json({ userId: req.session.userId });
});

//
// 7.  Démarrage
//
httpsSrv.listen(4000, () =>
  console.log('auth-service ✓  https://localhost:4000')
);