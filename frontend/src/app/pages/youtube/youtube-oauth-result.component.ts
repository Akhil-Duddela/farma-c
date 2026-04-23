import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { YT_OAUTH_MSG, YoutubeOauthNotifyService } from '../../core/services/youtube-oauth-notify.service';

/**
 * YouTube browser OAuth lands here from the API redirect. If opened from
 * `window.open()` without `noopener`, `window.opener` is set: we postMessage
 * the main app, then close. If you opened this URL in the same tab, we fall
 * back to `notifySameTab` and navigate to the dashboard.
 */
@Component({
  selector: 'app-youtube-oauth-result',
  standalone: true,
  template: `
    <div class="wrap p-4">
      <p class="mb-0">{{ line }}</p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 40vh;
      }
      .wrap {
        color: #444;
        font-size: 0.95rem;
      }
    `,
  ],
})
export class YoutubeOauthResultComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bridge = inject(YoutubeOauthNotifyService);
  line = 'Finishing YouTube connection…';

  ngOnInit(): void {
    const p = this.route.snapshot.queryParamMap;
    const err = p.get('error');
    const ok = p.get('ok') === '1' || p.get('ok') === 'true';
    const opener = window.opener;
    const origin = window.location.origin;

    if (err) {
      this.line = 'YouTube: ' + err;
      this.finishError(err, opener, origin);
      return;
    }

    if (ok) {
      this.line = 'YouTube connected! Closing this window…';
      this.finishOk(opener, origin);
      return;
    }

    this.router.navigate(['/dashboard'], { replaceUrl: true });
  }

  private finishError(err: string, opener: typeof window.opener, origin: string): void {
    if (opener) {
      opener.postMessage(
        { type: YT_OAUTH_MSG, status: 'error' as const, reason: err },
        origin
      );
      setTimeout(() => {
        try {
          window.close();
        } catch {
          void this.router
            .navigate(['/dashboard'], { queryParams: { yt: 'error' }, replaceUrl: true })
            .then((navOk) => {
              if (navOk) this.bridge.notifySameTab({ status: 'error', reason: err });
            });
        }
      }, 200);
    } else {
      void this.router
        .navigate(['/dashboard'], { queryParams: { youtube: 'error' }, replaceUrl: true })
        .then((navOk) => {
          if (navOk) this.bridge.notifySameTab({ status: 'error', reason: err });
        });
    }
  }

  private finishOk(opener: typeof window.opener, origin: string): void {
    if (opener) {
      opener.postMessage({ type: YT_OAUTH_MSG, status: 'connected' as const }, origin);
      setTimeout(() => {
        try {
          window.close();
        } catch {
          this.line = 'You can return to the dashboard in the other tab.';
          void this.router
            .navigate(['/dashboard'], { queryParams: { yt: 'connected' }, replaceUrl: true })
            .then((navOk) => {
              if (navOk) this.bridge.notifySameTab({ status: 'connected' });
            });
        }
      }, 150);
    } else {
      void this.router
        .navigate(['/dashboard'], { queryParams: { yt: 'connected' }, replaceUrl: true })
        .then((navOk) => {
          if (navOk) this.bridge.notifySameTab({ status: 'connected' });
        });
    }
  }
}
