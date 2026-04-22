import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  error = '';
  loading = false;

  form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';
    const { email, password, name } = this.form.getRawValue();
    this.auth
      .register({ email, password, name })
      .pipe(switchMap(() => this.auth.login(email, password)))
      .subscribe({
        next: () => {
          this.loading = false;
          this.router.navigateByUrl('/dashboard');
        },
        error: (e) => {
          this.loading = false;
          this.error = e.error?.error || 'Registration failed';
        },
      });
  }
}
