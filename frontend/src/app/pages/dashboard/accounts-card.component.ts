import { Component, OnInit, OnChanges, Input, inject, output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InstagramService, IgAccount } from '../../core/services/instagram.service';
import { YoutubeService, YoutubeAccount } from '../../core/services/youtube.service';
import { AccountsService, AccountsStatus } from '../../core/services/accounts.service';

function thumbSrc(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  return url;
}

@Component({
  selector: 'app-accounts-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accounts-card.component.html',
  styleUrl: './accounts-card.component.scss',
})
export class AccountsCardComponent implements OnInit, OnChanges {
  private readonly ig = inject(InstagramService);
  private readonly yt = inject(YoutubeService);
  private readonly accountsApi = inject(AccountsService);

  @Input() igPickKey: string | null = null;
  @Input() ytPickKey: string | null = null;

  readonly connected = output<void>();
  readonly clearedPicker = output<'ig' | 'yt'>();
  readonly toastRequest = output<{ kind: 'success' | 'danger'; text: string }>();

  status: AccountsStatus | null = null;
  igAccounts: IgAccount[] = [];
  ytAccounts: YoutubeAccount[] = [];
  busy = false;
  error = '';
  ytRedirectUri: string | null = null;

  showIgModal = false;
  igLoadingPick = false;
  igPending: {
    pickKey: string;
    accounts: { accountId: string; pageId: string; username: string; profilePicture: string }[];
  } | null = null;

  showYtModal = false;
  ytLoadingPick = false;
  ytPending: { pickKey: string; channels: { channelId: string; title: string; thumb: string }[] } | null = null;

  ngOnInit(): void {
    this.reload();
    this.yt.getAuthUrl().subscribe({
      next: (r) => (this.ytRedirectUri = (r as { redirectUri?: string }).redirectUri || null),
      error: () => (this.ytRedirectUri = null),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const nextIg = changes['igPickKey']?.currentValue as string | null | undefined;
    if (nextIg) {
      this.openIgPicker(String(nextIg));
    }
    const nextYt = changes['ytPickKey']?.currentValue as string | null | undefined;
    if (nextYt) {
      this.openYtPicker(String(nextYt));
    }
  }

  private openIgPicker(k: string): void {
    this.igLoadingPick = true;
    this.showIgModal = true;
    this.ig.getOAuthPending(k).subscribe({
      next: (d) => {
        this.igPending = d;
        this.igLoadingPick = false;
      },
      error: () => {
        this.igLoadingPick = false;
        this.showIgModal = false;
        this.toastRequest.emit({
          kind: 'danger',
          text: 'This link expired. Start Instagram connect again.',
        });
        this.clearedPicker.emit('ig');
      },
    });
  }

  private openYtPicker(k: string): void {
    this.ytLoadingPick = true;
    this.showYtModal = true;
    this.yt.getOAuthPending(k).subscribe({
      next: (d) => {
        this.ytPending = d;
        this.ytLoadingPick = false;
      },
      error: () => {
        this.ytLoadingPick = false;
        this.showYtModal = false;
        this.toastRequest.emit({ kind: 'danger', text: 'This link expired. Start YouTube connect again.' });
        this.clearedPicker.emit('yt');
      },
    });
  }

  closeIgModal(): void {
    this.showIgModal = false;
    this.igPending = null;
    this.clearedPicker.emit('ig');
  }

  closeYtModal(): void {
    this.showYtModal = false;
    this.ytPending = null;
    this.clearedPicker.emit('yt');
  }

  selectIg(a: { accountId: string }): void {
    if (!this.igPending) {
      return;
    }
    this.busy = true;
    this.ig.selectAccount(this.igPending.pickKey, a.accountId).subscribe({
      next: () => {
        this.busy = false;
        this.showIgModal = false;
        this.igPending = null;
        this.toastRequest.emit({ kind: 'success', text: 'Instagram connected successfully' });
        this.clearedPicker.emit('ig');
        this.reload();
        this.connected.emit();
      },
      error: (e) => {
        this.busy = false;
        this.toastRequest.emit({ kind: 'danger', text: e.error?.error || 'Could not link account' });
      },
    });
  }

  selectYt(ch: { channelId: string }): void {
    if (!this.ytPending) {
      return;
    }
    this.busy = true;
    this.yt.selectChannel(this.ytPending.pickKey, ch.channelId).subscribe({
      next: () => {
        this.busy = false;
        this.showYtModal = false;
        this.ytPending = null;
        this.toastRequest.emit({ kind: 'success', text: 'YouTube connected successfully' });
        this.clearedPicker.emit('yt');
        this.reload();
        this.connected.emit();
      },
      error: (e) => {
        this.busy = false;
        this.toastRequest.emit({ kind: 'danger', text: e.error?.error || 'Could not link channel' });
      },
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
      return { type: 'danger', text: 'Instagram and YouTube tokens may be expired — use Connect to refresh.' };
    }
    if (igExp.length) {
      return { type: 'danger', text: 'Instagram access may be expired — use Refresh or Connect.' };
    }
    if (ytExp.length) {
      return { type: 'danger', text: 'YouTube access may be expired — use Refresh or Connect.' };
    }
    const igSoon = this.igAccounts.some((a) => a.tokenExpiresAt && this.isExpiringSoon(a.tokenExpiresAt!));
    const ytSoon = this.ytAccounts.some((a) => a.tokenExpiresAt && this.isExpiringSoon(a.tokenExpiresAt!));
    if (igSoon) {
      return { type: 'warning', text: 'Instagram token expires soon; use Refresh when you can.' };
    }
    if (ytSoon) {
      return { type: 'warning', text: 'YouTube access expires soon; use Refresh to avoid failed uploads.' };
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

  refreshInstagram(): void {
    this.error = '';
    this.busy = true;
    this.ig.refreshTokens().subscribe({
      next: () => {
        this.busy = false;
        this.toastRequest.emit({ kind: 'success', text: 'Instagram connection refreshed' });
        this.reload();
        this.connected.emit();
      },
      error: (e) => {
        this.busy = false;
        this.toastRequest.emit({ kind: 'danger', text: e.error?.error || 'Refresh failed' });
      },
    });
  }

  refreshYoutube(): void {
    this.error = '';
    this.busy = true;
    this.yt.refreshTokens().subscribe({
      next: () => {
        this.busy = false;
        this.toastRequest.emit({ kind: 'success', text: 'YouTube connection refreshed' });
        this.reload();
        this.connected.emit();
      },
      error: (e) => {
        this.busy = false;
        this.toastRequest.emit({ kind: 'danger', text: e.error?.error || 'Refresh failed' });
      },
    });
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
    if (!confirm(`Disconnect @${account.username || account.igUserId} from Farm-C?`)) {
      return;
    }
    this.busy = true;
    this.ig.disconnect(account._id).subscribe({
      next: () => {
        this.busy = false;
        this.reload();
        this.connected.emit();
        this.toastRequest.emit({ kind: 'success', text: 'Instagram account disconnected' });
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
    if (!confirm(`Disconnect “${account.channelTitle}” from Farm-C?`)) {
      return;
    }
    this.busy = true;
    this.yt.disconnect(account._id).subscribe({
      next: () => {
        this.busy = false;
        this.reload();
        this.connected.emit();
        this.toastRequest.emit({ kind: 'success', text: 'YouTube account disconnected' });
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Disconnect failed';
      },
    });
  }

  igPfp(ig: IgAccount | undefined): string | null {
    return ig ? thumbSrc(ig.profilePictureUrl) : null;
  }
}
