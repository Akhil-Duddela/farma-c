import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * Preserves server OAuth query params; forwards to the dashboard (same as legacy /dashboard?ig=...).
 * Used for Universal Links: https://&lt;FRONTEND&gt;/oauth?ig=…
 */
@Component({
  selector: 'app-oauth-redirect',
  standalone: true,
  imports: [CommonModule],
  template: '<p class="muted">Finishing sign-in to your app…</p>',
  styleUrl: './oauth-redirect.component.scss',
})
export class OauthRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    const q = { ...this.route.snapshot.queryParams };
    // Same behaviour as before when landing on /dashboard?ig=…&yt=…
    this.router
      .navigate(['/dashboard'], {
        queryParams: q,
        replaceUrl: true,
      })
      .catch(() => {
        this.router.navigate(['/login'], { queryParams: { returnUrl: '/dashboard' } }).catch(() => {
          // ignore
        });
      });
  }
}
