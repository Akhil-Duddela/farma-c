import '../config/app_config.dart';

/// What to do with an incoming [Uri] (Universal Link or custom scheme).
sealed class ParsedDeepLink {
  const ParsedDeepLink();
}

class VerifyEmailDeepLink extends ParsedDeepLink {
  const VerifyEmailDeepLink({this.token, this.result, this.reason});

  /// From email: `?token=`
  final String? token;

  /// After API redirect: `?result=ok|error`
  final String? result;

  final String? reason;
}

/// OAuth return (same query as `/dashboard?ig=…` / `yt=…` from backend).
class OAuthResultDeepLink extends ParsedDeepLink {
  const OAuthResultDeepLink(this.uri);
  final Uri uri;
}

/// Unrecognized; safe to ignore.
class UnknownDeepLink extends ParsedDeepLink {
  const UnknownDeepLink();
}

/// Parse HTTPS (Universal Links) and `farmcai://` URIs.
ParsedDeepLink parseDeepLinkUri(Uri u) {
  final scheme = u.scheme.toLowerCase();
  final custom = AppConfig.deepLinkCustomScheme.toLowerCase();
  if (scheme == custom) {
    return _fromPathAndQuery(u, isCustom: true);
  }
  if (scheme == 'https' || scheme == 'http') {
    final ourHost = AppConfig.webHostForLinks.toLowerCase();
    if (u.host.toLowerCase() == ourHost) {
      return _fromPathAndQuery(u, isCustom: false);
    }
  }
  return const UnknownDeepLink();
}

ParsedDeepLink _fromPathAndQuery(Uri u, {required bool isCustom}) {
  var path = u.path;
  if (isCustom) {
    // farmcai://verify-email?token=  → host is "verify-email", path is empty
    final host = u.host;
    if (host == 'verify-email' || host.endsWith('verify-email')) {
      return VerifyEmailDeepLink(
        token: u.queryParameters['token'],
        result: u.queryParameters['result'],
        reason: u.queryParameters['reason'],
      );
    }
    if (host == 'oauth' || host == 'dashboard' || path.contains('oauth') || path.contains('dashboard')) {
      return OAuthResultDeepLink(u);
    }
  }
  if (path.isEmpty && u.hasQuery) {
    path = '/';
  }
  if (path.contains('verify-email')) {
    return VerifyEmailDeepLink(
      token: u.queryParameters['token'],
      result: u.queryParameters['result'],
      reason: u.queryParameters['reason'],
    );
  }
  if (path == '/oauth' || path == 'oauth' || path.contains('/oauth')) {
    return OAuthResultDeepLink(u);
  }
  if (path.contains('dashboard') || u.queryParameters.containsKey('ig') || u.queryParameters.containsKey('yt')) {
    return OAuthResultDeepLink(u);
  }
  return const UnknownDeepLink();
}
