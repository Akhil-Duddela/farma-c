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
}

@Injectable({ providedIn: 'root' })
export class InstagramService {
  private readonly http = inject(HttpClient);

  list(): Observable<IgAccount[]> {
    return this.http.get<IgAccount[]>(`${environment.apiUrl}/instagram/accounts`);
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
}
