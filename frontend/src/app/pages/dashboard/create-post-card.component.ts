import { Component, DestroyRef, OnInit, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PostService, CreatePostV2Body } from '../../core/services/post.service';
import { InstagramService, IgAccount } from '../../core/services/instagram.service';
import { YoutubeService, YoutubeAccount } from '../../core/services/youtube.service';
import { UploadService } from '../../core/services/upload.service';
import { CreatePostPrefillService } from '../../core/services/create-post-prefill.service';

type MediaKind = 'image' | 'video' | 'reel';

@Component({
  selector: 'app-create-post-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-post-card.component.html',
  styleUrl: './create-post-card.component.scss',
})
export class CreatePostCardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly posts = inject(PostService);
  private readonly ig = inject(InstagramService);
  private readonly yt = inject(YoutubeService);
  private readonly upload = inject(UploadService);
  private readonly prefill = inject(CreatePostPrefillService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Emitted when a post was created (parent refreshes) */
  readonly postCreated = output<void>();

  igAccounts: IgAccount[] = [];
  ytAccounts: YoutubeAccount[] = [];
  loading = false;
  uploadBusy = false;
  error = '';
  previewUrl: string | null = null;
  localFile: File | null = null;
  mediaKind: MediaKind = 'image';

  form = this.fb.nonNullable.group({
    content: ['', [Validators.maxLength(8000)]],
    hashtagsText: [''],
    useInstagram: [true],
    useYoutube: [false],
    postMode: this.fb.nonNullable.control<'now' | 'schedule' | 'draft'>('now'),
    scheduledAt: [''],
    aspectRatio: this.fb.nonNullable.control<'1:1' | '4:5' | '9:16'>('1:1'),
  });

  ngOnInit(): void {
    this.ig.list().subscribe((a) => (this.igAccounts = a));
    this.yt.list().subscribe((a) => (this.ytAccounts = a));
    this.applyPrefill();
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((e) => {
        if (e.urlAfterRedirects?.includes('dashboard') || e.urlAfterRedirects === '/') {
          this.applyPrefill();
        }
      });
  }

  /** Apply AI prefill (safe when re-navigating to dashboard with same component instance) */
  private applyPrefill(): void {
    const fromAi = this.prefill.consume();
    if (fromAi) {
      this.form.patchValue({
        content: fromAi.content,
        hashtagsText: fromAi.hashtagsText,
      });
    }
  }

  get bothPlatforms(): boolean {
    return !!(this.form.get('useInstagram')?.value && this.form.get('useYoutube')?.value);
  }

  onPlatformChange(): void {
    if (this.bothPlatforms) {
      if (this.mediaKind !== 'video' && this.mediaKind !== 'reel') {
        this.error = 'When both Instagram and YouTube are selected, upload a video file (or .mp4 URL).';
      } else {
        this.error = '';
      }
    } else {
      this.error = '';
    }
  }

  onFilePicked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error = '';
    this.localFile = file || null;
    if (this.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = null;
    if (!file) return;
    this.previewUrl = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      this.mediaKind = 'video';
    } else if (file.type.startsWith('image/')) {
      this.mediaKind = 'image';
    } else {
      this.error = 'Use an image (JPEG, PNG, WebP) or video (MP4, etc.) file.';
      return;
    }
    this.onPlatformChange();
  }

  clearFile(): void {
    if (this.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = null;
    this.localFile = null;
    this.mediaKind = 'image';
  }

  parseHashtags(raw: string): string[] {
    return raw
      .split(/[,\n]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);
  }

  private validate(): string | null {
    const v = this.form.getRawValue();
    if (!v.useInstagram && !v.useYoutube) {
      return 'Select at least one platform (Instagram or YouTube).';
    }
    if (v.useInstagram && !this.igAccounts.length) {
      return 'Connect an Instagram account before posting to Instagram.';
    }
    if (v.useYoutube && !this.ytAccounts.length) {
      return 'Connect a YouTube account before posting to YouTube.';
    }
    if (v.postMode === 'schedule' && !v.scheduledAt) {
      return 'Pick a date and time for the scheduled post.';
    }
    if (v.useInstagram && v.useYoutube) {
      if (this.mediaKind !== 'video' && this.mediaKind !== 'reel') {
        return 'With both platforms enabled, use a video (or Reel) file.';
      }
    }
    if (v.useYoutube && !v.useInstagram) {
      if (this.mediaKind !== 'video' && this.mediaKind !== 'reel') {
        return 'YouTube requires a video file (or public video URL after upload).';
      }
    }
    if (!this.localFile) {
      return 'Choose a media file to upload, or the upload must complete first.';
    }
    return null;
  }

  private defaultIgId(): string {
    const d = this.igAccounts.find((a) => a.isDefault) || this.igAccounts[0];
    return d?._id || '';
  }

  private defaultYtId(): string {
    const d = this.ytAccounts.find((a) => a.isDefault) || this.ytAccounts[0];
    return d?._id || '';
  }

  private buildMediaType(): 'image' | 'video' | 'reel' {
    const v = this.form.getRawValue();
    if (this.mediaKind === 'image') {
      return 'image';
    }
    if (v.useInstagram && v.useYoutube) {
      return v.aspectRatio === '9:16' ? 'reel' : 'video';
    }
    if (v.useInstagram && v.aspectRatio === '9:16') {
      return 'reel';
    }
    return 'video';
  }

  submit(after: 'now' | 'schedule' | 'draft'): void {
    this.form.patchValue({
      postMode: after === 'schedule' ? 'schedule' : after === 'draft' ? 'draft' : 'now',
    });
    this.error = '';
    const err = this.validate();
    if (err) {
      this.error = err;
      return;
    }
    if (!this.localFile) return;
    this.loading = true;
    this.uploadBusy = true;
    this.upload.uploadFile(this.localFile).subscribe({
      next: (up) => {
        this.uploadBusy = false;
        this.dispatchCreate(up.url, this.buildMediaType());
      },
      error: (e) => {
        this.uploadBusy = false;
        this.loading = false;
        this.error = e.error?.error || e.message || 'Upload failed';
      },
    });
  }

  private dispatchCreate(mediaUrl: string, mediaType: 'image' | 'video' | 'reel' | 'carousel'): void {
    const v = this.form.getRawValue();
    const hashtags = this.parseHashtags(v.hashtagsText);
    const useIg = v.useInstagram;
    const useYt = v.useYoutube;
    const igId = useIg ? this.defaultIgId() : undefined;
    const ytId = useYt ? this.defaultYtId() : undefined;

    let status: CreatePostV2Body['status'] = 'draft';
    let scheduledAt: string | undefined;
    if (v.postMode === 'draft') {
      status = 'draft';
    } else if (v.postMode === 'now') {
      status = 'scheduled';
      scheduledAt = new Date().toISOString();
    } else {
      status = 'scheduled';
      scheduledAt = v.scheduledAt ? new Date(v.scheduledAt).toISOString() : undefined;
    }

    const body: CreatePostV2Body = {
      content: v.content.trim(),
      mediaUrl,
      mediaType: mediaType === 'carousel' ? 'image' : mediaType,
      platforms: { instagram: useIg, youtube: useYt },
      hashtags,
      status,
      scheduledAt,
    };
    if (igId) body.instagramAccountId = igId;
    if (ytId) body.youtubeAccountId = ytId;

    this.posts.createPostV2({ ...body, aspectRatio: v.aspectRatio }).subscribe({
      next: () => {
        this.loading = false;
        this.clearFile();
        this.form.patchValue({
          content: '',
          hashtagsText: '',
          postMode: 'now',
          scheduledAt: '',
        });
        this.postCreated.emit();
      },
      error: (e) => {
        this.loading = false;
        this.error = e.error?.message || e.error?.errors?.[0]?.msg || e.error?.error || 'Create failed';
      },
    });
  }
}
