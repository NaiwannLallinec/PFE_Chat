import { Component } from '@angular/core';
import { Router } from '@angular/router'; 
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StreamWatcherService } from '../../services/stream-watcher.service';

@Component({
  selector: 'app-setup-streamer',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './setup-streamer.component.html',
  styleUrls: ['./setup-streamer.component.css']
})
export class SetupStreamerComponent {
  twitch_channel = '';
  youtube_live_chat_id = '';
  youtube_video_id = '';
  tiktok_username = '';
  user_id = sessionStorage.getItem('user_id') || '';

  constructor(
    private streamWatcher: StreamWatcherService,
    private router: Router
  ) {}

  submitForm() {
    // Lance tous les appels sans attendre
    if (this.twitch_channel) {
      this.streamWatcher.startWatchingTwitch(this.user_id, this.twitch_channel).subscribe({
        error: err => console.error('Erreur Twitch:', err)
      });
    }

    if (this.tiktok_username) {
      this.streamWatcher.startWatchingTikTok(this.user_id, this.tiktok_username).subscribe({
        error: err => console.error('Erreur TikTok:', err)
      });
    }

    if (this.youtube_live_chat_id && this.youtube_video_id) {
      this.streamWatcher.startWatchingYouTube(
        this.user_id,
        this.youtube_live_chat_id,
        this.youtube_video_id
      ).subscribe({
        error: err => console.error('Erreur YouTube:', err)
      });
    }

    // Mise à jour des réseaux sociaux
    const socialsPayload: any = {};

    if (this.twitch_channel) socialsPayload.twitch_channel = this.twitch_channel;
    if (this.tiktok_username) socialsPayload.tiktok_username = this.tiktok_username;
    if (this.youtube_live_chat_id) socialsPayload.youtube_live_chat_id = this.youtube_live_chat_id;
    if (this.youtube_video_id) socialsPayload.youtube_video_id = this.youtube_video_id;

    this.streamWatcher.updateUserSocials(this.user_id, socialsPayload).subscribe({
      error: err => console.error('Erreur update socials:', err)
    });

    // Redirection immédiate
    this.router.navigate(['/tchat']);
  }
}
