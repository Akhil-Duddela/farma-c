import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { CreatePostCardComponent } from './create-post-card.component';
import { PostStatusTableComponent } from './post-status-table.component';
import { AccountsCardComponent } from './accounts-card.component';
import { LogsErrorPanelComponent } from './logs-error-panel.component';
import { AutomationPipelineComponent } from './automation-pipeline.component';
import { PostService } from '../../core/services/post.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { AuthService } from '../../core/services/auth.service';
import { CommonModule } from '@angular/common';

function mapOauthReason(raw: string | null | undefined): string {
  if (!raw) {
    return 'Connection failed';
  }
  const m: Record<string, string> = {
    access_denied: 'You cancelled login',
    invalid_scope: 'Permission issue',
    no_business_account: 'No Instagram Business account found — use Business/Creator and link a Facebook Page',
    no_youtube_channel: 'This Google account has no YouTube channel',
    invalid_state: 'Session expired — try connecting again',
    invalid_selection: 'Selection expired — start connect again',
    account_pick_required: 'Choose an account in the dialog',
    missing_params: 'Invalid return from provider — try again',
    oauth_failed: 'Connection failed — try again or check app settings',
    auth_failed: 'Connection failed',
  };
  if (m[raw]) {
    return m[raw]!;
  }
  // Humanize unknown slugs
  if (/^[a-z0-9_]+$/i.test(raw)) {
    return raw
      .replace(/_/g, ' ')
      .replace(/no business account/gi, 'no Instagram business account');
  }
  return raw;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    CreatePostCardComponent,
    PostStatusTableComponent,
    AccountsCardComponent,
    LogsErrorPanelComponent,
    AutomationPipelineComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly posts = inject(PostService);
  private readonly analytics = inject(AnalyticsService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  refreshTick = 0;
  summary: { totals?: { likes: number; reach: number; impressions: number } } = {};
  /** OAuth return toasts */
  accountToast: { kind: 'success' | 'danger'; text: string } | null = null;

  /** Picker from OAuth (before query cleared) */
  igPickKey: string | null = null;
  ytPickKey: string | null = null;

  ngOnInit(): void {
    this.analytics.summary().subscribe((s) => (this.summary = s));
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      this.handleAccountQueryParams(q);
    });
    this.route.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((frag) => {
        if (frag === 'create-post') {
          setTimeout(() => {
            document.getElementById('create-post')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 0);
        }
      });
  }

  dismissAccountToast(): void {
    this.accountToast = null;
  }

  onPickerCleared(which: 'ig' | 'yt'): void {
    if (which === 'ig') {
      this.igPickKey = null;
    }
    if (which === 'yt') {
      this.ytPickKey = null;
    }
  }

  onChildToast(t: { kind: 'success' | 'danger'; text: string }): void {
    this.accountToast = t;
  }

  private handleAccountQueryParams(q: ParamMap): void {
    const ig = q.get('ig');
    const yt = q.get('yt');
    const legacyY = q.get('youtube');
    const reason = q.get('reason') || '';
    const key = q.get('key') || '';

    if (ig === 'choose' && key) {
      this.igPickKey = key;
    }
    if (yt === 'choose' && key) {
      this.ytPickKey = key;
    }

    if (ig === 'error') {
      this.accountToast = { kind: 'danger', text: `Instagram: ${mapOauthReason(reason || null)}` };
      this.bump();
    } else if (yt === 'error' || legacyY === 'error') {
      this.accountToast = { kind: 'danger', text: `YouTube: ${mapOauthReason(reason || null)}` };
      this.bump();
    } else {
      if (ig === 'connected' && (yt as string | null) === 'connected') {
        this.accountToast = { kind: 'success', text: 'Instagram and YouTube connected successfully.' };
        this.bump();
      } else if (ig === 'connected') {
        this.accountToast = { kind: 'success', text: 'Instagram connected successfully' };
        this.bump();
      } else if (yt === 'connected' || legacyY === 'connected') {
        this.accountToast = { kind: 'success', text: 'YouTube connected successfully' };
        this.bump();
      }
    }

    if (ig || yt || legacyY || reason || key) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ig: null, yt: null, youtube: null, reason: null, key: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  onPostCreated(): void {
    this.bump();
  }

  onAccountsChange(): void {
    this.bump();
  }

  onPostDataChanged(): void {
    this.bump();
  }

  onLogRetryRequest(postId: string): void {
    this.posts.retryPost(postId, {}).subscribe({
      next: () => this.bump(),
      error: () => this.bump(),
    });
  }

  private bump(): void {
    this.refreshTick++;
  }
}
