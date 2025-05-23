import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AdminGuard } from '../../guards/admin.guard';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  
  constructor(private router: Router, private adminGuard: AdminGuard) {}

  get isStreamer(): boolean {
    return this.adminGuard.isStreamer();
  }

  goHome() {
    this.router.navigate(['/home-viewer']);
  }

  goProfile() {
    this.router.navigate(['/setup-streamer']);
  }

  logout() {
    localStorage.removeItem('token');
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }
}