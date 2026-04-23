import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/repositories/farmc_api.dart';
import 'core/router/app_router.dart';
import 'core/services/auth_state.dart';
import 'core/services/deep_link_bootstrap.dart';
import 'core/theme/app_theme.dart';

class FarmCApp extends ConsumerStatefulWidget {
  const FarmCApp({super.key});

  @override
  ConsumerState<FarmCApp> createState() => _FarmCAppState();
}

class _FarmCAppState extends ConsumerState<FarmCApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final a = ref.read(authStateProvider);
      if (a.isAuthenticated && a.user == null && a.token != null) {
        ref.read(farmCApiProvider).me().then((u) {
          if (!mounted) {
            return;
          }
          ref.read(authStateProvider.notifier).setUser(u);
        });
      }
      registerDeepLinkListeners(ref);
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(goRouterProvider);
    return MaterialApp.router(
      title: 'Farm-C AI',
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}
