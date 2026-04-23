import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Bumped when a deep link requests accounts screen refresh.
final accountsOauthRefreshTriggerProvider = StateProvider<int>((ref) => 0);

/// One-shot message for [AccountsOAuthScreen] after deep link.
final accountsOauthMessageProvider = StateProvider<String?>((ref) => null);
