import { Component, OnInit, OnChanges, SimpleChanges, inject, Input, output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LogService, ActivityLog } from '../../core/services/log.service';

@Component({
  selector: 'app-logs-error-panel',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './logs-error-panel.component.html',
  styleUrl: './logs-error-panel.component.scss',
})
export class LogsErrorPanelComponent implements OnInit, OnChanges {
  private readonly logs = inject(LogService);

  @Input() refresh = 0;
  readonly retryId = output<string>();

  items: ActivityLog[] = [];

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['refresh'] && this.refresh > 0) {
      this.load();
    }
  }

  load(): void {
    this.logs.list(80).subscribe((rows) => {
      this.items = rows;
      for (const r of rows) {
        if (r.message?.toLowerCase().includes('expired') || r.message?.toLowerCase().includes('token')) {
          /* for UI */
        }
      }
    });
  }

  isErrorLog(l: ActivityLog): boolean {
    return (l.level || '').toLowerCase() === 'error' || (l.message || '').toLowerCase().includes('fail');
  }

  isTokenIssue(l: ActivityLog): boolean {
    const m = (l.message || '').toLowerCase();
    return m.includes('token') && (m.includes('expir') || m.includes('auth') || m.includes('invalid'));
  }

  retryByPostId(postId: string | undefined): void {
    if (postId) {
      this.retryId.emit(postId);
    }
  }
}
