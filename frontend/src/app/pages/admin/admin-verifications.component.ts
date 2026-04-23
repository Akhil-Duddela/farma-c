import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService, AdminVerificationUser } from '../../core/services/admin.service';
@Component({
  selector: 'app-admin-verifications',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule],
  templateUrl: './admin-verifications.component.html',
  styleUrl: './admin-verifications.component.scss',
})
export class AdminVerificationsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder);

  statusFilter: 'queue' | 'pending' | 'auto_verified' | 'rejected' = 'queue';
  items: AdminVerificationUser[] = [];
  total = 0;
  page = 1;
  busy = false;
  error = '';

  /** Per-row reject (optional inline) */
  rejectFor = signal<string | null>(null);
  rejectForm = this.fb.group({ reason: ['', [Validators.required, Validators.maxLength(2000)]] });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error = '';
    this.busy = true;
    this.admin.listVerifications(this.statusFilter, this.page, 30).subscribe({
      next: (r) => {
        this.items = r.items;
        this.total = r.total;
        this.busy = false;
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Failed to load';
      },
    });
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }

  approve(u: AdminVerificationUser): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.admin.approveUser(u.id).subscribe({
      next: () => {
        this.busy = false;
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Approve failed';
      },
    });
  }

  startReject(id: string): void {
    this.rejectFor.set(id);
    this.rejectForm.reset();
  }

  cancelReject(): void {
    this.rejectFor.set(null);
  }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      unverified: 'text-bg-secondary',
      pending: 'text-bg-warning text-dark',
      auto_verified: 'text-bg-info text-dark',
      verified: 'text-bg-success',
      rejected: 'text-bg-danger',
    };
    return m[s] || 'text-bg-secondary';
  }

  submitReject(u: AdminVerificationUser): void {
    if (this.rejectForm.invalid) return;
    this.busy = true;
    const reason = String(this.rejectForm.get('reason')?.value).trim();
    this.admin.rejectUser(u.id, reason).subscribe({
      next: () => {
        this.busy = false;
        this.rejectFor.set(null);
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Reject failed';
      },
    });
  }
}
