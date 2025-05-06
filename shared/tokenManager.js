/* shared/tokenManager.js
   – getValidToken(platform) + refresh automatique en BDD
*/
import fetch from 'node-fetch';
import { pgPool,
         TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET,
         YT_CLIENT_ID,     YT_CLIENT_SECRET } from './config.js';

/* Rafraîchit un token, met à jour la table et renvoie le nouvel access_token */
async function refreshToken(platform, userId = 1) {
  /* 1. récupère refresh_token actuel */
  const { rows:[tok] } = await pgPool.query(
    'SELECT refresh_token FROM tokens WHERE user_id=$1 AND platform=$2',
    [ userId, platform ]
  );
  if (!tok) throw new Error(`refresh_token absent pour ${platform}`);

  const params = new URLSearchParams({
    client_id:     platform === 'twitch' ? TWITCH_CLIENT_ID  : YT_CLIENT_ID,
    client_secret: platform === 'twitch' ? TWITCH_CLIENT_SECRET : YT_CLIENT_SECRET,
    refresh_token: tok.refresh_token,
    grant_type:    'refresh_token',
  });

  const url = platform === 'twitch'
            ? 'https://id.twitch.tv/oauth2/token'
            : 'https://oauth2.googleapis.com/token';

  const data = await (await fetch(url, {
    method:'POST',
    body: params,
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
  })).json();

  if (!data.access_token) throw new Error(`Échec refresh ${platform}: ${JSON.stringify(data)}`);

  /* 2. met à jour la table tokens */
  await pgPool.query(
    `UPDATE tokens
        SET access_token=$1, expires_at=$2
      WHERE user_id=$3 AND platform=$4`,
    [ data.access_token,
      new Date(Date.now() + data.expires_in*1000),
      userId, platform ]
  );

  return data.access_token;
}

/**
 * Renvoie toujours un token valide.
 *   platform: 'twitch' | 'youtube'
 *   fmt: 'raw' (défaut)  ou  'oauth' (préf. tmi.js) pour Twitch
 */
export async function getValidToken(platform, fmt = 'raw', userId = 1) {
  const { rows:[tok] } = await pgPool.query(
    'SELECT access_token, expires_at FROM tokens WHERE user_id=$1 AND platform=$2',
    [ userId, platform ]
  );
  if (!tok) throw new Error(`token manquant pour ${platform}`);

  let access = tok.access_token;
  if (new Date() >= tok.expires_at) {
    access = await refreshToken(platform, userId);
  }
  return platform === 'twitch' && fmt === 'oauth'
       ? `oauth:${access}`
       : access;
}
