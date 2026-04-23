import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Recommendations {
  trending: { id: string; title: string; summary: string }[];
  suggestedCaptions: string[];
  suggestedHashtags: string[];
  bestPostingTime: {
    primaryLocal: string;
    secondaryLocal: string;
    days: string[];
    rationale: string;
  };
  asOf: string;
}

@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private readonly http = inject(HttpClient);

  get(): Observable<Recommendations> {
    return this.http.get<Recommendations>(`${environment.apiUrl}/ai/recommendations`);
  }
}
