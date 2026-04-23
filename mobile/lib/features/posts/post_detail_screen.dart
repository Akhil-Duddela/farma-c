import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/repositories/farmc_api.dart';
import '../../core/utils/ui_feedback.dart';
import 'post_list_screen.dart';

class PostDetailScreen extends ConsumerStatefulWidget {
  const PostDetailScreen({super.key, required this.postId});
  final String postId;

  @override
  ConsumerState<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends ConsumerState<PostDetailScreen> {
  var _loading = true;
  var _err = <String, dynamic>{};
  var _retrying = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
    });
    try {
      _err = await ref.read(farmCApiProvider).postErrors(widget.postId);
    } catch (e) {
      if (mounted) {
        showAppToast(context, e.toString());
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final fr = _err['failureReason'] as String? ?? '';
    final jobs = _err['jobs'] is List ? _err['jobs'] as List : const [];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Post ${widget.postId}', style: const TextStyle(fontWeight: FontWeight.w600)),
        if (fr.isNotEmpty) Text('Failure: $fr'),
        const Text('Per-platform', style: TextStyle(fontWeight: FontWeight.w500)),
        ...jobs.map(
          (j) {
            if (j is! Map) {
              return const SizedBox.shrink();
            }
            return ListTile(
              title: Text('${j['platform']}'),
              subtitle: Text('${j['error'] ?? '—'}'),
            );
          },
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _retrying
              ? null
              : () async {
                  setState(() {
                    _retrying = true;
                  });
                  try {
                    await ref.read(farmCApiProvider).retryPost(widget.postId);
                    if (!context.mounted) {
                      return;
                    }
                    showAppToast(context, 'Retry queued', error: false);
                    ref.invalidate(postListProvider);
                    context.pop();
                  } catch (e) {
                    if (!context.mounted) {
                      return;
                    }
                    showAppToast(context, e.toString());
                  } finally {
                    if (mounted) {
                      setState(() {
                        _retrying = false;
                      });
                    }
                  }
                },
          child: const Text('Retry publish'),
        ),
      ],
    );
  }
}
