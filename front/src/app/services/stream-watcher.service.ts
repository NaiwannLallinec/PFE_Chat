import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StreamWatcherService {
  private twitchUrl = 'http://localhost:3001/twitch/start';
  private tiktokUrl = 'http://localhost:3002/tiktok/start';
  private youtubeUrl = 'http://localhost:3003/youtube/start';
    private readonly baseUrl = "http://localhost:8000"

  private twitchToken = '4eechmp0u4zuv38rtqtok7gq6nxmya';

  constructor(private http: HttpClient) {}

  startWatchingTwitch(userId: string, streamName: string): Observable<any> {
    if (!streamName) throw new Error('Nom du stream Twitch requis');
    return this.http.post(this.twitchUrl, {
      user_id: userId,
      twitch_channel: streamName,
      twitch_token: this.twitchToken
    });
  }

  startWatchingTikTok(userId: string, tiktokUsername: string): Observable<any> {
    if (!tiktokUsername) throw new Error('Nom d’utilisateur TikTok requis');
    return this.http.post(this.tiktokUrl, {
      user_id: userId,
      tiktok_username: tiktokUsername
    });
  }

  startWatchingYouTube(userId: string, youtubeChatId: string, youtubeVideoId: string): Observable<any> {
    if (!youtubeChatId || !youtubeVideoId) throw new Error('Identifiants YouTube requis');
    return this.http.post(this.youtubeUrl, {
      user_id: userId,
      youtube_live_chat_id: youtubeChatId,
      youtube_video_id: youtubeVideoId
    });
  }
    updateUserSocials(userId: string, data: any) {
    return this.http.patch(`${this.baseUrl}/users/${userId}/socials`, data);
  }
}
