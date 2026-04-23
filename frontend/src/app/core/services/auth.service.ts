import { Injectable, inject, signal, computed } from '@angular/core';
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
  dailyAutoPostCount?: number;
  dailyAutoPostHourIST?: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  phoneNumberMasked?: string;
  profileImageUrl?: string;
  verificationStatus?: 'unverified' | 'pending' | 'auto_verified' | 'verified' | 'rejected';
  verificationScore?: number;
  verificationNotes?: string;
  canUsePublishing?: boolean;
  hasVerifiedCreatorBadge?: boolean;
  /** Platform gamification (server-maintained) */
  badges?: string[];
  riskScore?: number;
  flagged?: boolean;
  creatorLevel?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenKey = 'farmc_token';

  /** Refreshed from /auth/me */
  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  readonly canUsePublishing = computed(() => this._user()?.canUsePublishing === true);
  /** Same gating as publishing — full email + phone + profile trust (verified or auto_verified) */
  readonly showVerifiedCreatorBadge = computed(
    () => this._user()?.hasVerifiedCreatorBadge === true || this._user()?.canUsePublishing === true
  );

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  setUserFromResponse(u: User | null): void {
    this._user.set(u);
  }

  refreshUser(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(
      tap((u) => this._user.set(u))
    );
  }

  login(email: string, password: string): Observable<{ token: string; user: User }> {
    return this.http
      .post<{ token: string; user: User }>(`${environment.apiUrl}/auth/login`, {
        email: email.trim(),
        password,
      })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.tokenKey, res.token);
          this._user.set(res.user);
        })
      );
  }

  register(body: { email: string; password: string; name?: string }): Observable<{
    id: string;
    email: string;
    name: string;
    role: string;
    message?: string;
  }> {
    return this.http.post<{
      id: string;
      email: string;
      name: string;
      role: string;
      message?: string;
    }>(`${environment.apiUrl}/auth/register`, body);
  }

  me(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(tap((u) => this._user.set(u)));
  }

  resendVerificationEmail(): Observable<{ ok: boolean; sent: boolean; mockUrl?: string }> {
    return this.http.post<{ ok: boolean; sent: boolean; mockUrl?: string }>(
      `${environment.apiUrl}/auth/resend-verification`,
      {}
    );
  }

  sendOtp(phoneNumber: string): Observable<{
    ok: boolean;
    sent: boolean;
    phoneMasked: string;
    expiresIn: number;
  }> {
    return this.http.post<{
      ok: boolean;
      sent: boolean;
      phoneMasked: string;
      expiresIn: number;
    }>(`${environment.apiUrl}/auth/send-otp`, { phoneNumber });
  }

  verifyOtp(phoneNumber: string, otp: string): Observable<{ ok: boolean; user: User }> {
    return this.http.post<{ ok: boolean; user: User }>(`${environment.apiUrl}/auth/verify-otp`, {
      phoneNumber,
      otp,
    });
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this._user.set(null);
    this.router.navigateByUrl('/login');
  }
}
