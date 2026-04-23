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

## Deep links (email + OAuth)

The app uses **`app_links`**: cold start and warm start URIs are handled in `lib/core/services/deep_link_bootstrap.dart`.

- **Universal Links (HTTPS)**: `https://<FRONTEND_HOST>/verify-email?…` and `https://<FRONTEND_HOST>/oauth?ig=…|yt=…` (legacy `/dashboard?` still parsed).
- **Custom scheme**: `farmcai://verify-email?token=…`, `farmcai://oauth?ig=…` (override with `--dart-define=DEEPLINK_CUSTOM_SCHEME=…`).

`WEB_APP_ORIGIN` / `DEEPLINK_HOST` must match the **same host** you ship in the manifest (Android) and **Associated Domains** (iOS) for verification to be consistent.

| Build define | Role |
|--------------|------|
| `WEB_APP_ORIGIN` | Must match the SPA; used to match incoming HTTPS host |
| `DEEPLINK_HOST` | Optional; if set, must equal the host in `WEB_APP_ORIGIN` |

**Android**: `AndroidManifest.xml` — `farma-c-ui.onrender.com` and `https` paths. Replace the host in source when you use your own domain, then publish `/.well-known/assetlinks.json` (see `frontend/public/.well-known/`) and add your app’s **release SHA-256** fingerprint.

**iOS**: `Info.plist` URL scheme `farmcai` + `Runner.entitlements` for `applinks:` — replace the domain/Team ID in `public/.well-known/apple-app-site-association` and in Xcode **Signing & Capabilities** → **Associated Domains** if needed.

OAuth in WebView: callbacks land on `/oauth?…` on the SPA; the in-app webview and native deep link handler both recognize that path and legacy `dashboard?…`.
