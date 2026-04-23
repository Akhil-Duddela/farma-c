import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AccountsStatus {
  instagram: {
    connected: boolean;
    username: string | null;
    profilePicture: string | null;
    accountId: string | null;
    igUserId: string | null;
  };
  youtube: {
    connected: boolean;
    channelName: string | null;
    thumbnail: string | null;
    accountId: string | null;
    channelId: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);

  getStatus(): Observable<AccountsStatus> {
    return this.http.get<AccountsStatus>(`${environment.apiUrl}/accounts/status`);
  }
}
