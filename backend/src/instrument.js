/**
 * Load before any other application modules (see server.js) so Sentry can instrument them.
 * If Sentry is unavailable, the app must still start.
 */
try {
  const dsn = (process.env.SENTRY_DSN || '').trim();
  if (dsn) {
    // eslint-disable-next-line global-require
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.GIT_SHA || process.env.RENDER_GIT_COMMIT || undefined,
      tracesSampleRate: Math.min(1, Math.max(0, parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.2') || 0.2)),
      integrations: [Sentry.expressIntegration()],
    });
  }
} catch (e) {
  // Do not take down the process if Sentry fails
  // eslint-disable-next-line no-console
  console.error('[instrument] Sentry init failed (continuing)', e && e.message ? e.message : e);
}
