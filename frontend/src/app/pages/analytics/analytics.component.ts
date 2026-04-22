import { Component, OnInit, inject } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { AnalyticsService } from '../../core/services/analytics.service';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [DatePipe, SlicePipe],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  private readonly api = inject(AnalyticsService);

  data: {
    totals?: { likes: number; reach: number; impressions: number };
    recent?: Array<{ _id: string; caption?: string; postedAt?: string }>;
  } = {};

  ngOnInit(): void {
    this.api.summary().subscribe((d) => (this.data = d));
  }
}
