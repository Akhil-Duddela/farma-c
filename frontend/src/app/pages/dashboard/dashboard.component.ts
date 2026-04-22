import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
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

  ngOnInit(): void {
    this.analytics.summary().subscribe((s) => (this.summary = s));
    const y = this.route.snapshot.queryParamMap.get('youtube');
    if (y) {
      this.bump();
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { youtube: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
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
