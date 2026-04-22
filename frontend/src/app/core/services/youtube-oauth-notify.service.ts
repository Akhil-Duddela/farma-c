import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** Must match the `type` field in postMessage from the OAuth return page. */
export const YT_OAUTH_MSG = 'farmc-youtube-oauth' as const;

export type YoutubeOauthResult = { status: 'connected' | 'error'; reason?: string };

@Injectable({ providedIn: 'root' })
export class YoutubeOauthNotifyService {
  private readonly results = new Subject<YoutubeOauthResult>();

  /** Fired when the YouTube popup posts back to this origin (or same-tab fallback). */
  readonly result$: Observable<YoutubeOauthResult> = this.results.asObservable();

  /** Same window as the app (no `window.opener`); run the same refresh as postMessage. */
  notifySameTab(r: YoutubeOauthResult): void {
    this.results.next(r);
  }

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; status?: string; reason?: string } | null;
      if (d?.type !== YT_OAUTH_MSG) return;
      if (d.status === 'connected' || d.status === 'error') {
        this.results.next({
          status: d.status,
          reason: d.reason,
        });
      }
    });
  }
}
