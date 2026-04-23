import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/repositories/farmc_api.dart';
import '../../core/models/post_model.dart';

final postListProvider = FutureProvider<List<PostModel>>((ref) {
  return ref.read(farmCApiProvider).listPosts(limit: 50);
});

class PostListScreen extends ConsumerWidget {
  const PostListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(postListProvider);
    return a.when(
      data: (list) {
        if (list.isEmpty) {
          return const Center(
            child: Text('No posts yet. Create one from the Post tab.'),
          );
        }
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(postListProvider);
            await ref.read(postListProvider.future);
          },
          child: ListView.builder(
            itemCount: list.length,
            itemBuilder: (c, i) {
              final p = list[i];
              return ListTile(
                title: Text(
                  p.caption.isNotEmpty ? p.caption : '(no caption)',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text('${p.status}  ·  ${p.mediaType}'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  context.push('/post/${p.id}');
                },
              );
            },
          ),
        );
      },
      error: (e, _) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Error: $e', textAlign: TextAlign.center),
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
    );
  }
}
