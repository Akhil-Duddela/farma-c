import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/**
 * Require logged-in user with role admin. Refreshes /me if the role is not yet in memory.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.parseUrl('/login');
  }
  const go = () => (auth.user()?.role === 'admin' ? true : router.parseUrl('/dashboard'));
  if (auth.user()) {
    return go();
  }
  return firstValueFrom(auth.refreshUser().pipe(map(() => go())));
};
