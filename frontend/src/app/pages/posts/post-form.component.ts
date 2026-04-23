import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PostService } from '../../core/services/post.service';
import { InstagramService, IgAccount } from '../../core/services/instagram.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-post-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './post-form.component.html',
  styleUrl: './post-form.component.scss',
})
export class PostFormComponent implements OnInit {
  readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly posts = inject(PostService);
  private readonly ig = inject(InstagramService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  accounts: IgAccount[] = [];
  loading = false;
  aiBusy = false;
  mediaBusy = false;
  error = '';

  form = this.fb.nonNullable.group({
    instagramAccountId: ['', Validators.required],
    caption: [''],
    hashtagsText: [''],
    hook: [''],
    body: [''],
    cta: [''],
    mediaUrlsText: [''],
    aspectRatio: this.fb.nonNullable.control<'1:1' | '9:16' | '4:5'>('1:1'),
    status: this.fb.nonNullable.control<'draft' | 'scheduled'>('draft'),
    scheduledAt: [''],
  });

  ngOnInit(): void {
    this.auth.refreshUser().subscribe({ error: () => undefined });
    this.ig.list().subscribe((a) => {
      this.accounts = a;
      const def = a.find((x) => x.isDefault) || a[0];
      if (def) this.form.patchValue({ instagramAccountId: def._id });
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.posts.get(id).subscribe((p) => {
        const igId =
          typeof p.instagramAccountId === 'object' && p.instagramAccountId && '_id' in p.instagramAccountId
            ? (p.instagramAccountId as { _id: string })._id
            : String(p.instagramAccountId);
        this.form.patchValue({
          instagramAccountId: igId,
          caption: p.caption,
          hashtagsText: (p.hashtags || []).join(' '),
          hook: p.reelScript?.hook || '',
          body: p.reelScript?.body || '',
          cta: p.reelScript?.cta || '',
          mediaUrlsText: (p.mediaUrls || []).join('\n'),
          aspectRatio: (p.aspectRatio as '1:1') || '1:1',
          status: p.status === 'scheduled' ? 'scheduled' : 'draft',
          scheduledAt: p.scheduledAt ? p.scheduledAt.slice(0, 16) : '',
        });
      });
    }
  }

  parseHashtags(raw: string): string[] {
    return raw
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);
  }

  save(): void {
    if (this.form.invalid) return;
    if (!this.auth.canUsePublishing()) {
      this.error = 'Complete verification to save and schedule posts.';
      return;
    }
    this.loading = true;
    this.error = '';
    const v = this.form.getRawValue();
    const hashtags = this.parseHashtags(v.hashtagsText);
    const mediaUrls = v.mediaUrlsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const reelScript =
      v.hook || v.body || v.cta ? { hook: v.hook, body: v.body, cta: v.cta } : undefined;

    const payload = {
      instagramAccountId: v.instagramAccountId,
      caption: v.caption,
      hashtags,
      reelScript,
      mediaUrls,
      mediaType: 'image' as const,
      aspectRatio: v.aspectRatio,
      status: v.status === 'scheduled' ? 'scheduled' : 'draft',
      scheduledAt:
        v.status === 'scheduled' && v.scheduledAt ? new Date(v.scheduledAt).toISOString() : undefined,
    };

    const id = this.route.snapshot.paramMap.get('id');
    const req =
      id && id !== 'new' ? this.posts.update(id, payload) : this.posts.create(payload as never);

    req.subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl('/posts');
      },
      error: (e) => {
        this.loading = false;
        const arr = e.error?.errors;
        const first = Array.isArray(arr) && arr[0]?.msg;
        this.error = first
          ? String(first)
          : e.error?.error || e.error?.message || (typeof e.error === 'string' ? e.error : e.message) || 'Save failed';
      },
    });
  }

  runAi(): void {
    this.aiBusy = true;
    this.error = '';
    const cap = this.form.getRawValue().caption?.trim();
    const topic = cap && cap.length > 3 ? cap.slice(0, 200) : 'desi poultry and organic farming';
    this.posts.generateAi({ topic }).subscribe({
      next: (bundle: any) => {
        this.aiBusy = false;
        this.form.patchValue({
          caption: bundle.caption,
          hashtagsText: (bundle.hashtags || []).join(' '),
          hook: bundle.reelScript?.hook || '',
          body: bundle.reelScript?.body || '',
          cta: bundle.reelScript?.cta || '',
        });
      },
      error: (e) => {
        this.aiBusy = false;
        this.error =
          e.error?.error || e.error?.message || (typeof e.error === 'string' ? e.error : e.message) || 'AI generation failed';
      },
    });
  }

  runMedia(): void {
    this.mediaBusy = true;
    this.error = '';
    const aspect = this.form.getRawValue().aspectRatio;
    this.posts
      .generateMedia({
        prompt: 'Desi chickens on a green farm in India, morning light',
        aspectRatio: aspect,
      })
      .subscribe({
        next: (res) => {
          this.mediaBusy = false;
          this.form.patchValue({ mediaUrlsText: res.url });
        },
        error: (e) => {
          this.mediaBusy = false;
          this.error =
            e.error?.error || e.error?.message || (typeof e.error === 'string' ? e.error : e.message) || 'Media generation failed';
        },
      });
  }

  improve(): void {
    const cap = this.form.getRawValue().caption;
    if (!cap) return;
    this.aiBusy = true;
    this.error = '';
    this.posts.improveCaption(cap).subscribe({
      next: (r) => {
        this.aiBusy = false;
        this.form.patchValue({ caption: r.caption });
      },
      error: (e) => {
        this.aiBusy = false;
        this.error =
          e.error?.error || e.error?.message || (typeof e.error === 'string' ? e.error : e.message) || 'Failed to improve caption';
      },
    });
  }
}
