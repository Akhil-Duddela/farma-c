import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LogService, ActivityLog } from '../../core/services/log.service';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
})
export class LogsComponent implements OnInit {
  private readonly logsApi = inject(LogService);

  logs: ActivityLog[] = [];

  ngOnInit(): void {
    this.logsApi.list(200).subscribe((l) => (this.logs = l));
  }
}
