import { Component, OnInit, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InstagramService, IgAccount } from '../../core/services/instagram.service';
import { YoutubeService, YoutubeAccount } from '../../core/services/youtube.service';
import { AccountsService, AccountsStatus } from '../../core/services/accounts.service';

@Component({
  selector: 'app-accounts-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accounts-card.component.html',
  styleUrl: './accounts-card.component.scss',
})
export class AccountsCardComponent implements OnInit {
  private readonly ig = inject(InstagramService);
  private readonly yt = inject(YoutubeService);
  private readonly accountsApi = inject(AccountsService);

  readonly connected = output<void>();

  status: AccountsStatus | null = null;
  igAccounts: IgAccount[] = [];
  ytAccounts: YoutubeAccount[] = [];
  busy = false;
  error = '';
  /** Google Cloud redirect URI (from API) for troubleshooting */
  ytRedirectUri: string | null = null;

  ngOnInit(): void {
    this.reload();
    this.yt.getAuthUrl().subscribe({
      next: (r) => (this.ytRedirectUri = (r as { redirectUri?: string }).redirectUri || null),
      error: () => (this.ytRedirectUri = null),
    });
  }

  reload(): void {
    this.accountsApi.getStatus().subscribe({
      next: (s) => (this.status = s),
      error: () => (this.status = null),
    });
    this.ig.list().subscribe((a) => (this.igAccounts = a));
    this.yt.list().subscribe((a) => (this.ytAccounts = a));
  }

  get igOk(): boolean {
    return (this.status?.instagram.connected ?? false) || this.igAccounts.length > 0;
  }

  get ytOk(): boolean {
    return (this.status?.youtube.connected ?? false) || this.ytAccounts.length > 0;
  }

  get tokenAlert(): { type: 'danger' | 'warning'; text: string } | null {
    const igExp = this.igAccounts.filter((a) => a.tokenExpiresAt && this.isExpired(a.tokenExpiresAt!));
    const ytExp = this.ytAccounts.filter((a) => a.tokenExpiresAt && this.isExpired(a.tokenExpiresAt!));
    if (igExp.length && ytExp.length) {
      return { type: 'danger', text: 'Instagram and YouTube tokens may be expired — use Connect to reconnect.' };
    }
    if (igExp.length) {
      return { type: 'danger', text: 'Instagram access may be expired — click Connect to refresh.' };
    }
    if (ytExp.length) {
      return { type: 'danger', text: 'YouTube access may be expired — connect again to refresh.' };
    }
    const igSoon = this.igAccounts.some((a) => a.tokenExpiresAt && this.isExpiringSoon(a.tokenExpiresAt!));
    const ytSoon = this.ytAccounts.some((a) => a.tokenExpiresAt && this.isExpiringSoon(a.tokenExpiresAt!));
    if (igSoon) {
      return { type: 'warning', text: 'Instagram token expires soon; reconnect from Connect when you can.' };
    }
    if (ytSoon) {
      return { type: 'warning', text: 'YouTube access expires soon; reconnect to avoid failed uploads.' };
    }
    return null;
  }

  private isExpired(iso: string): boolean {
    return new Date(iso).getTime() < Date.now();
  }

  private isExpiringSoon(iso: string): boolean {
    const t = new Date(iso).getTime();
    return t >= Date.now() && t < Date.now() + 7 * 24 * 3600 * 1000;
  }

  connectInstagram(): void {
    this.error = '';
    this.busy = true;
    this.ig.getAuthUrl().subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || e.message || 'Could not start Instagram connect';
      },
    });
  }

  connectYoutube(): void {
    this.error = '';
    this.busy = true;
    this.yt.getAuthUrl().subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || e.message || 'Could not start YouTube connect';
      },
    });
  }

  disconnectInstagram(account: IgAccount, ev: Event): void {
    ev.preventDefault();
    this.error = '';
    if (!confirm(`Disconnect @${account.username || account.igUserId} from Farm-C?`)) return;
    this.busy = true;
    this.ig.disconnect(account._id).subscribe({
      next: () => {
        this.busy = false;
        this.reload();
        this.connected.emit();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Disconnect failed';
      },
    });
  }

  disconnectYoutube(account: YoutubeAccount, ev: Event): void {
    ev.preventDefault();
    this.error = '';
    if (!confirm(`Disconnect “${account.channelTitle}” from Farm-C?`)) return;
    this.busy = true;
    this.yt.disconnect(account._id).subscribe({
      next: () => {
        this.busy = false;
        this.reload();
        this.connected.emit();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Disconnect failed';
      },
    });
  }
}
