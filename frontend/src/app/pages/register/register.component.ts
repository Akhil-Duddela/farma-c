import { AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { HcaptchaService } from '../../core/hcaptcha.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ERROR_MESSAGES } from '../../core/error-map';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly hcaptcha = inject(HcaptchaService);

  @ViewChild('captchaBox') captchaBox?: ElementRef<HTMLDivElement>;
  private captchaToken = '';

  error = '';
  loading = false;

  form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  get captchaEnabled(): boolean {
    return this.hcaptcha.isEnabled();
  }

  ngAfterViewInit(): void {
    if (this.captchaBox?.nativeElement && this.hcaptcha.isEnabled()) {
      void this.hcaptcha
        .mount(this.captchaBox.nativeElement, (t) => {
          this.captchaToken = t || '';
        })
        .catch(() => {
          this.error = 'Could not load security check. Refresh the page.';
        });
    }
  }

  submit(): void {
    if (this.form.invalid) return;
    if (this.captchaEnabled && !this.captchaToken) {
      this.error = 'Complete the security check (CAPTCHA) before continuing.';
      return;
    }
    this.loading = true;
    this.error = '';
    const { email, password, name } = this.form.getRawValue();
    this.auth
      .register({ email, password, name, captchaToken: this.captchaToken })
      .pipe(switchMap(() => this.auth.login(email, password)))
      .subscribe({
        next: () => {
          this.loading = false;
          this.router.navigateByUrl('/dashboard');
        },
        error: (e: HttpErrorResponse) => {
          this.loading = false;
          this.hcaptcha.reset();
          this.captchaToken = '';
          const c = e.error && e.error['code'];
          this.error =
            (c && ERROR_MESSAGES[c]) || e.error?.['error'] || e.message || 'Registration failed';
        },
      });
  }
}
