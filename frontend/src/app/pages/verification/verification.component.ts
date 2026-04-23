import { Component, OnInit, OnDestroy, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ProfileVerificationService, ProfileStatus } from '../../core/services/profile-verification.service';
import { HcaptchaService } from '../../core/hcaptcha.service';

const OTP_MSG: Record<string, string> = {
  CAPTCHA_FAILED: 'Complete the security check and try again.',
  OTP_COOLDOWN: 'Too many attempts. Please try again later.',
  OTP_RATE_LIMIT: 'Too many code requests. Wait a few minutes.',
  OTP_REDIS_UNAVAILABLE: 'Verification service is busy. Please try again shortly.',
};

@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './verification.component.html',
  styleUrl: './verification.component.scss',
})
export class VerificationComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  private readonly profile = inject(ProfileVerificationService);
  private readonly fb = inject(FormBuilder);
  private readonly hcaptcha = inject(HcaptchaService);

  @ViewChild('otpCaptchaBox') otpCaptchaBox?: ElementRef<HTMLDivElement>;
  private otpCaptchaToken = '';
  private otpHooked = false;
  private coolTimer: ReturnType<typeof setInterval> | null = null;

  status: ProfileStatus | null = null;
  busy = false;
  error = '';
  success = '';

  phoneForm = this.fb.group({ phone: ['', [Validators.required, Validators.minLength(8)]] });
  otpForm = this.fb.group({ otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  otpSent = false;

  imagePreview: string | null = null;
  imageFile: File | null = null;
  imageUrl: string | null = null;

  stepEmailDone = signal(false);
  stepPhoneDone = signal(false);
  stepProfileDone = signal(false);
  resendCountdown = signal(0);
  get otpCaptchaOn(): boolean {
    return this.hcaptcha.isEnabled();
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    if (this.coolTimer) {
      clearInterval(this.coolTimer);
      this.coolTimer = null;
    }
  }

  load(): void {
    this.profile.getStatus().subscribe({
      next: (s) => {
        this.status = s;
        this.stepEmailDone.set(s.emailVerified);
        this.stepPhoneDone.set(s.phoneVerified);
        this.stepProfileDone.set(
          s.verificationStatus === 'verified' || s.verificationStatus === 'auto_verified'
        );
        this.imageUrl = s.profileImageUrl || null;
        this.auth.refreshUser().subscribe();
        if (!s.phoneVerified && this.otpCaptchaOn) {
          setTimeout(() => this.hookOtpCaptcha(), 0);
        }
      },
      error: () => (this.error = 'Could not load status'),
    });
  }

  private hookOtpCaptcha(): void {
    if (this.otpHooked || !this.otpCaptchaBox?.nativeElement || !this.otpCaptchaOn) {
      return;
    }
    this.otpHooked = true;
    void this.hcaptcha.mount(this.otpCaptchaBox.nativeElement, (t) => {
      this.otpCaptchaToken = t || '';
    });
  }

  resendEmail(): void {
    this.error = '';
    this.success = '';
    this.busy = true;
    this.auth.resendVerificationEmail().subscribe({
      next: (r) => {
        this.busy = false;
        this.success = r.sent
          ? 'Check your inbox for a new link.'
          : r.mockUrl
            ? 'Email not configured (dev). Check server logs for the link.'
            : 'We could not send email. Configure SMTP in production.';
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Could not resend';
      },
    });
  }

  sendOtp(): void {
    const v = this.phoneForm.get('phone')?.value?.trim();
    if (!v) {
      return;
    }
    if (this.otpCaptchaOn && !this.otpCaptchaToken) {
      this.error = 'Complete the security check (CAPTCHA) first.';
      return;
    }
    this.error = '';
    this.success = '';
    this.busy = true;
    this.auth.sendOtp(v, this.otpCaptchaToken).subscribe({
      next: () => {
        this.busy = false;
        this.otpSent = true;
        this.hcaptcha.reset();
        this.otpCaptchaToken = '';
        this.success = 'If SMS is configured, a code was sent. In dev, check server logs if Twilio is off.';
        this.resendCountdown.set(60);
        if (this.coolTimer) {
          clearInterval(this.coolTimer);
        }
        this.coolTimer = setInterval(() => {
          const c = this.resendCountdown();
          if (c <= 1) {
            this.resendCountdown.set(0);
            if (this.coolTimer) {
              clearInterval(this.coolTimer);
              this.coolTimer = null;
            }
          } else {
            this.resendCountdown.set(c - 1);
          }
        }, 1000);
      },
      error: (e: HttpErrorResponse) => {
        this.busy = false;
        this.hcaptcha.reset();
        this.otpCaptchaToken = '';
        this.otpHooked = false;
        setTimeout(() => this.hookOtpCaptcha(), 0);
        const code = e.error && e.error['code'];
        this.error = (code && OTP_MSG[code]) || e.error?.['error'] || e.message || 'Could not send code';
      },
    });
  }

  verifyOtp(): void {
    const phone = this.phoneForm.get('phone')?.value?.trim();
    const otp = this.otpForm.get('otp')?.value?.trim();
    if (!phone || !otp) {
      return;
    }
    this.error = '';
    this.busy = true;
    this.auth.verifyOtp(phone, otp).subscribe({
      next: (r) => {
        this.busy = false;
        this.auth.setUserFromResponse(r.user);
        this.stepPhoneDone.set(true);
        this.success = 'Phone verified.';
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Invalid code';
      },
    });
  }

  onImagePick(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) {
      return;
    }
    this.imageFile = f;
    this.imagePreview = URL.createObjectURL(f);
  }

  uploadImage(): void {
    if (!this.imageFile) {
      this.error = 'Choose an image first';
      return;
    }
    this.error = '';
    this.busy = true;
    this.profile.uploadImage(this.imageFile).subscribe({
      next: (r) => {
        this.busy = false;
        this.imageUrl = r.profileImageUrl;
        this.success = 'Image uploaded';
        this.load();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Upload failed';
      },
    });
  }

  profileTrustOk(s: ProfileStatus | null | undefined): boolean {
    const st = s?.verificationStatus;
    return st === 'verified' || st === 'auto_verified';
  }

  submitProfile(): void {
    this.error = '';
    this.busy = true;
    this.profile.submitVerification().subscribe({
      next: (r) => {
        this.busy = false;
        this.success =
          r.verificationStatus === 'auto_verified'
            ? 'AI check passed — your profile is auto-verified. An admin can still review your account.'
            : r.verificationStatus === 'pending'
              ? 'Submitted for manual review. We will use your profile image in the admin queue.'
              : 'Profile verification updated.';
        this.load();
        this.auth.refreshUser().subscribe();
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Submit failed';
      },
    });
  }
}
