import { getValidToken } from './oauth-server.js';
import tmi from 'tmi.js';
import fetch from 'node-fetch';

async function testTwitchChat() {
  try {
    const access_token = await getValidToken('twitch', 'oauth');
    const client = new tmi.Client({
      options: { debug: true },
      connection: { reconnect: true, secure: true },
      identity: {
        username: 'devpfe',
        password: access_token,
      },
      channels: ['Tonton'],
    });

    await client.connect();
    console.log('[TWITCH] Test: Bot connecté au chat.');

    client.on('message', (channel, tags, message, self) => {
      if (self) return;
      console.log(`[TWITCH][${tags['display-name']}]: ${message}`);
    });

    // Déconnexion après 10 secondes pour les tests
    setTimeout(() => client.disconnect(), 10000);
  } catch (error) {
    console.error('[TWITCH] Erreur lors du test:', error);
  }
}

async function testYouTubeChat() {
  try {
    const access_token = await getValidToken('youtube', 'raw');
    const liveChatId = 'Cg0KC1h1Z1BqVGNGajZ3KicKGFVDa2luWVRTOUlIcU9Fd1IxU3plMkpUdxILWHVnUGpUY0ZqNnc';
    const url = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      data.items.forEach(item => {
        console.log(`[YTB][${item.authorDetails.displayName}]: ${item.snippet.displayMessage}`);
      });
    } else {
      console.log('[YTB] Aucun message reçu (le live est peut-être terminé).');
    }
  } catch (error) {
    console.error('[YTB] Erreur lors du test:', error);
  }
}

// Exécuter les tests
console.log('Test Twitch...');
testTwitchChat();
console.log('Test YouTube...');
testYouTubeChat();