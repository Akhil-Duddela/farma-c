import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PostService, Post } from '../../core/services/post.service';

@Component({
  selector: 'app-post-list',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe],
  templateUrl: './post-list.component.html',
  styleUrl: './post-list.component.scss',
})
export class PostListComponent implements OnInit {
  private readonly api = inject(PostService);

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
    if (!confirm('Delete this post?')) return;
    this.api.delete(id).subscribe(() => this.load());
  }
}
