import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../services/auth_state.dart';
import '../../features/shell/shell_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/register_screen.dart';
import '../../features/verification/verification_screen.dart';
import '../../features/ai/ai_enhance_screen.dart';
import '../../features/posts/post_create_screen.dart';
import '../../features/posts/post_list_screen.dart';
import '../../features/posts/post_detail_screen.dart';
import '../../features/accounts/accounts_oauth_screen.dart';
import '../../features/accounts/oauth_webview_screen.dart';
import '../../features/analytics/analytics_screen.dart';
import '../../features/leaderboard/leaderboard_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

final goRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/home',
    debugLogDiagnostics: false,
    redirect: (BuildContext context, GoRouterState state) {
      final c = ProviderScope.containerOf(context);
      final token = c.read(authStateProvider).token;
      final p = state.matchedLocation;
      final onAuth = p == '/login' || p == '/register' || p == '/oauth-web';
      if ((token == null || token.isEmpty) && !onAuth) {
        return '/login';
      }
      if (token != null && token.isNotEmpty && (p == '/login' || p == '/register')) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (c, s) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (c, s) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/oauth-web',
        builder: (c, s) {
          final u = s.uri.queryParameters['url'] ?? '';
          final t = s.uri.queryParameters['type'] ?? 'ig';
          return OAuthWebViewScreen(url: u.isNotEmpty ? Uri.decodeComponent(u) : '', type: t);
        },
      ),
      ShellRoute(
        builder: (c, s, ch) => ShellScreen(child: ch),
        routes: [
          GoRoute(
            path: '/home',
            name: 'home',
            pageBuilder: (c, s) => const NoTransitionPage(child: PostListScreen()),
          ),
          GoRoute(
            path: '/verify',
            name: 'verify',
            pageBuilder: (c, s) => const NoTransitionPage(child: VerificationScreen()),
          ),
          GoRoute(
            path: '/ai',
            name: 'ai',
            pageBuilder: (c, s) => const NoTransitionPage(child: AiEnhanceScreen()),
          ),
          GoRoute(
            path: '/create',
            name: 'create',
            pageBuilder: (c, s) => const NoTransitionPage(child: PostCreateScreen()),
          ),
          GoRoute(
            path: '/post/:id',
            name: 'post',
            pageBuilder: (c, s) {
              final id = s.pathParameters['id']!;
              return NoTransitionPage(child: PostDetailScreen(postId: id));
            },
          ),
          GoRoute(
            path: '/accounts',
            name: 'accounts',
            pageBuilder: (c, s) => const NoTransitionPage(child: AccountsOAuthScreen()),
          ),
          GoRoute(
            path: '/analytics',
            name: 'analytics',
            pageBuilder: (c, s) => const NoTransitionPage(child: AnalyticsScreen()),
          ),
          GoRoute(
            path: '/leaderboard',
            name: 'leaderboard',
            pageBuilder: (c, s) => const NoTransitionPage(child: LeaderboardScreen()),
          ),
        ],
      ),
    ],
  );
});
