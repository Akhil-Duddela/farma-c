import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ActivityLog {
  _id: string;
  level: string;
  step: string;
  message: string;
  createdAt: string;
  postId?: string;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  private readonly http = inject(HttpClient);

  list(limit = 100): Observable<ActivityLog[]> {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<ActivityLog[]>(`${environment.apiUrl}/logs`, { params });
  }
}
