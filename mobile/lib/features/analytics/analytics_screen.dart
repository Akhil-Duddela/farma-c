import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/repositories/farmc_api.dart';
import '../../core/utils/ui_feedback.dart';

final _analyticsP = FutureProvider((ref) => ref.read(farmCApiProvider).analytics());

class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(_analyticsP);
    return a.when(
      data: (d) {
        final creator = d['creator'] as Map? ?? {};
        final pl = d['platforms'] as Map? ?? {};
        final act = d['activity'] is Map
            ? Map<String, dynamic>.from(d['activity'] as Map)
            : <String, dynamic>{};
        final weekly = (act['weekly'] as List? ?? <dynamic>[])
            .map((e) => e.toString())
            .toList();
        final rates = d['rates'] as Map? ?? {};
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Analytics', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(
              'Total attempts: ${creator['totalPostAttempts'] ?? 0} · success ${creator['successfulPosts'] ?? 0} · failed ${creator['failedPosts'] ?? 0}',
            ),
            Text('Success ~ ${rates['successRatePercent'] ?? 0}% · AI uses: ${creator['aiUsageCount'] ?? 0}'),
            const SizedBox(height: 12),
            if (pl['instagram'] is Map) Text('IG posted ${(pl['instagram'] as Map)['posted'] ?? 0} / failed ${(pl['instagram'] as Map)['failed'] ?? 0}'),
            if (pl['youtube'] is Map) Text('YT posted ${(pl['youtube'] as Map)['posted'] ?? 0} / failed ${(pl['youtube'] as Map)['failed'] ?? 0}'),
            if (weekly.isNotEmpty) ...[const Text('\n14-day activity'), for (final w in weekly) Text(w)],
            const SizedBox(height: 20),
            FilledButton.tonal(
              onPressed: () {
                ref.invalidate(_analyticsP);
                showAppToast(context, 'Refreshed', error: false);
              },
              child: const Text('Refresh'),
            ),
          ],
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
