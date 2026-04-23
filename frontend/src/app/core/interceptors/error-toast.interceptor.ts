import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/** Surface API error codes to global toast (non-login, non-get noise reduced) */
export const errorToastInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const e = err.error;
      if (e && typeof e === 'object' && e['code'] && e['error'] && err.status && err.status >= 400) {
        const method = (req.method || 'GET').toUpperCase();
        if (
          req.url.includes('/auth/login')
          || req.url.includes('/auth/register')
          || req.url.includes('/auth/send-otp')
          || req.url.includes('/auth/verify-otp')
        ) {
          return throwError(() => err);
        }
        if (method === 'GET' && err.status < 500) {
          return throwError(() => err);
        }
        if (e['code'] && typeof e['code'] === 'string') {
          toast.forApiCode(e['code'], e['error']);
        } else {
          toast.showError(String(e['error'] || err.message));
        }
      }
      return throwError(() => err);
    })
  );
};
