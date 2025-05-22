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
  user_id = '1';

  constructor(
    private streamWatcher: StreamWatcherService,
    private router: Router // 👈 Injection du Router
  ) {}

  startTwitch() {
    return this.streamWatcher.startWatchingTwitch(this.user_id, this.twitch_channel);
  }

  startTikTok() {
    return this.streamWatcher.startWatchingTikTok(this.user_id, this.tiktok_username);
  }

  startYouTube() {
    return this.streamWatcher.startWatchingYouTube(this.user_id, this.youtube_live_chat_id, this.youtube_video_id);
  }

  submitForm() {
    const observables = [];

    if (this.twitch_channel) {
      observables.push(this.startTwitch());
    }

    if (this.tiktok_username) {
      observables.push(this.startTikTok());
    }

    if (this.youtube_live_chat_id && this.youtube_video_id) {
      observables.push(this.startYouTube());
    }

    if (observables.length > 0) {
      Promise.all(observables.map(obs => obs.toPromise()))
        .then(() => this.router.navigate(['/tchat']))
        .catch(err => console.error('Erreur pendant la configuration :', err));
    } else {
      this.router.navigate(['/tchat']); 
    }
  }
}
