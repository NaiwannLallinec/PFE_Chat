import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
export type Platform = 'TWITCH' | 'TIKTOK' | 'YOUTUBE';
interface ChatMessage { platform: Platform; text: string; }
interface ViewerCounts { twitch: number; tiktok: number; youtube: number; total: number; }
@Component({ selector: 'app-tchat', templateUrl: './tchat.component.html', styleUrls: ['./tchat.component.css'], standalone: true, imports: [CommonModule, FormsModule] })
export class TchatComponent implements OnInit, OnDestroy {
  constructor(private http: HttpClient) {}

streamName = '';
userId = 1; // à adapter avec ton auth réelle
twitchToken = 'aw818fpymll1cqh1h7gekku961375n';

startWatching() {
  if (!this.streamName) return;
  this.http.post('http://localhost:3001/twitch/start', {
    user_id: this.userId,
    twitch_channel: this.streamName,
    twitch_token: this.twitchToken
  }).subscribe({
    next: res => console.log('Abonné à', this.streamName),
    error: err => console.error('Erreur Twitch start', err)
  });
}

tiktokName = '';

startWatchingTikTok() {
  if (!this.tiktokName) return;
  this.http.post('http://localhost:3002/tiktok/start', {
    user_id: this.userId,
    tiktok_username: this.tiktokName
  }).subscribe({
    next: res => console.log('Abonné à TikTok:', this.tiktokName),
    error: err => console.error('Erreur TikTok start', err)
  });
}

youtubeChatId = '';
youtubeVideoId = '';

startWatchingYouTube() {
  if (!this.youtubeChatId || !this.youtubeVideoId) return;
  this.http.post('http://localhost:3003/youtube/start', {
    user_id: this.userId,
    youtube_live_chat_id: this.youtubeChatId,
    youtube_video_id: this.youtubeVideoId
  }).subscribe({
    next: res => console.log('Abonné à YouTube:', this.youtubeVideoId),
    error: err => console.error('Erreur YouTube start', err)
  });
}



  private ws!: WebSocket;
  now = new Date(); // pour l'heure simulée des messages (optionnel)
  messages: ChatMessage[] = [];
  viewerCounts: ViewerCounts = { twitch: 0, tiktok: 0, youtube: 0, total: 0 };
  isAggregatedMode = true;
  platformFilters: Record<Platform, boolean> = { TWITCH: true, TIKTOK: true, YOUTUBE: true };
  isSlowMode = false;
  messageQueue: ChatMessage[] = [];
  readonly SLOW_MODE_INTERVAL = 2000;
  private slowModeIntervalId!: number;
  ngOnInit(): void {
    this.ws = new WebSocket('ws://localhost:8000/ws/chat');
    this.ws.onmessage = (event: MessageEvent) => {
  const data = JSON.parse(event.data);
  console.log('[WS received]', data); // 👈 AJOUTE ÇA

  if (data.type === 'chat_message') this.handleIncoming(data.payload);
  if (data.type === 'viewer_count') this.viewerCounts = data.payload;
};

    this.slowModeIntervalId = window.setInterval(() => { if (this.isSlowMode) this.processQueue(); }, this.SLOW_MODE_INTERVAL);
  }
  ngOnDestroy(): void { this.ws.close(); clearInterval(this.slowModeIntervalId); }
  handleIncoming(msg: ChatMessage): void { this.isSlowMode ? this.messageQueue.push(msg) : this.processMessage(msg); }
  private processQueue(): void { if (this.messageQueue.length) this.processMessage(this.messageQueue.shift()!); }
  private processMessage(msg: ChatMessage): void { if (this.isAggregatedMode) { if (this.platformFilters[msg.platform]) this.messages.push(msg); } else { this.messages.push(msg); } }
  toggleSlowMode(): void { this.isSlowMode = !this.isSlowMode; }
  togglePlatform(platform: Platform): void { this.platformFilters[platform] = !this.platformFilters[platform]; }
  toggleChatMode(): void { this.isAggregatedMode = !this.isAggregatedMode; this.messages = []; }
  getIcon(platform: Platform): string { return `assets/${platform.toLowerCase()}.jpg`; }
}