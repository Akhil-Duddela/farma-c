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
}

@Injectable({ providedIn: 'root' })
export class YoutubeService {
  private readonly http = inject(HttpClient);

  list(): Observable<YoutubeAccount[]> {
    return this.http.get<YoutubeAccount[]>(`${environment.apiUrl}/youtube/accounts`);
  }

  getAuthUrl(): Observable<{ url: string; state: string; redirectUri: string }> {
    return this.http.get<{ url: string; state: string; redirectUri: string }>(
      `${environment.apiUrl}/youtube/auth-url`
    );
  }

  exchangeCode(code: string): Observable<YoutubeAccount> {
    return this.http.post<YoutubeAccount>(`${environment.apiUrl}/youtube/exchange`, { code });
  }

  setDefault(id: string): Observable<YoutubeAccount> {
    return this.http.patch<YoutubeAccount>(`${environment.apiUrl}/youtube/accounts/${id}/default`, {});
  }
}
