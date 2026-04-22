import { Component, Input, inject, output, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, DatePipe, SlicePipe } from '@angular/common';
import { PostService, Post, PlatformState } from '../../core/services/post.service';

type PlSym = 'ok' | 'bad' | 'wait' | 'skip';

@Component({
  selector: 'app-post-status-table',
  standalone: true,
  imports: [CommonModule, DatePipe, SlicePipe],
  templateUrl: './post-status-table.component.html',
  styleUrl: './post-status-table.component.scss',
})
export class PostStatusTableComponent implements OnInit, OnDestroy, OnChanges {
  private readonly posts = inject(PostService);

  @Input() refresh = 0;
  @Input() mode: 'table' | 'cards' = 'table';
  @Input() showVideos = true;

  postsList: Post[] = [];
  retrying: Record<string, boolean> = {};
  /** Emitted to parent to refresh other widgets */
  readonly dataChanged = output<void>();

  private handle?: number;

  ngOnInit(): void {
    this.load();
    this.handle = window.setInterval(
      () => {
        if (this.postsList.some((p) => p.status === 'scheduled' || p.status === 'publishing')) {
          this.load();
        }
      },
      8000
    );
  }

  ngOnDestroy(): void {
    if (this.handle) {
      clearInterval(this.handle);
    }
  }

  load(): void {
    this.posts
      .list({ limit: '100' })
      .subscribe((list) => (this.postsList = list));
  }

  videoPosts(): Post[] {
    return this.postsList.filter((p) => this.isVideo(p) && (this.thumb(p) || p.mediaUrl));
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['refresh'] && this.refresh > 0) {
      this.load();
    }
  }

  pl(st?: PlatformState): PlSym {
    if (!st || !st.enabled) return 'skip';
    if (st.status === 'posted') return 'ok';
    if (st.status === 'failed') return 'bad';
    if (st.status === 'skipped') return 'skip';
    return 'wait';
  }

  plIcon(s: PlSym): string {
    if (s === 'ok') return '✅';
    if (s === 'bad') return '❌';
    if (s === 'skip') return '—';
    return '⏳';
  }

  /** Colored pill: green=success, red=failed, yellow=scheduled, blue=publishing */
  statusBadgeClass(s: string): string {
    switch (s) {
      case 'posted':
        return 'badge text-bg-success';
      case 'failed':
        return 'badge text-bg-danger';
      case 'draft':
        return 'badge text-bg-secondary';
      case 'scheduled':
        return 'badge text-bg-warning text-dark';
      case 'publishing':
        return 'badge text-bg-info';
      case 'partial':
        return 'badge text-bg-primary';
      default:
        return 'badge text-bg-light text-dark';
    }
  }

  thumb(p: Post): string {
    return p.mediaUrl || p.mediaUrls?.[0] || '';
  }

  isVideo(p: Post): boolean {
    return p.mediaType === 'video' || p.mediaType === 'reel';
  }

  missedSchedule(p: Post): boolean {
    if (p.status !== 'scheduled' || !p.scheduledAt) {
      return false;
    }
    return new Date(p.scheduledAt).getTime() < Date.now();
  }

  anyPlatformError(p: Post): string {
    const a = p.platforms?.instagram?.error || '';
    const b = p.platforms?.youtube?.error || '';
    return a || b || p.failureReason || '';
  }

  canRetry(p: Post): boolean {
    const igF = p.platforms?.instagram?.status === 'failed' && p.platforms?.instagram?.enabled;
    const ytF = p.platforms?.youtube?.status === 'failed' && p.platforms?.youtube?.enabled;
    return !!(igF || ytF) || p.status === 'failed' || p.status === 'partial';
  }

  retry(id: string | undefined, ev: Event): void {
    ev.stopPropagation();
    if (!id) {
      return;
    }
    this.retrying[id] = true;
    this.posts.retryPost(id, {}).subscribe({
      next: () => {
        this.retrying[id] = false;
        this.load();
        this.dataChanged.emit();
      },
      error: () => {
        this.retrying[id] = false;
      },
    });
  }
}
