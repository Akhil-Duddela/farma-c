# Farm-C AI (Flutter)

Single codebase for **Android** and **iOS**: auth, email/phone verification, AI content, posts, Instagram/YouTube OAuth, analytics, and leaderboard. Uses **Riverpod**, **Dio**, **GoRouter**, and **flutter_secure_storage** for JWT.

## API base URL

Default in `lib/core/config/app_config.dart` is `http://10.0.2.2:4000/api` (Android emulator → host). For iOS simulator, `localhost` often works. For a **physical device**, use your machine’s LAN IP (e.g. `http://192.168.1.5:4000/api`).

Override at build time:

```bash
flutter run --dart-define=API_BASE_URL=http://YOUR_HOST:4000/api --dart-define=WEB_APP_ORIGIN=https://your-web-app.example
```

Optional: `HCAPTCHA_SITE_KEY` for phone OTP / captcha flows that expect a site key.

## HTTP (dev)

- **Android**: `android/app/src/main/res/xml/network_security_config.xml` allows cleartext to `localhost`, `127.0.0.1`, and `10.0.2.2`. Add another `<domain>` entry for your LAN IP if you test on a real device.
- **iOS**: `ios/Runner/Info.plist` includes ATS exceptions for `localhost` and `127.0.0.1`. Add a domain key for your LAN IP if needed.

Production should use **HTTPS** only; tighten or remove these exceptions for release.

## Run

```bash
cd mobile
flutter pub get
flutter run
```

## Tests

```bash
flutter analyze
flutter test
```

## Deep links / OAuth

OAuth flows open a **WebView**; the web app should redirect to `WEB_APP_ORIGIN` with query params (`ig`, `yt`) as implemented in `lib/features/accounts/oauth_webview_screen.dart`. Register the same host for **iOS associated domains** / **Android app links** if you use custom URL schemes for email verification (optional next step).
