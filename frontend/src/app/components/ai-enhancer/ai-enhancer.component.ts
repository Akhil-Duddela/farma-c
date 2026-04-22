import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AiService, EnhancedContent } from '../../core/services/ai.service';
import { CreatePostPrefillService } from '../../core/services/create-post-prefill.service';

type ToastKind = 'success' | 'danger' | 'info';

@Component({
  selector: 'app-ai-enhancer',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './ai-enhancer.component.html',
  styleUrl: './ai-enhancer.component.scss',
})
export class AiEnhancerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ai = inject(AiService);
  private readonly prefill = inject(CreatePostPrefillService);
  private readonly router = inject(Router);

  form = this.fb.nonNullable.group({
    idea: ['', [Validators.required, Validators.maxLength(8000)]],
  });

  readonly loading = signal(false);
  readonly result = signal<EnhancedContent | null>(null);
  readonly errorMsg = signal<string>('');
  readonly fieldError = signal<string>('');
  readonly copyFeedback = signal<string>('');
  readonly showToast = signal(false);
  readonly toastKind = signal<ToastKind>('info');
  readonly toastMessage = signal('');

  submit(): void {
    this.fieldError.set('');
    this.errorMsg.set('');
    this.result.set(null);
    this.hideToast();
    if (this.form.invalid) {
      this.form.get('idea')?.markAsTouched();
      this.fieldError.set('Add a short raw idea to enhance.');
      return;
    }
    this.loading.set(true);
    const idea = this.form.get('idea')?.value?.trim() || '';
    this.ai.enhanceContent(idea).subscribe({
      next: (r) => {
        this.loading.set(false);
        this.result.set(this.normalizeResult(r));
        this.showAppToast('success', 'Content generated. Review the cards below or copy a section.');
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        const arr = e.error?.errors;
        const first = Array.isArray(arr) && arr[0]?.msg;
        const msg = first
          ? String(first)
          : e.error?.error ||
            e.error?.message ||
            (typeof e.error === 'string' ? e.error : e.message) ||
            'Request failed';
        this.errorMsg.set(String(msg));
        this.showAppToast('danger', String(msg));
      },
    });
  }

  retry(): void {
    this.errorMsg.set('');
    this.submit();
  }

  private normalizeResult(r: EnhancedContent): EnhancedContent {
    return {
      title: r.title || '',
      description: r.description || '',
      script: r.script || '',
      caption: r.caption || '',
      hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
      hooks: Array.isArray(r.hooks) ? r.hooks : [],
      videoIdea: r.videoIdea || '',
    };
  }

  useForPost(): void {
    const v = this.result();
    if (!v) return;
    this.prefill.setForCreatePost({
      caption: v.caption,
      script: v.script,
      hashtags: v.hashtags,
    });
    this.showAppToast('info', 'Prefilled. Opening create post on dashboard…');
    void this.router.navigateByUrl('/dashboard#create-post');
  }

  copyAllHooksText(r: EnhancedContent): void {
    this.copy(r.hooks.join('\n') || '', 'Hooks');
  }

  copyAllHashtagsText(r: EnhancedContent): void {
    const s = (r.hashtags || [])
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean)
      .map((t) => `#${t}`)
      .join(' ');
    this.copy(s, 'Hashtags');
  }

  tagForDisplay(t: string): string {
    return t.replace(/^#/, '');
  }

  copy(text: string, label: string): void {
    if (!text) return;
    const run = (ok: boolean) => {
      this.copyFeedback.set(ok ? `Copied ${label}` : 'Copy failed');
      this.showAppToast('info', `Copied: ${label}`);
      setTimeout(() => this.copyFeedback.set(''), 2000);
    };
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => run(true), () => this.fallbackCopy(text, run));
    } else {
      this.fallbackCopy(text, run);
    }
  }

  private fallbackCopy(text: string, done: (ok: boolean) => void): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      done(ok);
    } catch {
      done(false);
    }
  }

  private showAppToast(kind: ToastKind, message: string): void {
    this.toastKind.set(kind);
    this.toastMessage.set(message);
    this.showToast.set(true);
    window.setTimeout(() => {
      this.showToast.set(false);
    }, 5000);
  }

  private hideToast(): void {
    this.showToast.set(false);
  }

  dismissToast(): void {
    this.hideToast();
  }
}
