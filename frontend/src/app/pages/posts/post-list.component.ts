import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PostService, Post } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { CreatorBadgesComponent } from '../../components/creator-badges/creator-badges.component';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-post-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DatePipe, CreatorBadgesComponent],
  templateUrl: './post-list.component.html',
  styleUrl: './post-list.component.scss',
})
export class PostListComponent implements OnInit {
  private readonly api = inject(PostService);
  readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  posts: Post[] = [];
  filter = '';
  /** Post id while POST /retry is in flight */
  retryingId: string | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const params: Record<string, string> = { limit: '100' };
    if (this.filter) params['status'] = this.filter;
    this.api.list(params).subscribe((p) => (this.posts = p));
  }

  /** Failed or partial publish attempts worth surfacing (matches dashboard retry logic). */
  isFailedForUi(p: Post): boolean {
    if (p.status === 'failed' || p.status === 'partial' || p.pipelineStatus === 'failed' || p.pipelineStatus === 'partial') {
      return true;
    }
    const ig = p.platforms?.instagram;
    const yt = p.platforms?.youtube;
    return (ig?.enabled && ig?.status === 'failed') || (yt?.enabled && yt?.status === 'failed') || false;
  }

  get failedPosts(): Post[] {
    return this.posts.filter((p) => this.isFailedForUi(p));
  }

  errorSummary(p: Post): string {
    const parts: string[] = [];
    if (p.failureReason) parts.push(p.failureReason);
    if (p.automation?.lastError) parts.push(p.automation.lastError);
    if (p.platforms?.instagram?.error) parts.push(`Instagram: ${p.platforms.instagram.error}`);
    if (p.platforms?.youtube?.error) parts.push(`YouTube: ${p.platforms.youtube.error}`);
    return parts.filter(Boolean).join(' · ') || 'Publishing failed. Use Retry to try again.';
  }

  retry(p: Post): void {
    if (!this.auth.canUsePublishing()) {
      this.toast.showError('Complete account verification to retry posts.');
      return;
    }
    this.retryingId = p._id;
    this.api.retryPost(p._id).subscribe({
      next: () => {
        this.retryingId = null;
        this.toast.showError('Retry started. Check Dashboard for status.', 'info');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.retryingId = null;
        const err = e.error;
        if (err && typeof err === 'object' && err['code'] && err['error']) {
          this.toast.forApiCode(String(err['code']), String(err['error']));
        } else {
          this.toast.showError('Retry could not be started. Try again.');
        }
      },
    });
  }

  delete(id: string): void {
    if (!this.auth.canUsePublishing()) {
      alert('Complete account verification to delete posts.');
      return;
    }
    if (!confirm('Delete this post?')) return;
    this.api.delete(id).subscribe(() => this.load());
  }

  statusBadgeClass(p: Post): string {
    const m: Record<string, string> = {
      posted: 'text-bg-success',
      draft: 'text-bg-secondary',
      failed: 'text-bg-danger',
      scheduled: 'text-bg-warning text-dark',
      publishing: 'text-bg-info',
      partial: 'text-bg-warning',
    };
    return m[p.status] ?? 'text-bg-light text-dark';
  }
}
