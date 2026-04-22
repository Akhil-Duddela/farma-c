import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  error = '';
  loading = false;

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: (e: HttpErrorResponse) => {
        this.loading = false;
        if (e.status === 400 && e.error?.errors?.length) {
          this.error = e.error.errors[0]?.msg || 'Check email and password format.';
        } else if (e.status === 401) {
          this.error =
            'Invalid email or password. If you are using Docker, this stack has its own database — register a new account for this environment, or use the same data source as when you created the user.';
        } else {
          this.error = (e.error as { error?: string })?.error || 'Login failed';
        }
      },
      complete: () => (this.loading = false),
    });
  }
}
