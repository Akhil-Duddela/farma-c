import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PlatformState {
  enabled: boolean;
  status: string;
  error: string;
  jobId: string;
  publishedAt: string | null;
  externalId: string;
}

export interface Post {
  _id: string;
  userId?: string;
  content?: string;
  caption: string;
  hashtags: string[];
  reelScript?: { hook: string; body: string; cta: string };
  mediaUrl: string;
  mediaUrls: string[];
  mediaType: string;
  aspectRatio: string;
  status: string;
  scheduledAt?: string | null;
  postedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  failureReason?: string;
  /** populated or id */
  instagramAccountId?: { _id: string; username?: string; label?: string; igUserId?: string } | string;
  youtubeAccountId?: { _id: string; channelTitle?: string; channelId?: string } | string;
  contentHash?: string;
  platforms?: { instagram: PlatformState; youtube: PlatformState };
  analytics?: { likes: number; reach: number; impressions: number; lastSyncedAt?: string | null };
  /** Full AI → video → publish pipeline */
  pipelineStatus?:
    | 'idle'
    | 'processing'
    | 'ai_done'
    | 'video_done'
    | 'uploaded'
    | 'publishing'
    | 'published'
    | 'completed'
    | 'failed'
    | 'partial';
  errorHistory?: { at?: string; step?: string; message?: string; requestId?: string }[];
  videoUrl?: string;
  aiContent?: {
    title?: string;
    description?: string;
    script?: string;
    caption?: string;
    hashtags?: string[];
    videoIdea?: string;
    rawInput?: string;
  };
  automation?: {
    step: string;
    lastError?: string;
    startedAt?: string | null;
    completedAt?: string | null;
  };
}

export interface CreatePostV2Body {
  content: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'reel' | 'carousel';
  aspectRatio?: '1:1' | '4:5' | '9:16';
  platforms: { instagram: boolean; youtube: boolean };
  hashtags?: string[];
  instagramAccountId?: string;
  youtubeAccountId?: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'posted' | 'failed' | 'partial';
  scheduledAt?: string;
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

  /** V2: Instagram + YouTube */
  createPostV2(body: CreatePostV2Body): Observable<Post> {
    return this.http.post<Post>(`${environment.apiUrl}/posts/create`, body);
  }

  create(body: unknown): Observable<Post> {
    return this.http.post<Post>(`${environment.apiUrl}/posts`, body as object);
  }

  update(id: string, body: Partial<Post>): Observable<Post> {
    return this.http.patch<Post>(`${environment.apiUrl}/posts/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/posts/${id}`);
  }

  retryPost(id: string, body?: { platforms?: string[] }): Observable<Post> {
    return this.http.post<Post>(`${environment.apiUrl}/posts/${id}/retry`, body ?? {});
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

  getPostErrors(id: string): Observable<PostErrorsPayload> {
    return this.http.get<PostErrorsPayload>(`${environment.apiUrl}/posts/${id}/errors`);
  }
}

export interface PostErrorsPayload {
  postId: string;
  status: string;
  failureReason: string;
  pipelineStatus?: string;
  lastJobId: string;
  jobs: { platform: string; error: string }[];
  history: { at?: string; step?: string; message?: string; requestId?: string }[];
  automation: { lastError?: string; step?: string };
}
