import express from 'express';
import fetch from 'node-fetch';
import fs from 'fs';
import https from 'https';

const app = express();
const port = 3000;

// ----- A. VARIABLES A ADAPTER -----
const CLIENT_ID = 'jmg950fysko6arbr8ewigm7cfi0v9k';
const CLIENT_SECRET = '3e98ony1d90xpnvil0599vcf67mspv';
const REDIRECT_URI = 'https://localhost:3000/callback'; 
// ou 'https://ton_ngrok_subdomain.ngrok.io/callback'

// ----- B. SERVEUR HTTPS AUTO-SIGNE -----
/*
  - Génère un certificat auto-signé pour tester en local :
    openssl req -nodes -new -x509 -keyout server.key -out server.cert
  - Ça va provoquer des avertissements "site non sûr", mais c'est suffisant en local.
*/
const privateKey = fs.readFileSync('server.key');
const certificate = fs.readFileSync('server.cert');

// ----- C. ROUTE D'ACCUEIL -----
// Redirige l'utilisateur vers Twitch pour autoriser l'application
app.get('/', (req, res) => {
  // Construct URL pour le Authorization Code Flow
  const scopes = ['chat:read', 'chat:edit']; // Ajoute d'autres scopes au besoin
  const authorizeUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}`;


  res.send(`
    <h1>Bienvenue</h1>
    <p><a href="${authorizeUrl}">Clique ici pour autoriser l'appli sur Twitch</a></p>
  `);
});

// ----- D. ROUTE DE CALLBACK -----
// Twitch renvoie l'utilisateur ici avec ?code=xxxxx
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send('Pas de code dans l\'URL, autorisation refusée ou erreur.');
  }

  // On échange le "code" contre un "access token"
  const tokenUrl = 'https://id.twitch.tv/oauth2/token';
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', REDIRECT_URI);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params
    });
    const data = await response.json();
    /*
      data contiendra un objet du style :
      {
        "access_token": "abcdefg...",
        "refresh_token": "hijklmn...",
        "expires_in": 3600,
        "scope": ["chat:read", "chat:edit"],
        "token_type": "bearer"
      }
    */
    const { access_token, refresh_token, scope } = data;
    console.log('Réponse du token endpoint:', data);

    if (!access_token) {
      return res.send('Pas de access_token retourné. Vérifie tes credentials ou ta config.');
    }

    // On affiche juste le token sur la page pour le POC.
    // En prod, on le sauvegarderait de manière sécurisée (DB, etc.).
    res.send(`
      <h1>Token obtenu !</h1>
      <p><strong>Access Token:</strong> ${access_token}</p>
      <p><strong>Refresh Token:</strong> ${refresh_token}</p>
      <p><strong>Scopes:</strong> ${JSON.stringify(scope)}</p>
      <p>Copie-colle l'Access Token en l'ajoutant avec "oauth:" 
         pour tmi.js => password: 'oauth:${access_token}'</p>
    `);

  } catch (error) {
    console.error('Erreur pendant le fetch:', error);
    res.send('Une erreur est survenue lors de l\'échange du code contre un token.');
  }
});

// ----- E. LANCEMENT DU SERVEUR HTTPS -----
const server = https.createServer({ key: privateKey, cert: certificate }, app);
server.listen(port, () => {
  console.log(`Serveur HTTPS démarré sur https://localhost:${port}`);
  console.log(`Allez sur https://localhost:${port} pour démarrer le flux OAuth.`);
});
