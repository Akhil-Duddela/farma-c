import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeaderboardService, LeaderboardRow } from '../../core/services/leaderboard.service';
import { creatorLevelLabel } from '../../core/badge-labels';
import { CreatorBadgesComponent } from '../../components/creator-badges/creator-badges.component';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, CreatorBadgesComponent],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
})
export class LeaderboardComponent implements OnInit {
  private readonly api = inject(LeaderboardService);

  items: LeaderboardRow[] = [];
  asOf = '';
  error = '';
  loading = true;

  level = creatorLevelLabel;

  ngOnInit(): void {
    this.api.getLeaderboard(50).subscribe({
      next: (r) => {
        this.items = r.items;
        this.asOf = r.asOf;
        this.loading = false;
      },
      error: () => {
        this.error = 'Could not load leaderboard';
        this.loading = false;
      },
    });
  }
}
