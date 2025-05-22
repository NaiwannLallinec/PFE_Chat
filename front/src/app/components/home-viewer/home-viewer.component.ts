import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, User } from '../../services/api.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // 👈 AJOUT

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

  constructor(private userService: ApiService, private router: Router) { }

  ngOnInit(): void {
    this.userService.getStreamers().subscribe(data => {
      this.streamers = data.sort((a, b) =>
        a.username.localeCompare(b.username)
      );
    });
  }


  filteredStreamers(): User[] {
    if (!this.searchTerm.trim()) return this.streamers;
    return this.streamers.filter(s =>
      s.username.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  goToChat(streamer: User): void {
    this.router.navigate(['/chat']);
  }
}
