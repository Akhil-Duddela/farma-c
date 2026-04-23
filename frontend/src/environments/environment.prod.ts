export const environment: {
  production: boolean;
  apiUrl: string;
  hcaptchaSiteKey: string;
  sentryDsn: string;
} = {
  production: true,
  apiUrl: 'https://farma-c.onrender.com/api',
  /** Set to your hCaptcha site key in deployment config */
  hcaptchaSiteKey: '',
  /** Sentry browser DSN from project settings (public) */
  sentryDsn: '',
};
