import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileVerificationService, ProfileStatus } from '../../core/services/profile-verification.service';

@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './verification.component.html',
  styleUrl: './verification.component.scss',
})
export class VerificationComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly profile = inject(ProfileVerificationService);
  private readonly fb = inject(FormBuilder);

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

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.profile.getStatus().subscribe({
      next: (s) => {
        this.status = s;
        this.stepEmailDone.set(s.emailVerified);
        this.stepPhoneDone.set(s.phoneVerified);
        this.stepProfileDone.set(s.verificationStatus === 'verified');
        this.imageUrl = s.profileImageUrl || null;
        this.auth.refreshUser().subscribe();
      },
      error: () => (this.error = 'Could not load status'),
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
    this.error = '';
    this.success = '';
    this.busy = true;
    this.auth.sendOtp(v).subscribe({
      next: () => {
        this.busy = false;
        this.otpSent = true;
        this.success = 'If SMS is configured, a code was sent. In dev, check server logs if Twilio is off.';
      },
      error: (e) => {
        this.busy = false;
        this.error = e.error?.error || 'Could not send code';
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

  submitProfile(): void {
    this.error = '';
    this.busy = true;
    this.profile.submitVerification().subscribe({
      next: () => {
        this.busy = false;
        this.success = 'Submitted for review. You will be notified when approved.';
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
