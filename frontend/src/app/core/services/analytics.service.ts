import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  summary(): Observable<{
    totals: { likes: number; reach: number; impressions: number };
    recent: Array<{ _id: string; caption?: string; postedAt?: string }>;
  }> {
    return this.http.get<{
      totals: { likes: number; reach: number; impressions: number };
      recent: Array<{ _id: string; caption?: string; postedAt?: string }>;
    }>(`${environment.apiUrl}/analytics/summary`);
  }

  syncPost(postId: string): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/analytics/sync/${postId}`, {});
  }
}
