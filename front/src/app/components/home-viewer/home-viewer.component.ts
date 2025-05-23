import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, User } from '../../services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // 👈 AJOUT
import { StreamWatcherService } from '../../services/stream-watcher.service';

@Component({
  selector: 'app-home-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule], // 👈 AJOUT
  templateUrl: './home-viewer.component.html',
  styleUrl: './home-viewer.component.css'
})
export class HomeViewerComponent implements OnInit {
  streamers: User[] = [];
  searchTerm: string = '';


constructor(
  private userService: ApiService,
  private router: Router,
  private streamWatcher: StreamWatcherService // 👈 AJOUT
) {}


  ngOnInit(): void {
  this.userService.getStreamers().subscribe(data => {
    this.streamers = data
      .filter(streamer =>
        !!streamer.twitch_channel ||
        !!streamer.youtube_video_id ||
        !!streamer.tiktok_username
      )
      .sort((a, b) => a.username.localeCompare(b.username));
  });
}


  filteredStreamers(): User[] {
    if (!this.searchTerm.trim()) return this.streamers;
    return this.streamers.filter(s =>
      s.username.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  goToChat(streamer: User): void {
  const userId = sessionStorage.getItem('user_id') || '';

  // Lancer les watchers si les données sont disponibles
  if (streamer.twitch_channel) {
    this.streamWatcher.startWatchingTwitch(userId, streamer.twitch_channel).subscribe({
      error: err => console.error('Erreur Twitch:', err)
    });
  }

  if (streamer.tiktok_username) {
    this.streamWatcher.startWatchingTikTok(userId, streamer.tiktok_username).subscribe({
      error: err => console.error('Erreur TikTok:', err)
    });
  }

  if (streamer.youtube_live_chat_id && streamer.youtube_video_id) {
    this.streamWatcher.startWatchingYouTube(
      userId,
      streamer.youtube_live_chat_id,
      streamer.youtube_video_id
    ).subscribe({
      error: err => console.error('Erreur YouTube:', err)
    });
  }

  this.router.navigate(['/tchat']);
}

}
