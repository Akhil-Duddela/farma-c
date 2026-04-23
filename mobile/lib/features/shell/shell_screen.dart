import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/services/auth_state.dart';

/// Bottom navigation; active route from [GoRouterState.location].
class ShellScreen extends ConsumerWidget {
  const ShellScreen({super.key, required this.child});
  final Widget child;

  int _ix(String path) {
    if (path.startsWith('/ai')) return 1;
    if (path.startsWith('/create')) return 2;
    if (path.startsWith('/verify')) return 3;
    if (path.startsWith('/leaderboard')) return 4;
    return 0; // /home, /post/..., /accounts, /analytics
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loc = GoRouterState.of(context).uri.toString();
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _ix(loc),
        onDestinationSelected: (i) {
          if (i == 0) {
            context.go('/home');
          } else if (i == 1) {
            context.go('/ai');
          } else if (i == 2) {
            context.go('/create');
          } else if (i == 3) {
            context.go('/verify');
          } else if (i == 4) {
            context.go('/leaderboard');
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.auto_awesome_outlined),
            selectedIcon: Icon(Icons.auto_awesome),
            label: 'AI',
          ),
          NavigationDestination(
            icon: Icon(Icons.add_circle_outline),
            selectedIcon: Icon(Icons.add_circle),
            label: 'Post',
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_user_outlined),
            selectedIcon: Icon(Icons.verified_user),
            label: 'Verify',
          ),
          NavigationDestination(
            icon: Icon(Icons.leaderboard_outlined),
            selectedIcon: Icon(Icons.leaderboard),
            label: 'Ranks',
          ),
        ],
      ),
      appBar: AppBar(
        title: const Text('Farm-C AI'),
        actions: [
          IconButton(
            onPressed: () => context.push('/accounts'),
            icon: const Icon(Icons.link),
            tooltip: 'Connect accounts',
          ),
          IconButton(
            onPressed: () => context.push('/analytics'),
            icon: const Icon(Icons.analytics_outlined),
            tooltip: 'Analytics',
          ),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'out') {
                await ref.read(authStateProvider.notifier).clear();
                if (context.mounted) {
                  context.go('/login');
                }
              }
            },
            itemBuilder: (c) {
              return [
                const PopupMenuItem(
                  value: 'out',
                  child: Text('Log out'),
                ),
              ];
            },
          ),
        ],
      ),
    );
  }
}
