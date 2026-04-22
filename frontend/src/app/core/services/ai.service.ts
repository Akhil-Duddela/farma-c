import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EnhancedContentMeta {
  source?: string;
  degraded?: boolean;
  requestId?: string;
  reason?: string;
}

export interface EnhancedContent {
  title: string;
  description: string;
  script: string;
  caption: string;
  hashtags: string[];
  hooks: string[];
  videoIdea: string;
  _meta?: EnhancedContentMeta;
  requestId?: string;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly http = inject(HttpClient);

  /** POST /api/ai/enhance — Ollama-backed viral content pack */
  enhanceContent(input: string): Observable<EnhancedContent> {
    return this.http.post<EnhancedContent>(`${environment.apiUrl}/ai/enhance`, { input });
  }
}
