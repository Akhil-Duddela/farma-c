import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuth = req.url.includes('/auth/login') || req.url.includes('/auth/register');
      if (err.status === 401 && !isAuth && token) {
        auth.logout();
      }
      return throwError(() => err);
    })
  );
};
