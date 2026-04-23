/// Set at build: `--dart-define=API_BASE_URL=https://api.example.com/api`
/// - Android emulator → host: use `http://10.0.2.2:4000/api`
/// - iOS simulator → `http://localhost:4000/api`
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000/api',
  );

  /// hCaptcha site key (public) — if empty, send OTP with empty [captchaToken] (dev)
  static const String hcaptchaSiteKey = String.fromEnvironment(
    'HCAPTCHA_SITE_KEY',
    defaultValue: '',
  );

  /// Web app origin (OAuth redirects here after Google/Meta) — used to detect success in WebView
  static const String webAppOrigin = String.fromEnvironment(
    'WEB_APP_ORIGIN',
    defaultValue: 'https://farma-c-ui.onrender.com',
  );

  /// Custom URL scheme for in-app / WebView "Open app" (e.g. `farmcai://link/…`)
  static const String deepLinkCustomScheme = String.fromEnvironment(
    'DEEPLINK_CUSTOM_SCHEME',
    defaultValue: 'farmcai',
  );

  /// If set, must match the HTTPS host in [webAppOrigin] (without scheme). Unset = derive from [webAppOrigin]
  static const String deepLinkWebHost = String.fromEnvironment('DEEPLINK_HOST', defaultValue: '');

  static String get webHostForLinks {
    final s = deepLinkWebHost.isNotEmpty ? deepLinkWebHost : Uri.parse(webAppOrigin).host;
    return s;
  }
}
