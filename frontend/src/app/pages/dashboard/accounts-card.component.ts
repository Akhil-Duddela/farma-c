import { Component, OnInit, OnDestroy, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InstagramService, IgAccount } from '../../core/services/instagram.service';
import { YoutubeService, YoutubeAccount } from '../../core/services/youtube.service';

const YT_OAUTH_MSG = 'farmc-youtube-oauth';

@Component({
  selector: 'app-accounts-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accounts-card.component.html',
  styleUrl: './accounts-card.component.scss',
})
export class AccountsCardComponent implements OnInit, OnDestroy {
  private readonly ig = inject(InstagramService);
  private readonly yt = inject(YoutubeService);

  private readonly onYtOauthMessage = (e: MessageEvent): void => {
    if (e.origin !== window.location.origin) return;
    const d = e.data as { type?: string; status?: string; reason?: string } | null;
    if (d?.type !== YT_OAUTH_MSG) return;
    this.error = d.status === 'error' && d.reason ? d.reason : '';
    this.reload();
    this.connected.emit();
  };

  readonly connected = output<void>();

  igAccounts: IgAccount[] = [];
  ytAccounts: YoutubeAccount[] = [];
  busy = false;
  error = '';
  igForm = { igUserId: '', accessToken: '', pageId: '', username: '' };
  ytCode = '';
  /** Must match Google Cloud → OAuth client → Authorized redirect URIs (exact) */
  ytRedirectUri: string | null = null;

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.onYtOauthMessage);
    }
    this.reload();
    this.yt.getAuthUrl().subscribe({
      next: (r) => (this.ytRedirectUri = r.redirectUri || null),
      error: () => (this.ytRedirectUri = null),
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.onYtOauthMessage);
    }
  }

  reload(): void {
    this.ig.list().subscribe((a) => (this.igAccounts = a));
    this.yt.list().subscribe((a) => (this.ytAccounts = a));
  }

  get igOk(): boolean {
    return this.igAccounts.length > 0;
  }
  get ytOk(): boolean {
    return this.ytAccounts.length > 0;
  }

  /** If token is past expiry or within 7 days, prompt reconnect */
  get tokenAlert(): { type: 'danger' | 'warning'; text: string } | null {
    const igExp = this.igAccounts.filter((a) => a.tokenExpiresAt && this.isExpired(a.tokenExpiresAt!));
    const ytExp = this.ytAccounts.filter((a) => a.tokenExpiresAt && this.isExpired(a.tokenExpiresAt!));
    if (igExp.length || ytExp.length) {
      if (igExp.length && ytExp.length) {
        return {
          type: 'danger',
          text: 'Instagram and YouTube tokens look expired — use Connect below with fresh credentials.',
        };
      }
      if (igExp.length) {
        return { type: 'danger', text: 'Instagram token looks expired — add a new long-lived token above.' };
      }
      return { type: 'danger', text: 'YouTube token may be expired — complete the OAuth flow again below.' };
    }
    const igSoon = this.igAccounts.some((a) => a.tokenExpiresAt && this.isExpiringSoon(a.tokenExpiresAt!));
    const ytSoon = this.ytAccounts.some((a) => a.tokenExpiresAt && this.isExpiringSoon(a.tokenExpiresAt!));
    if (igSoon) {
      return { type: 'warning', text: 'Instagram token expires within 7 days; refresh your connection when possible.' };
    }
    if (ytSoon) {
      return { type: 'warning', text: 'YouTube access expires within 7 days; reconnect to avoid failed uploads.' };
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
    if (!this.igForm.igUserId || !this.igForm.accessToken) {
      this.error = 'Instagram: enter ig user id and access token (long-lived).';
      return;
    }
    this.busy = true;
    this.ig
      .link({
        igUserId: this.igForm.igUserId.trim(),
        accessToken: this.igForm.accessToken.trim(),
        pageId: this.igForm.pageId.trim() || undefined,
        username: this.igForm.username.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.busy = false;
          this.igForm = { igUserId: '', accessToken: '', pageId: '', username: '' };
          this.reload();
          this.connected.emit();
        },
        error: (e) => {
          this.busy = false;
          this.error = e.error?.error || 'Instagram link failed';
        },
      });
  }

  openYoutubeAuth(): void {
    this.error = '';
    this.yt.getAuthUrl().subscribe({
      next: ({ url }) => {
        window.open(url, '_blank', 'noopener');
      },
      error: (e) => (this.error = e.error?.error || 'Could not get auth URL'),
    });
  }

  exchangeYoutubeCode(): void {
    const code = this.ytCode.trim();
    if (!code) {
      this.error = 'Paste the authorization code from the redirect URL.';
      return;
    }
    this.busy = true;
    this.yt.exchangeCode(code).subscribe({
      next: () => {
        this.busy = false;
        this.ytCode = '';
        this.reload();
        this.connected.emit();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || e.error?.message || 'YouTube link failed';
      },
    });
  }
}
