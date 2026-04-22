import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingsService } from '../../core/services/settings.service';
import { InstagramService, IgAccount } from '../../core/services/instagram.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsApi = inject(SettingsService);
  private readonly ig = inject(InstagramService);

  accounts: IgAccount[] = [];
  saved = false;
  error = '';

  profile = this.fb.nonNullable.group({
    name: [''],
    timezone: ['Asia/Kolkata'],
    dailyAutoPostCount: [0, [Validators.min(0), Validators.max(10)]],
    dailyAutoPostHourIST: [9, [Validators.min(0), Validators.max(23)]],
  });

  linkForm = this.fb.nonNullable.group({
    igUserId: ['', Validators.required],
    accessToken: [''],
    shortLivedToken: [''],
    username: [''],
    pageId: [''],
  });

  ngOnInit(): void {
    this.settingsApi.get().subscribe((s) => this.profile.patchValue(s));
    this.loadIg();
  }

  loadIg(): void {
    this.ig.list().subscribe((a) => (this.accounts = a));
  }

  saveProfile(): void {
    this.saved = false;
    this.error = '';
    this.settingsApi.update(this.profile.getRawValue()).subscribe({
      next: () => (this.saved = true),
      error: (e) => (this.error = e.error?.error || 'Save failed'),
    });
  }

  linkIg(): void {
    this.error = '';
    const v = this.linkForm.getRawValue();
    this.ig
      .link({
        igUserId: v.igUserId,
        accessToken: v.accessToken || undefined,
        shortLivedToken: v.shortLivedToken || undefined,
        username: v.username || undefined,
        pageId: v.pageId || undefined,
      })
      .subscribe({
        next: () => {
          this.linkForm.reset();
          this.loadIg();
        },
        error: (e) => (this.error = e.error?.error || 'Link failed'),
      });
  }

  setDefault(id: string): void {
    this.ig.setDefault(id).subscribe(() => this.loadIg());
  }
}
