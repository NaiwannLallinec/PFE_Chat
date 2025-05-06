// aggregator.js
// Assure-toi que ton package.json contient "type": "module"

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import tmi from 'tmi.js';
import { WebcastPushConnection } from 'tiktok-live-connector';
import fetch from 'node-fetch';
import fs from 'fs';

// On ne récupère pas l'ID du chat via l'API puisque nous l'avons déjà
const YOU_TUBE_CHAT_ID = 'Cg0KCzZKTl9TRERNeU9nKicKGFVDRjRXeGRvM2lubXhQLVk1OXdYRHNGdxILNkpOX1NERE15T2c';

// Access token OAuth2 en dur ou récupéré depuis un token.json (à adapter selon vos besoins)
// Ici, par simplicité, l'access token est codé en dur.
const ACCESS_TOKEN = 'ya29.a0AZYkNZhgMNeQWvwbSsnAUu_I93YR4QnXNRpbVZ32uC8w1Msj8HOVfZhiX49QHplMXdbTY4yxpqZkQT_gYUgVe3jTDbCGe87zAjph6KbW44ROGsth8D0mDKslIf6dTehY24EaeK-pDG-Zife2WpubfuqJNyN9iOtcEN98qsBLaCgYKAUUSARESFQHGX2Mi9MVS_whfVzbdXSIKEw4uQg0175';

// --------------------------
// Configuration du serveur web
// --------------------------
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

// Sert les fichiers statiques depuis le dossier "public"
app.use(express.static('public'));

// --------------------------
// Configuration Twitch
// --------------------------
const TWITCH_CHANNEL = 'Etoiles'; // Ton canal Twitch
const twitchClient = new tmi.Client({
  options: { debug: true },
  connection: { reconnect: true, secure: true },
  identity: {
    username: 'devpfe',
    password: 'oauth:891q594ix49cf2sblk9xhw04hb5z0c' // Token pour tmi.js avec préfixe "oauth:"
  },
  channels: [ TWITCH_CHANNEL ]
});

twitchClient.connect()
  .then(() => {
    console.log('[TWITCH] Bot connecté au chat.');
  })
  .catch(err => {
    console.error('[TWITCH] Erreur de connexion:', err);
  });

twitchClient.on('message', (channel, tags, message, self) => {
  if (self) return;
  const username = tags['display-name'] || tags.username;
  const formattedMessage = `${username}: ${message}`;
  console.log('[TWITCH]', formattedMessage);
  io.emit('chat_message', {
    platform: 'TWITCH',
    text: `${formattedMessage}`
  });
});

// --------------------------
// Configuration TikTok
// --------------------------
const tiktokUsername = 'grossiste_en_ligne.com';
const tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);

tiktokLiveConnection.on('chat', (data) => {
  const formattedMessage = `${data.nickname}: ${data.comment}`;
  console.log('[TIKTOK]', formattedMessage);
  io.emit('chat_message', {
    platform: 'TIKTOK',
    text: `${formattedMessage}`
  });
});

tiktokLiveConnection.connect()
  .then(() => {
    console.log('[TIKTOK] Connecté au live avec succès !');
  })
  .catch((err) => {
    console.error('[TIKTOK] Erreur lors de la connexion :', err);
  });

// Variable globale pour TikTok viewer count
let latestTiktokViewerCount = 0;
tiktokLiveConnection.on('roomUser', data => {
  latestTiktokViewerCount = data.viewerCount;
  console.log('[TIKTOK] roomUser event: Viewer Count:', data.viewerCount);
});

// --------------------------
// Configuration YouTube
// --------------------------
const YTB_VIDEO_ID = '6JN_SDDMyOg'; // ID de la diffusion live YouTube souhaitée

// Ici, on affiche directement l'ID du chat déjà connu.
console.log(`[YTB] Utilisation de l'ID du chat déjà connu: ${YOU_TUBE_CHAT_ID}`);

// Fonction de polling pour récupérer les messages de YouTube Live Chat
async function pollYouTubeChat(pageToken = '') {
  if (!YOU_TUBE_CHAT_ID) {
    console.error("[YTB] L'ID du chat n'est pas défini.");
    return;
  }
  const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${YOU_TUBE_CHAT_ID}&part=snippet,authorDetails${pageToken ? '&pageToken=' + pageToken : ''}`;
  console.log(`[YTB] Appel à l'URL de polling: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });
    const data = await response.json();
    console.log('[YTB] Réponse chat:', JSON.stringify(data));
    if (data.items && data.items.length > 0) {
      data.items.forEach(item => {
        const author = item.authorDetails.displayName;
        const message = item.snippet.displayMessage;
        const formattedMessage = `${author}: ${message}`;
        console.log('[YTB]', formattedMessage);
        io.emit('chat_message', {
          platform: 'YTB',
          text: `${formattedMessage}`
        });
      });
    } else {
      console.log("[YTB] Aucuns nouveaux messages reçus.");
    }
    // Utiliser l'intervalle recommandé par l'API ou 5000 ms par défaut
    const pollingInterval = data.pollingIntervalMillis || 5000;
    const nextPageToken = data.nextPageToken || '';
    console.log(`[YTB] Prochain polling dans ${pollingInterval} ms, pageToken: ${nextPageToken}`);
    setTimeout(() => pollYouTubeChat(nextPageToken), pollingInterval);
  } catch (err) {
    console.error('[YTB] Erreur lors du polling du chat:', err);
    setTimeout(() => pollYouTubeChat(pageToken), 5000);
  }
}

// Fonction pour mettre à jour le viewer count de YouTube
async function updateYouTubeViewerCount() {
  let youtubeViewerCount = 0;
  const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${YTB_VIDEO_ID}`;
  console.log(`[YTB] Mise à jour du viewer count via l'URL: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });
    const data = await response.json();
    console.log('[YTB] Réponse viewer count :', JSON.stringify(data));
    if (data.items && data.items.length > 0 && data.items[0].liveStreamingDetails) {
      youtubeViewerCount = Number(data.items[0].liveStreamingDetails.concurrentViewers);
      console.log(`[YTB] Viewer count récupéré: ${youtubeViewerCount}`);
    } else {
      console.error("[YTB] Les détails de diffusion en direct ne sont pas disponibles pour ce live.");
    }
  } catch (err) {
    console.error('[YTB] Erreur lors de la récupération du viewer count:', err);
  }
  return youtubeViewerCount;
}

// --------------------------
// Mise à jour globale des viewer counts
// --------------------------
async function updateViewerCounts() {
  // Twitch
  let twitchViewerCount = 0;
  try {
    const url = `https://api.twitch.tv/helix/streams?user_login=${TWITCH_CHANNEL}`;
    console.log(`[TWITCH] Récupération du viewer count via: ${url}`);
    const response = await fetch(url, {
      headers: {
        'Client-ID': 'jmg950fysko6arbr8ewigm7cfi0v9k',
        'Authorization': 'Bearer mfq0i5trulqwznj8jyd3tchggorntc'
      }
    });
//curl -X POST 'https://id.twitch.tv/oauth2/token' \
//  -d 'client_id=TON_CLIENT_ID' \
//  -d 'client_secret=TON_CLIENT_SECRET' \
//  -d 'grant_type=client_credentials'

    const twitchData = await response.json();
    console.log('[TWITCH] Réponse viewer count :', JSON.stringify(twitchData));
    if (twitchData.data && twitchData.data.length > 0) {
      twitchViewerCount = twitchData.data[0].viewer_count;
    }
  } catch (err) {
    console.error('[TWITCH] Erreur lors de la récupération du viewer count:', err);
  }
  
  // TikTok
  let tiktokViewerCount = latestTiktokViewerCount;
  
  // YouTube
  let youtubeViewerCount = await updateYouTubeViewerCount();

  const totalViewerCount = twitchViewerCount + tiktokViewerCount + youtubeViewerCount;
  console.log(`[GLOBAL] Viewer counts - Twitch: ${twitchViewerCount}, TikTok: ${tiktokViewerCount}, YouTube: ${youtubeViewerCount}, Total: ${totalViewerCount}`);
  io.emit('viewer_count', {
    twitch: twitchViewerCount,
    tiktok: tiktokViewerCount,
    youtube: youtubeViewerCount,
    total: totalViewerCount
  });
}

// Démarrer le polling du chat YouTube directement (avec l'ID en dur)
console.log("[YTB] Démarrage du polling du chat avec l'ID déjà connu...");
pollYouTubeChat();

// Actualiser les viewer counts toutes les 30 secondes
setInterval(updateViewerCounts, 30000);

// --------------------------
// Démarrage du serveur HTTP
// --------------------------
const PORT = 3002;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});