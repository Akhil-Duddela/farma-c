import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../router/app_router.dart';
import 'auth_state.dart';
import 'deep_link_provider.dart';
import 'parsed_deep_link.dart';

/// Subscribes to [AppLinks] (cold + warm start). Must be called once with a long-lived [ProviderContainer] or [WidgetRef].
void registerDeepLinkListeners(WidgetRef ref) {
  final appLinks = AppLinks();
  unawaited(_handleInitialLink(appLinks, ref));
  appLinks.uriLinkStream.listen(
    (uri) => _dispatchUri(ref, uri),
    onError: (Object e) {
      if (kDebugMode) {
        debugPrint('AppLinks stream error: $e');
      }
    },
  );
}

Future<void> _handleInitialLink(AppLinks appLinks, WidgetRef ref) async {
  try {
    final u = await appLinks.getInitialAppLink();
    if (u == null) {
      return;
    }
    // Router must be ready before we push
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _dispatchUri(ref, u);
  } catch (e) {
    if (kDebugMode) {
      debugPrint('getInitialAppLink failed: $e');
    }
  }
}

void _dispatchUri(WidgetRef ref, Uri uri) {
  final p = parseDeepLinkUri(uri);
  final router = ref.read(goRouterProvider);
  if (p is VerifyEmailDeepLink) {
    final q = <String, String>{};
    if (p.token != null && p.token!.isNotEmpty) {
      q['token'] = p.token!;
    } else if (p.result != null) {
      q['result'] = p.result!;
      if (p.reason != null) {
        q['reason'] = p.reason!;
      }
    }
    final loc = '/verify-callback?${Uri(queryParameters: q).query}';
    // ignore: discarded_futures
    router.push(loc);
    return;
  }
  if (p is OAuthResultDeepLink) {
    if (!_hasAuthToken(ref)) {
      router.push('/login?message=${Uri.encodeComponent('Sign in to finish connecting your account.')}');
      return;
    }
    ref.read(accountsOauthRefreshTriggerProvider.notifier).state += 1;
    final m = p.uri;
    if (m.queryParameters['ig'] == 'connected' || m.queryParameters['yt'] == 'connected') {
      // ignore: discarded_futures
      ref.read(accountsOauthMessageProvider.notifier).state = 'Account connected';
    } else if (m.queryParameters['ig'] == 'error' || m.queryParameters['yt'] == 'error') {
      final r = m.queryParameters['reason'] ?? 'unknown';
      // ignore: discarded_futures
      ref.read(accountsOauthMessageProvider.notifier).state = 'Error: $r';
    } else {
      // choose flow — use WebView; deep link to accounts
      // ignore: discarded_futures
      ref.read(accountsOauthMessageProvider.notifier).state = 'Continue in the app to select an account';
    }
    router.go('/accounts', extra: {'fromDeepLink': true});
  }
}

bool _hasAuthToken(WidgetRef ref) {
  final t = ref.read(authStateProvider).token;
  return t != null && t.isNotEmpty;
}

