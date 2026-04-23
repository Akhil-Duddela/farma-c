import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PostService, Post } from '../../core/services/post.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-post-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DatePipe],
  templateUrl: './post-list.component.html',
  styleUrl: './post-list.component.scss',
})
export class PostListComponent implements OnInit {
  private readonly api = inject(PostService);
  readonly auth = inject(AuthService);

  posts: Post[] = [];
  filter = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const params: Record<string, string> = { limit: '100' };
    if (this.filter) params['status'] = this.filter;
    this.api.list(params).subscribe((p) => (this.posts = p));
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
