import { Component, OnInit, inject } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PostService, Post } from '../../core/services/post.service';
import { AnalyticsService } from '../../core/services/analytics.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, SlicePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly postsApi = inject(PostService);
  private readonly analytics = inject(AnalyticsService);

  posts: Post[] = [];
  summary: { totals?: { likes: number; reach: number; impressions: number } } = {};

  ngOnInit(): void {
    this.postsApi.list({ limit: '5' }).subscribe((p) => (this.posts = p));
    this.analytics.summary().subscribe((s) => (this.summary = s));
  }
}
