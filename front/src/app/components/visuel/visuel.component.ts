
import { Component, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { RouterOutlet } from '@angular/router';

interface ChatMessage {
  id: number;
  username: string;
  message: string;
  platform: 'twitch' | 'youtube' | 'tiktok';
  timestamp: Date;
  highlighted?: boolean;
  donation?: number;
}
 

@Component({
  selector: 'app-visuel',
  templateUrl: './visuel.component.html',
  styleUrl: './visuel.component.css',
  animations: [
    trigger('messageAnimation', [
      transition(':enter', [
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class VisuelComponent implements OnInit, AfterViewInit {
  @ViewChild('chatContainer') chatContainer!: ElementRef;
  
  messages: ChatMessage[] = [];
  activePlatforms = {
    twitch: true,
    youtube: true,
    tiktok: true
  };
  
  selectedMessage: ChatMessage | null = null;
  isFullscreen = false;
  
  // Mock data for demonstration
  mockUsers = {
    twitch: ['TwitchUser1', 'StreamFan99', 'PurpleHeart', 'TwitchPrime', 'Mod_Master'],
    youtube: ['YT_Viewer', 'ContentLover', 'RedSubscriber', 'YTGaming', 'SuperChat'],
    tiktok: ['TikTokStar', 'Trend_Follower', 'ViralCreator', 'TikTokLive', 'DuetKing']
  };
  
  mockMessages = [
    'This stream is amazing!', 
    'LOL that was hilarious 😂', 
    'Can you play my favorite game next?',
    'Greetings from Germany!',
    'You re the best streamer ever!',
    'How long have you been streaming?',
    'This is my first time watching, instant follow!',
    'That play was insane!',
    'Can you give a shoutout to my friend?',
    'What s your streaming schedule?'
  ];

  constructor() { }

  ngOnInit(): void {
    // Generate initial messages
    this.generateMockMessages(15);
    
    // Simulate incoming messages
    setInterval(() => this.addRandomMessage(), 2000);
  }
  
  ngAfterViewInit(): void {
    this.scrollToBottom();
  }
  
  togglePlatform(platform: 'twitch' | 'youtube' | 'tiktok'): void {
    this.activePlatforms[platform] = !this.activePlatforms[platform];
  }
  
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
  }
  
  highlightMessage(message: ChatMessage): void {
    this.selectedMessage = message;
  }
  
  dismissHighlight(): void {
    this.selectedMessage = null;
  }
  
  banUser(username: string): void {
    // In a real app, this would call a service to ban the user
    this.messages = this.messages.filter(m => m.username !== username);
  }
  
  pinMessage(message: ChatMessage): void {
    message.highlighted = true;
  }
  
  private generateMockMessages(count: number): void {
    for (let i = 0; i < count; i++) {
      this.addRandomMessage(true);
    }
  }
  
  private addRandomMessage(isInitial = false): void {
    const platforms = ['twitch', 'youtube', 'tiktok'] as const;
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    
    if (!this.activePlatforms[platform]) return;
    
    const users = this.mockUsers[platform];
    const username = users[Math.floor(Math.random() * users.length)];
    const message = this.mockMessages[Math.floor(Math.random() * this.mockMessages.length)];
    
    // Occasionally add a donation
    const hasDonation = Math.random() > 0.8;
    const donation = hasDonation ? Math.floor(Math.random() * 100) + 1 : undefined;
    
    const newMessage: ChatMessage = {
      id: this.messages.length + 1,
      username,
      message,
      platform,
      timestamp: new Date(),
      donation
    };
    
    this.messages.push(newMessage);
    
    // Keep only the last 100 messages
    if (this.messages.length > 100) {
      this.messages.shift();
    }
    
    if (!isInitial) {
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }
  
  private scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }
  
  getPlatformIcon(platform: string): string {
    switch (platform) {
      case 'twitch': return 'fab fa-twitch';
      case 'youtube': return 'fab fa-youtube';
      case 'tiktok': return 'fab fa-tiktok';
      default: return 'fas fa-comment';
    }
  }
  
  getPlatformColor(platform: string): string {
    switch (platform) {
      case 'twitch': return 'platform-twitch';
      case 'youtube': return 'platform-youtube';
      case 'tiktok': return 'platform-tiktok';
      default: return '';
    }
  }
}