import * as Sentry from '@sentry/angular';
import { environment } from './environments/environment';

/**
 * Sentry is optional. Without DSN, the app runs unchanged.
 * Loaded from main.ts before bootstrap (must not throw).
 */
if (typeof environment.sentryDsn === 'string' && environment.sentryDsn.length > 10) {
  try {
    Sentry.init({
      dsn: environment.sentryDsn,
      environment: environment.production ? 'production' : 'development',
      tracesSampleRate: 0.2,
    });
  } catch (e) {
    console.error('[Sentry] init failed (continuing without error tracking)', e);
  }
}
