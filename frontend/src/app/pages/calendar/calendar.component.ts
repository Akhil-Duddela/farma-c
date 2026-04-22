import { Component, OnInit, inject } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PostService, Post } from '../../core/services/post.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [DatePipe, SlicePipe, RouterLink],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent implements OnInit {
  private readonly postsApi = inject(PostService);

  /** Posts with scheduledAt, grouped by day key */
  grouped: Record<string, Post[]> = {};

  ngOnInit(): void {
    this.postsApi.list({ status: 'scheduled', limit: '200' }).subscribe((posts) => {
      this.grouped = {};
      for (const p of posts) {
        if (!p.scheduledAt) continue;
        const d = new Date(p.scheduledAt);
        const key = d.toISOString().slice(0, 10);
        if (!this.grouped[key]) this.grouped[key] = [];
        this.grouped[key].push(p);
      }
    });
  }

  keys(): string[] {
    return Object.keys(this.grouped).sort();
  }
}
