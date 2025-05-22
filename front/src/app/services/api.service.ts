import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  user_id: number;
}

export interface UserRead {
  user_id: number;
  username: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  streamer: boolean;     
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = "http://localhost:8000/api"

  constructor(private http: HttpClient) {}

  login(payload: LoginPayload): Observable<TokenResponse> {
    const body = new HttpParams()
      .set('username', payload.username)
      .set('password', payload.password);

    return this.http.post<TokenResponse>(
      `${this.baseUrl}/login`,
      body.toString(),
      { headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) }
    );
  }

  register(payload: RegisterPayload): Observable<UserRead> {
    return this.http.post<UserRead>(`${this.baseUrl}/register`, payload);
  }
}