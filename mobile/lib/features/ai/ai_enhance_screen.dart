import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/repositories/farmc_api.dart';
import '../../core/utils/ui_feedback.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers/post_draft.dart';

class AiEnhanceScreen extends ConsumerStatefulWidget {
  const AiEnhanceScreen({super.key});

  @override
  ConsumerState<AiEnhanceScreen> createState() => _AiEnhanceScreenState();
}

class _AiEnhanceScreenState extends ConsumerState<AiEnhanceScreen> {
  final _input = TextEditingController();
  Map<String, dynamic>? _result;
  var _loading = false;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    final t = _input.text.trim();
    if (t.isEmpty) {
      return;
    }
    setState(() {
      _loading = true;
      _result = null;
    });
    try {
      final o = await ref.read(farmCApiProvider).enhance(t);
      if (mounted) {
        setState(() => _result = o);
      }
    } catch (e) {
      if (mounted) {
        showAppToast(context, e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _fillPost(String caption) {
    if (!mounted) {
      return;
    }
    ref.read(postCaptionDraftProvider.notifier).state = caption;
    context.go('/create');
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _input,
          minLines: 3,
          maxLines: 8,
          decoration: const InputDecoration(
            labelText: 'Your content idea (for AI pack)',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _loading ? null : _run,
          child: _loading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Generate content pack'),
        ),
        if (_result != null) ...[
          const SizedBox(height: 20),
          _row('Title', _result!['title']),
          _row('Caption', _result!['caption']),
          _row('Script', _result!['script']),
          _row('Description', _result!['description']),
          if (_result!['hashtags'] is List) Text('Hashtags: ${(_result!['hashtags'] as List).map((e) => '#$e').join(' ')}'),
          const SizedBox(height: 12),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: () {
                  final c = '${_result!['caption'] ?? ''}';
                  if (c.isNotEmpty) {
                    Clipboard.setData(ClipboardData(text: c));
                    showAppToast(context, 'Caption copied', error: false);
                  }
                },
                icon: const Icon(Icons.copy),
                label: const Text('Copy caption'),
              ),
              const SizedBox(width: 8),
              FilledButton.tonal(
                onPressed: () {
                  _fillPost('${_result!['caption'] ?? _result!['title'] ?? ''}');
                },
                child: const Text('Use for new post'),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _row(String t, Object? v) {
    if (v == null || (v is String && v.isEmpty)) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t, style: const TextStyle(fontWeight: FontWeight.w600)),
          SelectableText(
            v.toString(),
            style: const TextStyle(height: 1.3),
          ),
        ],
      ),
    );
  }
}
