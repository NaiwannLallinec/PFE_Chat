import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { io, Socket } from 'socket.io-client';
export type Platform = 'TWITCH' | 'TIKTOK' | 'YOUTUBE';
interface ChatMessage { platform: Platform; text: string; }
interface ViewerCounts { twitch: number; tiktok: number; youtube: number; total: number; }
@Component(
  { 
    selector: 'app-tchat', 
    templateUrl: './tchat.component.html', 
    styleUrls: ['./tchat.component.css'], 
    standalone: true, 
    imports: [CommonModule, FormsModule] 
  }
)

export class TchatComponent implements OnInit, OnDestroy, AfterViewChecked {
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  constructor(private http: HttpClient) {}

  userId = sessionStorage.getItem('user_id') || '';
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

this.socket.on('viewer_count', (payload: any) => {
  console.log('Received viewer count:', payload);
  const platform = payload.platform;
  const count = +payload.count || 0;

  switch (platform) {
    case 'TWITCH':
      this.viewerCounts.twitch = count;
      break;
    case 'TIKTOK':
      this.viewerCounts.tiktok = count;
      break;
    case 'YOUTUBE':
      this.viewerCounts.youtube = count;
      break;
  }

  // Toujours recalculer le total
  this.viewerCounts.total = 
    this.viewerCounts.twitch +
    this.viewerCounts.tiktok +
    this.viewerCounts.youtube;
});

  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  
  togglePlatform(p: Platform): void {
    this.platformFilters[p] = !this.platformFilters[p];
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Auto-scroll error:', err);
    }
  }
}
