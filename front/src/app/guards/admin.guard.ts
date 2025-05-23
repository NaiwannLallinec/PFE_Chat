// admin.guard.ts
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(): boolean {
    const token = localStorage.getItem('token');
    if (!token) {
      this.router.navigate(['/login']);
      return false;
    }

    try {
      const decoded: any = jwtDecode(token);
      if (decoded.is_viewer === false) {
        return true;
      }
    } catch (err) {
      console.error('Token decoding failed', err);
    }

    this.router.navigate(['/home-viewer']);
    return false;
  }

  isStreamer(): boolean {
  const token = localStorage.getItem('token');
  if (!token) return false;

  try {
    const decoded: any = jwtDecode(token);
    return decoded.is_viewer === false;
  } catch (err) {
    console.error('Token decoding failed', err);
    return false;
  }
}
}
