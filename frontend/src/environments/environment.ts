export const environment: {
  production: boolean;
  apiUrl: string;
  hcaptchaSiteKey: string;
  /** Sentry browser DSN (public); leave empty to disable */
  sentryDsn: string;
} = {
  production: false,
  apiUrl: 'http://localhost:4000/api',
  /** hCaptcha site key (public) — set in your environment; see https://www.hcaptcha.com/ */
  hcaptchaSiteKey: '',
  sentryDsn: '',
};
