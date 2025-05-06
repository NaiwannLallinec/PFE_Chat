import fetch from 'node-fetch';
import { getValidToken } from './oauth-server.js';

async function fetchYouTubeChat(liveChatId) {
  try {
    const access_token = await getValidToken('youtube', 'raw');

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${liveChatId}&part=snippet,authorDetails`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );
    const data = await response.json();

    for (const item of data.items) {
      console.log(`[${item.authorDetails.displayName}]: ${item.snippet.textMessageDetails.messageText}`);
      // Intégration avec Kafka si nécessaire :
      // producer.send({ topic: 'chat-messages', messages: [{ value: JSON.stringify({ platform: 'youtube', streamId: liveChatId, text: item.snippet.textMessageDetails.messageText, timestamp: new Date(item.snippet.publishedAt) }) }] });
    }
  } catch (error) {
    console.error('Erreur lors de la récupération du chat YouTube:', error);
  }
}

export { fetchYouTubeChat };