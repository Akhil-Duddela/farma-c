import { Component, OnInit, OnDestroy, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, interval, switchMap, startWith } from 'rxjs';
import { PostService, Post } from '../../core/services/post.service';
import { AutomationService } from '../../core/services/automation.service';

@Component({
  selector: 'app-automation-pipeline',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './automation-pipeline.component.html',
  styleUrl: './automation-pipeline.component.scss',
})
export class AutomationPipelineComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auto = inject(AutomationService);
  private readonly posts = inject(PostService);
  private pollSub: Subscription | null = null;

  /** Notify parent to refresh the post table */
  readonly pipelineEvent = output<void>();

  form = this.fb.nonNullable.group({
    input: ['', [Validators.required, Validators.maxLength(8000)]],
    useInstagram: [true],
    useYoutube: [true],
  });

  busy = false;
  error = '';
  activeId: string | null = null;
  current = signal<Post | null>(null);
  history: Post[] = [];

  ngOnInit(): void {
    this.loadHistory();
  }

  ngOnDestroy(): void {
    this.stopPoll();
  }

  loadHistory(): void {
    this.posts.list({ automation: '1', limit: '20' }).subscribe((rows) => (this.history = rows));
  }

  run(): void {
    this.error = '';
    if (this.form.invalid) {
      this.form.get('input')?.markAsTouched();
      return;
    }
    const { input, useInstagram, useYoutube } = this.form.getRawValue();
    if (!useInstagram && !useYoutube) {
      this.error = 'Select at least one platform (Instagram and/or YouTube).';
      return;
    }
    this.busy = true;
    this.current.set(null);
    this.activeId = null;
    this.stopPoll();
    this.auto
      .run({
        input: input.trim(),
        platforms: { instagram: useInstagram, youtube: useYoutube },
      })
      .subscribe({
        next: (r) => {
          this.activeId = r.postId;
          this.busy = false;
          this.startPoll(r.postId);
        },
        error: (e: HttpErrorResponse) => {
          this.busy = false;
          this.error = e.error?.error || e.error?.message || e.message || 'Could not start pipeline';
        },
      });
  }

  private startPoll(id: string): void {
    this.stopPoll();
    this.pollSub = interval(2000)
      .pipe(
        startWith(0),
        switchMap(() => this.posts.get(id))
      )
      .subscribe({
        next: (p) => {
          this.current.set(p);
          if (this.isTerminal(p)) {
            this.stopPoll();
            this.loadHistory();
            this.pipelineEvent.emit();
          }
        },
        error: (e) => {
          this.error = e.error?.error || e.message;
          this.stopPoll();
        },
      });
  }

  private isTerminal(p: Post): boolean {
    const ps = p.pipelineStatus;
    if (ps === 'completed' || ps === 'published' || ps === 'failed' || ps === 'partial') {
      return true;
    }
    if (p.automation?.step === 'failed' && p.status === 'failed') {
      return true;
    }
    return false;
  }

  private stopPoll(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  stepAiDone(p: Post | null): boolean {
    if (!p) return false;
    const ps = p.pipelineStatus || '';
    if (p.aiContent?.title) return true;
    if (ps === 'ai_done') return true;
    if (['video_done', 'uploaded', 'publishing', 'published', 'partial', 'failed', 'completed'].includes(ps)) {
      return true;
    }
    return false;
  }

  stepVideoDone(p: Post | null): boolean {
    if (!p) return false;
    const ps = p.pipelineStatus || '';
    if (p.videoUrl || p.mediaUrl) return true;
    if (['uploaded', 'publishing', 'published', 'partial', 'failed', 'completed'].includes(ps)) {
      return true;
    }
    return ps === 'video_done';
  }

  stepUploadDone(p: Post | null): boolean {
    if (!p) return false;
    const ps = p.pipelineStatus || '';
    if (p.mediaUrl) return true;
    if (['publishing', 'published', 'partial', 'failed', 'completed'].includes(ps)) {
      return true;
    }
    return false;
  }

  stepPublishInProgress(p: Post | null): boolean {
    if (!p) return false;
    return p.status === 'publishing' || p.automation?.step === 'publishing';
  }

  stepPublishDone(p: Post | null): boolean {
    if (!p) return false;
    const done =
      p.pipelineStatus === 'published' ||
      p.pipelineStatus === 'partial' ||
      p.pipelineStatus === 'completed' ||
      p.status === 'posted' ||
      p.status === 'failed';
    if (!done) {
      return false;
    }
    if (p.status === 'publishing' || p.automation?.step === 'publishing') {
      return false;
    }
    return true;
  }

  /** CSS classes for `pipelineStatus` */
  pipelineBadgeClass(ps: string | undefined): string {
    const s = ps || '';
    if (s === 'failed') return 'text-bg-danger';
    if (s === 'partial') return 'text-bg-warning';
    if (s === 'completed' || s === 'published') return 'text-bg-success';
    if (s === 'processing' || s === 'ai_done' || s === 'video_done' || s === 'uploaded' || s === 'publishing') {
      return 'text-bg-primary';
    }
    return 'text-bg-secondary';
  }
}
