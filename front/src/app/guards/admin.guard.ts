import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AdminGuard implements CanActivate {
  constructor(private http: HttpClient, private router: Router) {}

  canActivate(): Observable<boolean> {
    const userId = sessionStorage.getItem('user_id');
    if (!userId) {
      this.router.navigate(['/login']);
      return of(false);
    }

    return this.http.get<any>(`http://localhost:8000/users/${userId}`).pipe(
      map(user => {
        if (user && user.is_viewer === false) {
          return true;
        } else {
          this.router.navigate(['/home-viewer']);
          return false;
        }
      }),
      catchError(err => {
        console.error('Erreur accès admin:', err);
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }

  /** Méthode utilitaire si besoin en composant pour afficher / cacher un bouton */
  isStreamer(): Observable<boolean> {
    const userId = sessionStorage.getItem('user_id');
    if (!userId) return of(false);

    return this.http.get<any>(`http://localhost:8000/users/${userId}`).pipe(
      map(user => user && user.is_viewer === false),
      catchError(() => of(false))
    );
  }
}
