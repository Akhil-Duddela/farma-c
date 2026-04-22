import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Post {
  _id: string;
  caption: string;
  hashtags: string[];
  reelScript?: { hook: string; body: string; cta: string };
  mediaUrls: string[];
  mediaType: string;
  aspectRatio: string;
  status: string;
  scheduledAt?: string;
  postedAt?: string;
  failureReason?: string;
  instagramAccountId: unknown;
  contentHash?: string;
  analytics?: { likes: number; reach: number; impressions: number };
}

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly http = inject(HttpClient);

  get(id: string): Observable<Post> {
    return this.http.get<Post>(`${environment.apiUrl}/posts/${id}`);
  }

  list(params?: Record<string, string>): Observable<Post[]> {
    let hp = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v) hp = hp.set(k, v);
      });
    }
    return this.http.get<Post[]>(`${environment.apiUrl}/posts`, { params: hp });
  }

  create(body: Partial<Post> & { instagramAccountId: string }): Observable<Post> {
    return this.http.post<Post>(`${environment.apiUrl}/posts`, body);
  }

  update(id: string, body: Partial<Post>): Observable<Post> {
    return this.http.patch<Post>(`${environment.apiUrl}/posts/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/posts/${id}`);
  }

  bulk(posts: unknown[]): Observable<Post[]> {
    return this.http.post<Post[]>(`${environment.apiUrl}/posts/bulk`, { posts });
  }

  generateAi(body: { topic?: string }): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/posts/generate-ai`, body);
  }

  generateMedia(body: { prompt?: string; aspectRatio?: string; postId?: string }): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${environment.apiUrl}/posts/generate-media`, body);
  }

  improveCaption(caption: string, feedback?: string): Observable<{ caption: string }> {
    return this.http.post<{ caption: string }>(`${environment.apiUrl}/posts/improve-caption`, {
      caption,
      feedback,
    });
  }

  trendingTags(): Observable<{ tags: string[] }> {
    return this.http.get<{ tags: string[] }>(`${environment.apiUrl}/posts/trending-tags`);
  }
}
