import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface IgAccount {
  _id: string;
  igUserId: string;
  username: string;
  label?: string;
  isDefault?: boolean;
  tokenExpiresAt?: string;
  profilePictureUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class InstagramService {
  private readonly http = inject(HttpClient);

  list(): Observable<IgAccount[]> {
    return this.http.get<IgAccount[]>(`${environment.apiUrl}/instagram/accounts`);
  }

  getAuthUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${environment.apiUrl}/instagram/auth-url`);
  }

  getOAuthPending(key: string): Observable<{
    pickKey: string;
    accounts: { accountId: string; pageId: string; username: string; profilePicture: string }[];
  }> {
    return this.http.get<{
      pickKey: string;
      accounts: { accountId: string; pageId: string; username: string; profilePicture: string }[];
    }>(`${environment.apiUrl}/instagram/oauth-pending`, { params: { key } });
  }

  selectAccount(pickKey: string, accountId: string) {
    return this.http.post<{ ok: boolean; id: string; username: string; igUserId: string }>(
      `${environment.apiUrl}/instagram/select-account`,
      { pickKey, accountId }
    );
  }

  refreshTokens() {
    return this.http.post<{ ok: boolean; total: number }>(`${environment.apiUrl}/instagram/refresh-tokens`, {});
  }

  link(body: {
    igUserId: string;
    accessToken?: string;
    shortLivedToken?: string;
    pageId?: string;
    username?: string;
  }): Observable<IgAccount> {
    return this.http.post<IgAccount>(`${environment.apiUrl}/instagram/link`, body);
  }

  setDefault(id: string): Observable<IgAccount> {
    return this.http.patch<IgAccount>(`${environment.apiUrl}/instagram/accounts/${id}/default`, {});
  }

  disconnect(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${environment.apiUrl}/instagram/accounts/${id}`);
  }
}
