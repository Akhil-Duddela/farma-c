import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

// hCaptcha global from https://js.hcaptcha.com/1/api.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const hcaptcha: any;

@Injectable({ providedIn: 'root' })
export class HcaptchaService {
  private readonly platformId = inject(PLATFORM_ID);
  private loaded = false;
  private readonly siteKey = environment.hcaptchaSiteKey || '';
  private widgetId: string | null = null;
  private container: HTMLElement | null = null;

  isEnabled(): boolean {
    return this.siteKey.length > 10;
  }

  getSiteKey(): string {
    return this.siteKey;
  }

  loadScript(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.loaded) {
      return Promise.resolve();
    }
    if (!this.siteKey) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const exist = document.querySelector('script[src*="hcaptcha.com/1/api.js"]');
      if (exist) {
        this.loaded = true;
        return resolve();
      }
      const s = document.createElement('script');
      s.src = 'https://js.hcaptcha.com/1/api.js';
      s.async = true;
      s.defer = true;
      s.onload = () => {
        this.loaded = true;
        resolve();
      };
      s.onerror = () => reject(new Error('captcha load'));
      document.head.appendChild(s);
    });
  }

  async mount(container: HTMLElement, onToken: (t: string) => void): Promise<void> {
    this.container = container;
    if (!isPlatformBrowser(this.platformId) || !this.isEnabled()) {
      onToken('');
      return;
    }
    await this.loadScript();
    container.innerHTML = '';
    this.widgetId = hcaptcha.render(container, {
      sitekey: this.siteKey,
      callback: (t: string) => onToken(t),
      'expired-callback': () => onToken(''),
    });
  }

  reset(): void {
    if (!isPlatformBrowser(this.platformId) || !this.widgetId) return;
    try {
      hcaptcha.reset(this.widgetId);
    } catch {
      /* */
    }
  }
}
