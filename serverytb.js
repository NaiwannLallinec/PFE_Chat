// youtube-oauth.js
// Assure-toi que ton package.json contient "type": "module"

import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import https from 'https';

const app = express();
const port = 3001;

// ----- A. VARIABLES A ADAPTER POUR YOUTUBE -----
const CLIENT_ID = '605242602241-vsgqhm3773h68upiqj0jsq2d0ogr7mmf.apps.googleusercontent.com';       // Remplace par ton ID client YouTube
const CLIENT_SECRET = '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'; // Remplace par ton Client Secret YouTube
const REDIRECT_URI = 'https://localhost:3001/callback'; // Assure-toi que cette URL est bien configurée dans tes identifiants OAuth

// ----- B. SERVEUR HTTPS AUTO-SIGNÉ -----
// Pour tester en local, génère un certificat auto-signé avec :
// openssl req -nodes -new -x509 -keyout server.key -out server.cert
const privateKey = fs.readFileSync('server.key');
const certificate = fs.readFileSync('server.cert');

// ----- C. ROUTE D'ACCUEIL -----
// Construit l'URL d'autorisation pour YouTube OAuth2
app.get('/', (req, res) => {
  // Les scopes pour accéder aux données YouTube (ici lecture seule)
  const scopes = ['https://www.googleapis.com/auth/youtube.readonly'];
  const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                         `client_id=${CLIENT_ID}` +
                         `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
                         `&response_type=code` +
                         `&scope=${encodeURIComponent(scopes.join(' '))}` +
                         `&access_type=offline` +
                         `&prompt=consent`;
  res.send(`
    <h1>Bienvenue sur YouTube OAuth2 Demo</h1>
    <p><a href="${authorizeUrl}">Clique ici pour autoriser l'appli sur YouTube</a></p>
  `);
});

// ----- D. ROUTE DE CALLBACK -----
// YouTube renvoie l'utilisateur ici avec ?code=XXXXX
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send('Pas de code dans l\'URL, autorisation refusée ou erreur.');
  }

  // On échange le code contre un access token en faisant une requête POST à Google
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', REDIRECT_URI);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const data = await response.json();
    console.log('Réponse du token endpoint:', data);
    
    if (!data.access_token) {
      return res.send('Pas d\'access_token retourné. Vérifie tes credentials ou ta config.');
    }

    // Affiche les tokens pour le POC (en production, stocke-les de manière sécurisée)
    res.send(`
      <h1>Token obtenu !</h1>
      <p><strong>Access Token:</strong> ${data.access_token}</p>
      <p><strong>Refresh Token:</strong> ${data.refresh_token}</p>
      <p><strong>Expires In:</strong> ${data.expires_in} secondes</p>
      <p><strong>Scopes:</strong> ${data.scope}</p>
      <p>Utilise ce token dans tes requêtes YouTube (avec le préfixe "Bearer").</p>
    `);

  } catch (error) {
    console.error('Erreur pendant le fetch:', error);
    res.send('Une erreur est survenue lors de l\'échange du code contre un token.');
  }
});

// ----- E. LANCEMENT DU SERVEUR HTTPS -----
const serverHttps = https.createServer({ key: privateKey, cert: certificate }, app);
serverHttps.listen(port, () => {
  console.log(`Serveur HTTPS démarré sur https://localhost:${port}`);
  console.log(`Allez sur https://localhost:${port} pour démarrer le flux OAuth.`);
});
