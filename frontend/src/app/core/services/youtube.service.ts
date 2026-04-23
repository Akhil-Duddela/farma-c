import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface YoutubeAccount {
  _id: string;
  channelId: string;
  channelTitle: string;
  isDefault?: boolean;
  tokenExpiresAt?: string;
  thumbnailUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class YoutubeService {
  private readonly http = inject(HttpClient);

  list(): Observable<YoutubeAccount[]> {
    return this.http.get<YoutubeAccount[]>(`${environment.apiUrl}/youtube/accounts`);
  }

  getAuthUrl(): Observable<{ url: string; redirectUri: string }> {
    return this.http.get<{ url: string; redirectUri: string }>(`${environment.apiUrl}/youtube/auth-url`);
  }

  getOAuthPending(key: string): Observable<{
    pickKey: string;
    channels: { channelId: string; title: string; thumb: string }[];
  }> {
    return this.http.get<{
      pickKey: string;
      channels: { channelId: string; title: string; thumb: string }[];
    }>(`${environment.apiUrl}/youtube/oauth-pending`, { params: { key } });
  }

  selectChannel(pickKey: string, channelId: string) {
    return this.http.post<{ ok: boolean; id: string; channelId: string; channelTitle: string }>(
      `${environment.apiUrl}/youtube/select-channel`,
      { pickKey, channelId }
    );
  }

  refreshTokens() {
    return this.http.post<{ ok: boolean; total: number }>(`${environment.apiUrl}/youtube/refresh-tokens`, {});
  }

  exchangeCode(code: string): Observable<YoutubeAccount> {
    return this.http.post<YoutubeAccount>(`${environment.apiUrl}/youtube/exchange`, { code });
  }

  setDefault(id: string): Observable<YoutubeAccount> {
    return this.http.patch<YoutubeAccount>(`${environment.apiUrl}/youtube/accounts/${id}/default`, {});
  }

  disconnect(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${environment.apiUrl}/youtube/accounts/${id}`);
  }
}
