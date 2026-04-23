import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/repositories/farmc_api.dart';

final _lb = FutureProvider(
  (ref) => ref.read(farmCApiProvider).leaderboard(limit: 50),
);

class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(_lb);
    return a.when(
      data: (d) {
        final items = d['items'] as List? ?? [];
        return ListView.separated(
          itemCount: items.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (c, i) {
            final r = items[i] is Map
                ? Map<String, dynamic>.from(items[i] as Map)
                : <String, dynamic>{};
            final badges = r['badges'] is List
                ? (r['badges'] as List).map((e) => e.toString()).toList()
                : <String>[];
            return ListTile(
              leading: CircleAvatar(
                child: Text('${(r['rank'] ?? (i + 1))}'),
              ),
              title: Text('${r['name'] ?? '—'}  ${r['isYou'] == true ? '(You)' : ''}'),
              subtitle: Text('posts ${r['successfulPosts'] ?? 0} · level ${r['level'] ?? ''}'),
              trailing: badges.isEmpty
                  ? null
                  : Text(badges.take(2).join(', '), style: const TextStyle(fontSize: 11)),
            );
          },
        );
      },
      error: (e, _) {
        return Center(
          child: Text('Error: $e', textAlign: TextAlign.center),
        );
      },
      loading: () {
        return const Center(child: CircularProgressIndicator());
      },
    );
  }
}
