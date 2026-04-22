import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  timezone?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenKey = 'farmc_token';

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  login(email: string, password: string): Observable<{ token: string; user: User }> {
    return this.http
      .post<{ token: string; user: User }>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((res) => localStorage.setItem(this.tokenKey, res.token)));
  }

  register(body: { email: string; password: string; name?: string }): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/auth/register`, body);
  }

  me(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`);
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.router.navigateByUrl('/login');
  }
}
