import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AnalyticsActivityDay {
  day: string;
  posted: number;
  failed: number;
}

export interface AnalyticsSummary {
  totals: { likes: number; reach: number; impressions: number };
  recent: Array<{ _id: string; caption?: string; postedAt?: string; analytics?: { likes?: number; reach?: number; impressions?: number; views?: number } }>;
  creator?: {
    totalPostAttempts: number;
    successfulPosts: number;
    failedPosts: number;
    engagementScore: number;
    aiUsageCount: number;
  };
  platforms?: { instagram: { posted: number; failed: number }; youtube: { posted: number; failed: number } };
  rates?: { successRatePercent: number };
  activity?: { weekly: AnalyticsActivityDay[]; windowDays: number };
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  summary(): Observable<AnalyticsSummary> {
    return this.http.get<AnalyticsSummary>(`${environment.apiUrl}/analytics/summary`);
  }

  syncPost(postId: string): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/analytics/sync/${postId}`, {});
  }
}
