import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-setup-streamer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './setup-streamer.component.html',
  styleUrls: ['./setup-streamer.component.css']
})
export class SetupStreamerComponent {
  twitch_channel = '';
  youtube_live_chat_id = '';
  youtube_video_id = '';
  tiktok_username = '';
}
