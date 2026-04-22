import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

const MSG_TYPE = 'farmc-youtube-oauth';

/**
 * YouTube browser OAuth lands here from the API redirect. If opened from
 * `window.open()`, we notify the opener, close this tab, and the main tab
 * can refresh YouTube state without a noisy `/dashboard?youtube=...` URL.
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
  line = 'Finishing YouTube connection…';

  ngOnInit(): void {
    const p = this.route.snapshot.queryParamMap;
    const err = p.get('error');
    const ok = p.get('ok') === '1' || p.get('ok') === 'true';
    const opener = window.opener;

    if (err) {
      this.line = 'YouTube: ' + err;
      if (opener) {
        opener.postMessage(
          { type: MSG_TYPE, status: 'error' as const, reason: err },
          window.location.origin
        );
        setTimeout(() => {
          try {
            window.close();
          } catch {
            this.router.navigate(['/dashboard'], { replaceUrl: true });
          }
        }, 200);
        return;
      }
      this.router.navigate(['/dashboard'], { queryParams: { youtube: 'error' }, replaceUrl: true });
      return;
    }

    if (ok) {
      this.line = 'YouTube connected! Closing this window…';
      if (opener) {
        opener.postMessage({ type: MSG_TYPE, status: 'connected' as const }, window.location.origin);
        setTimeout(() => {
          try {
            window.close();
          } catch {
            this.line = 'You can return to the dashboard in the other tab.';
            this.router.navigate(['/dashboard'], { replaceUrl: true });
          }
        }, 150);
        return;
      }
      this.router.navigate(['/dashboard'], { queryParams: { youtube: 'connected' }, replaceUrl: true });
      return;
    }

    this.router.navigate(['/dashboard'], { replaceUrl: true });
  }
}
