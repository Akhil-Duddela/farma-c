import { Injectable, signal } from '@angular/core';
import { ERROR_MESSAGES } from '../error-map';

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
    this.showError(ERROR_MESSAGES[code || ''] || fallback);
  }

  clear(): void {
    this._text.set('');
    this._kind.set('info');
  }
}
