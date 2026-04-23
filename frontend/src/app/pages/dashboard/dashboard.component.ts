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
import { CommonModule } from '@angular/common';

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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  refreshTick = 0;
  summary: { totals?: { likes: number; reach: number; impressions: number } } = {};
  /** OAuth return toasts */
  accountToast: { kind: 'success' | 'danger'; text: string } | null = null;

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

  private handleAccountQueryParams(q: ParamMap): void {
    const ig = q.get('ig');
    const yt = q.get('yt');
    const legacyY = q.get('youtube');
    const reason = q.get('reason') || '';

    if (!ig && !yt && !legacyY && !reason) {
      return;
    }

    if (ig === 'error') {
      this.accountToast = { kind: 'danger', text: `Instagram: ${reason || 'connection failed'}` };
    } else if (yt === 'error' || legacyY === 'error') {
      this.accountToast = { kind: 'danger', text: `YouTube: ${reason || 'connection failed'}` };
    } else {
      const ok: string[] = [];
      if (ig === 'connected') ok.push('Instagram');
      if (yt === 'connected' || legacyY === 'connected') ok.push('YouTube');
      if (ok.length) {
        this.accountToast = {
          kind: 'success',
          text: `${ok.join(' and ')} connected successfully.`,
        };
        this.bump();
      }
    }

    if (ig || yt || legacyY || reason) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { ig: null, yt: null, youtube: null, reason: null },
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
