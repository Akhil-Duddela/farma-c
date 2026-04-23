import { Injectable, signal } from '@angular/core';

const MESSAGES: Record<string, string> = {
  OTP_RATE_LIMIT: 'Too many code requests. Please wait and try again.',
  OTP_COOLDOWN: 'Too many attempts. Please try again later.',
  CAPTCHA_FAILED: 'Complete the security check and try again.',
  CAPTCHA_NOT_CONFIGURED: 'Verification is not available (server).',
  CAPTCHA_SERVICE_UNAVAILABLE: 'Security check service unavailable. Try again in a few minutes.',
  TOKEN_EXPIRED: 'This link has expired. Request a new one.',
  PUBLISH_FAILED: 'Publishing failed, please retry.',
  ACCOUNT_DISCONNECTED: 'A connected account was lost. Reconnect in Settings, then retry.',
  FRAUD_RESTRICTION: 'This account is restricted. Contact support.',
  OTP_REDIS_UNAVAILABLE: 'SMS verification is temporarily unavailable. Try again shortly.',
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _text = signal('');
  private readonly _kind = signal<'danger' | 'info'>('info');
  readonly text = this._text.asReadonly();
  readonly kind = this._kind.asReadonly();
  private timer: ReturnType<typeof setTimeout> | null = null;

  showError(message: string, kind: 'danger' | 'info' = 'danger'): void {
    this._text.set(message);
    this._kind.set(kind);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this._text.set('');
      this.timer = null;
    }, 8000);
  }

  forApiCode(code: string | undefined, fallback: string): void {
    this.showError(MESSAGES[code || ''] || fallback);
  }

  clear(): void {
    this._text.set('');
    this._kind.set('info');
  }
}
