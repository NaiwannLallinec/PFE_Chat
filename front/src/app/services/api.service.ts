import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


export interface User {
  id: number;
  username: string;
  twitch_channel?: string;
  youtube_live_chat_id?: string;
  youtube_video_id?: string;
  tiktok_username?: string;
  is_viewer ?: boolean;
}

@Injectable({
  providedIn: 'root'
})

export class ApiService {

  private baseUrl = 'http://localhost:8000/users/streamers'; // adapte selon ton backend

  constructor(private http: HttpClient) {}

  getStreamers(): Observable<User[]> {
    return this.http.get<User[]>(this.baseUrl);
  }

}
