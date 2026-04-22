import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Settings {
  timezone?: string;
  dailyAutoPostCount?: number;
  dailyAutoPostHourIST?: number;
  name?: string;
  email?: string;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  get(): Observable<Settings> {
    return this.http.get<Settings>(`${environment.apiUrl}/settings`);
  }

  update(body: Partial<Settings>): Observable<Settings> {
    return this.http.patch<Settings>(`${environment.apiUrl}/settings`, body);
  }
}
