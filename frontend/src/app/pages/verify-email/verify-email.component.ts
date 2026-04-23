import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss',
})
export class VerifyEmailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  state: 'loading' | 'ok' | 'err' = 'loading';
  errReason = '';
  errMessage = '';

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((q) => {
      const result = q.get('result');
      if (result === 'ok') {
        this.state = 'ok';
        return;
      }
      if (result === 'error') {
        this.state = 'err';
        this.errReason = q.get('reason') || 'error';
        this.errMessage = this.mapReason(this.errReason);
        return;
      }
      const token = q.get('token');
      if (token) {
        this.callApi(token);
        return;
      }
      this.state = 'err';
      this.errMessage = 'Missing link. Open the full link from your email.';
    });
  }

  private callApi(token: string): void {
    this.state = 'loading';
    this.http
      .get<{ ok: boolean; message?: string }>(`${environment.apiUrl}/auth/verify-email`, {
        params: { token, json: '1' },
      })
      .subscribe({
        next: () => {
          this.state = 'ok';
        },
        error: (e) => {
          this.state = 'err';
          this.errMessage = e.error?.error || e.error?.message || e.message || 'Verification failed';
        },
      });
  }

  private mapReason(r: string): string {
    const m: Record<string, string> = {
      invalid_token: 'This link is invalid or already used.',
      expired_token: 'This link has expired. Request a new one from the app.',
      error: 'Verification could not be completed.',
    };
    return m[r] || r;
  }
}
