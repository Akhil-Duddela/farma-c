import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface LeaderboardRow {
  id: string;
  name: string;
  email: string;
  profileImageUrl?: string;
  level: string;
  successRate: number;
  successfulPosts: number;
  failedPosts: number;
  engagementScore: number;
  totalPosts: number;
  badges: string[];
  rankScore: number;
  rank: number;
  isYou: boolean;
}

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly http = inject(HttpClient);

  getLeaderboard(limit = 30): Observable<{ items: LeaderboardRow[]; asOf: string }> {
    return this.http.get<{ items: LeaderboardRow[]; asOf: string }>(
      `${environment.apiUrl}/users/leaderboard`,
      { params: { limit: String(limit) } }
    );
  }
}
