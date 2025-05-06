import tmi from 'tmi.js';
import { getValidToken } from './oauth-server.js';

async function fetchTwitchChat(channel) {
  try {
    const access_token = await getValidToken('twitch', 'oauth');

    const client = new tmi.Client({
      identity: {
        username: 'votre_compte', // Remplacez par votre nom d'utilisateur Twitch
        password: access_token,
      },
      channels: [channel],
    });

    client.connect();

    client.on('message', (channel, tags, message, self) => {
      console.log(`[${channel}][${tags['display-name']}]: ${message}`);
      // Intégration avec Kafka si nécessaire :
      // producer.send({ topic: 'chat-messages', messages: [{ value: JSON.stringify({ platform: 'twitch', streamId: channel.slice(1), text: message, timestamp: new Date() }) }] });
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du chat Twitch:', error);
  }
}

export { fetchTwitchChat };