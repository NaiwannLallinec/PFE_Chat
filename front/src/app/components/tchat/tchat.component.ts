import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { io, Socket } from 'socket.io-client';
export type Platform = 'TWITCH' | 'TIKTOK' | 'YOUTUBE';
interface ChatMessage { platform: Platform; text: string; }
interface ViewerCounts { twitch: number; tiktok: number; youtube: number; total: number; }
@Component({ selector: 'app-tchat', templateUrl: './tchat.component.html', styleUrls: ['./tchat.component.css'], standalone: true, imports: [CommonModule, FormsModule] })
export class TchatComponent implements OnInit, OnDestroy {
  constructor(private http: HttpClient) {}

  userId = '1'; // à adapter avec ton auth réelle
  twitchToken = 'aw818fpymll1cqh1h7gekku961375n';
  streamName = '';
  tiktokName = '';
  ytChatId = '';
  ytVideoId = '';
  now = new Date();

  socket!: Socket;
  messages: ChatMessage[] = [];
  viewerCounts: ViewerCounts = { twitch: 0, tiktok: 0, youtube: 0, total: 0 };
  platformFilters: Record<Platform, boolean> = { TWITCH: true, TIKTOK: true, YOUTUBE: true };

  ngOnInit(): void {
    this.socket = io('https://localhost:5000', {
      path: '/socket.io',
      auth: { userId: this.userId },
      transports: ['websocket']
    });

    this.socket.on('chat_message', (msg: ChatMessage) => {
      if (this.platformFilters[msg.platform]) this.messages.push(msg);
    });

    this.socket.on('viewer_count', (payload: ViewerCounts) => {
      this.viewerCounts = payload;
    });
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }

  startTwitch() {
    this.http.post('http://localhost:3001/twitch/start', {
      user_id: this.userId,
      twitch_channel: this.streamName,
      twitch_token: this.twitchToken
    }).subscribe({
      next: () => console.log('Twitch OK'),
      error: err => console.error('Erreur Twitch', err)
    });
  }

  startTikTok() {
    this.http.post('http://localhost:3002/tiktok/start', {
      user_id: this.userId,
      tiktok_username: this.tiktokName
    }).subscribe({
      next: () => console.log('TikTok OK'),
      error: err => console.error('Erreur TikTok', err)
    });
  }

  startYouTube() {
    this.http.post('http://localhost:3003/youtube/start', {
      user_id: this.userId,
      youtube_live_chat_id: this.ytChatId,
      youtube_video_id: this.ytVideoId
    }).subscribe({
      next: () => console.log('YouTube OK'),
      error: err => console.error('Erreur YouTube', err)
    });
  }

  togglePlatform(p: Platform): void {
    this.platformFilters[p] = !this.platformFilters[p];
  }
}
