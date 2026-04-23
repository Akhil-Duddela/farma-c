import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SettingsService } from '../../core/services/settings.service';
import { InstagramService, IgAccount } from '../../core/services/instagram.service';
import { AuthService } from '../../core/services/auth.service';
import { CreatorBadgesComponent } from '../../components/creator-badges/creator-badges.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CreatorBadgesComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsApi = inject(SettingsService);
  private readonly ig = inject(InstagramService);
  readonly auth = inject(AuthService);

  accounts: IgAccount[] = [];
  saved = false;
  error = '';

  profile = this.fb.nonNullable.group({
    name: [''],
    timezone: ['Asia/Kolkata'],
    dailyAutoPostCount: [0, [Validators.min(0), Validators.max(10)]],
    dailyAutoPostHourIST: [9, [Validators.min(0), Validators.max(23)]],
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

  setDefault(id: string): void {
    this.ig.setDefault(id).subscribe(() => this.loadIg());
  }
}
