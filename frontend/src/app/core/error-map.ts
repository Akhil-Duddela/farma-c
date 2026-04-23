/**
 * User-facing copy for API `code` values (see backend errorHandler).
 * Used by ToastService; forms may import for inline errors.
 */
export const ERROR_MESSAGES: Record<string, string> = {
  CAPTCHA_REQUIRED: 'Complete the security check first.',
  OTP_RATE_LIMIT: 'Too many OTP attempts. Please wait and try again later.',
  OTP_COOLDOWN: 'Too many attempts. Please try again later.',
  CAPTCHA_FAILED: 'Captcha verification failed. Please try again.',
  CAPTCHA_NOT_CONFIGURED: 'Verification is not available (server).',
  CAPTCHA_SERVICE_UNAVAILABLE: 'Security check service is unavailable. Try again in a few minutes.',
  TOKEN_EXPIRED: 'Session or link expired. Reconnect or request a new code.',
  PUBLISH_FAILED: 'Publishing failed. Please retry.',
  ACCOUNT_DISCONNECTED: 'A connected account was lost. Reconnect in Settings, then retry.',
  FRAUD_RESTRICTION: 'This account is restricted. Contact support.',
  OTP_REDIS_UNAVAILABLE: 'SMS verification is temporarily unavailable. Try again shortly.',
};
