import { CommonModule, DatePipe, DecimalPipe, SlicePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { AnalyticsService, AnalyticsSummary } from '../../core/services/analytics.service';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [DatePipe, SlicePipe, CommonModule, DecimalPipe],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  private readonly api = inject(AnalyticsService);

  data: AnalyticsSummary = { totals: { likes: 0, reach: 0, impressions: 0 }, recent: [] };
  err = '';
  maxWeekPosted = 1;
  maxWeekFailed = 1;

  ngOnInit(): void {
    this.api.summary().subscribe({
      next: (d) => {
        this.data = d;
        const w = d.activity?.weekly || [];
        for (const row of w) {
          this.maxWeekPosted = Math.max(this.maxWeekPosted, row.posted || 0, 1);
          this.maxWeekFailed = Math.max(this.maxWeekFailed, row.failed || 0, 1);
        }
      },
      error: () => (this.err = 'Failed to load analytics'),
    });
  }
}
