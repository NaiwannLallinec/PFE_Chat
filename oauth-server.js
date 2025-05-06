import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import https from 'https';

const app = express();
const port = 3000;

// ----- A. Configuration -----
const TWITCH_CLIENT_ID = 'jmg950fysko6arbr8ewigm7cfi0v9k';
const TWITCH_CLIENT_SECRET = '61pdm9szz1l0as1x3vhq6vm2my8nyj';
const TWITCH_REDIRECT_URI = 'https://localhost:3000/callback';
const YOUTUBE_CLIENT_ID = '605242602241-vsgqhm3773h68upiqj0jsq2d0ogr7mmf.apps.googleusercontent.com';
const YOUTUBE_CLIENT_SECRET = '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';
const YOUTUBE_REDIRECT_URI = 'https://localhost:3000/callback/youtube';
const TOKEN_FILE = 'tokens.json';

// ----- B. Serveur HTTPS auto-signé -----
const privateKey = fs.readFileSync('server.key');
const certificate = fs.readFileSync('server.cert');

// ----- C. Routes OAuth -----
app.get('/', (req, res) => {
  const twitchAuthorizeUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(['chat:read', 'chat:edit'].join(' '))}`;
  const youtubeAuthorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(['https://www.googleapis.com/auth/youtube.readonly'].join(' '))}&access_type=offline&prompt=consent`;

  res.send(`
    <h1>Bienvenue</h1>
    <p><a href="${twitchAuthorizeUrl}">Autoriser Twitch</a></p>
    <p><a href="${youtubeAuthorizeUrl}">Autoriser YouTube</a></p>
  `);
});

app.get('/callback', async (req, res) => {
  console.log('Requête reçue sur /callback:', req.query);
  const { code } = req.query;
  if (!code) {
    return res.send('Pas de code dans l\'URL.');
  }

  const params = new URLSearchParams();
  params.append('client_id', TWITCH_CLIENT_ID);
  params.append('client_secret', TWITCH_CLIENT_SECRET);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', TWITCH_REDIRECT_URI);

  try {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: params,
    });
    const data = await response.json();

    if (!data.access_token) {
      return res.send('Pas de access_token retourné.');
    }

    const expires_at = new Date(Date.now() + data.expires_in * 1000);
    let tokens = fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE)) : {};
    tokens.twitch = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expires_at.toISOString(),
      scope: data.scope,
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));

    res.send('<h1>Token Twitch sauvegardé !</h1><p>Vous pouvez utiliser l\'application.</p>');
  } catch (error) {
    console.error('Erreur Twitch OAuth:', error);
    res.send('Erreur lors de l\'obtention du token Twitch.');
  }
});

app.get('/callback/youtube', async (req, res) => {
  console.log('Requête reçue sur /callback/youtube:', req.query);
  const { code } = req.query;
  if (!code) {
    return res.send('Pas de code dans l\'URL.');
  }

  const params = new URLSearchParams();
  params.append('client_id', YOUTUBE_CLIENT_ID);
  params.append('client_secret', YOUTUBE_CLIENT_SECRET);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', YOUTUBE_REDIRECT_URI);

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await response.json();

    if (!data.access_token) {
      return res.send('Pas d\'access_token retourné.');
    }

    const expires_at = new Date(Date.now() + data.expires_in * 1000);
    let tokens = fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE)) : {};
    tokens.youtube = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expires_at.toISOString(),
      scope: data.scope.split(' '),
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));

    res.send('<h1>Token YouTube sauvegardé !</h1><p>Vous pouvez utiliser l\'application.</p>');
  } catch (error) {
    console.error('Erreur YouTube OAuth:', error);
    res.send('Erreur lors de l\'obtention du token YouTube.');
  }
});

// ----- D. Fonctions de rafraîchissement -----
async function refreshTwitchToken() {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
  const { refresh_token } = tokens.twitch;

  const params = new URLSearchParams();
  params.append('client_id', TWITCH_CLIENT_ID);
  params.append('client_secret', TWITCH_CLIENT_SECRET);
  params.append('refresh_token', refresh_token);
  params.append('grant_type', 'refresh_token');

  try {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: params,
    });
    const data = await response.json();

    if (!data.access_token) {
      throw new Error('Échec du rafraîchissement du token Twitch.');
    }

    const expires_at = new Date(Date.now() + data.expires_in * 1000);
    tokens.twitch = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      expires_at: expires_at.toISOString(),
      scope: data.scope,
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));

    return data.access_token;
  } catch (error) {
    console.error('Erreur lors du rafraîchissement Twitch:', error);
    throw error;
  }
}

async function refreshYouTubeToken() {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
  const { refresh_token } = tokens.youtube;

  const params = new URLSearchParams();
  params.append('client_id', YOUTUBE_CLIENT_ID);
  params.append('client_secret', YOUTUBE_CLIENT_SECRET);
  params.append('refresh_token', refresh_token);
  params.append('grant_type', 'refresh_token');

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await response.json();

    if (!data.access_token) {
      throw new Error('Échec du rafraîchissement du token YouTube.');
    }

    const expires_at = new Date(Date.now() + data.expires_in * 1000);
    tokens.youtube = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      expires_at: expires_at.toISOString(),
      scope: data.scope.split(' '),
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));

    return data.access_token;
  } catch (error) {
    console.error('Erreur lors du rafraîchissement YouTube:', error);
    throw error;
  }
}

// ----- E. Récupération d'un token valide -----
async function getValidToken(platform, format = 'raw') {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error(`Aucun token trouvé pour ${platform}. Exécutez le flux OAuth d'abord.`);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
  const tokenData = tokens[platform];

  if (!tokenData) {
    throw new Error(`Aucun token pour ${platform}`);
  }

  let access_token = tokenData.access_token;
  const expires_at = new Date(tokenData.expires_at);

  if (new Date() >= expires_at) {
    access_token = platform === 'twitch' ? await refreshTwitchToken() : await refreshYouTubeToken();
  }

  if (platform === 'twitch' && format === 'oauth') {
    return `oauth:${access_token}`;
  }
  return access_token;
}

// ----- F. Lancement du serveur -----
const server = https.createServer({ key: privateKey, cert: certificate }, app);
server.listen(port, () => {
  console.log(`Serveur HTTPS démarré sur https://localhost:${port}`);
});

export { getValidToken };