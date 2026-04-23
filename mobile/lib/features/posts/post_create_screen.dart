import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/repositories/farmc_api.dart';
import '../../core/providers/post_draft.dart';
import '../../core/utils/ui_feedback.dart';
import 'post_list_screen.dart';

class PostCreateScreen extends ConsumerStatefulWidget {
  const PostCreateScreen({super.key});

  @override
  ConsumerState<PostCreateScreen> createState() => _PostCreateScreenState();
}

class _PostCreateScreenState extends ConsumerState<PostCreateScreen> {
  final _cap = TextEditingController();
  final _media = TextEditingController();
  var _ig = true;
  var _yt = false;
  var _mediaType = 'reel';
  var _saving = false;
  DateTime? _when;

  @override
  void initState() {
    super.initState();
    final d = ref.read(postCaptionDraftProvider);
    if (d != null && d.isNotEmpty) {
      _cap.text = d;
      ref.read(postCaptionDraftProvider.notifier).state = null;
    }
  }

  @override
  void dispose() {
    _cap.dispose();
    _media.dispose();
    super.dispose();
  }

  bool get _validUrl {
    final u = _media.text.trim();
    return u.startsWith('https://') && u.length > 8;
  }

  Future<void> _submit({bool schedule = false}) async {
    if (!_validUrl) {
      showAppToast(context, 'Enter a public HTTPS video URL (mp4) for Shorts / Reels');
      return;
    }
    if (_yt && !_ig && _mediaType == 'image') {
      showAppToast(context, 'YouTube needs video or reel');
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(farmCApiProvider).createPostV2(
            content: _cap.text,
            caption: _cap.text,
            mediaUrl: _media.text.trim(),
            mediaType: _yt ? 'reel' : _mediaType,
            instagram: _ig,
            youtube: _yt,
            scheduledAt: schedule && _when != null ? _when!.toUtc().toIso8601String() : null,
            status: (schedule && _when != null) ? 'scheduled' : 'publishing',
          );
      ref.invalidate(postListProvider);
      if (mounted) {
        showAppToast(context, 'Post created', error: false);
        context.go('/home');
      }
    } catch (e) {
      if (mounted) {
        showAppToast(context, e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('New post', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          controller: _cap,
          minLines: 2,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Caption / content',
            alignLabelWithHint: true,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _media,
          decoration: const InputDecoration(
            labelText: 'Media URL (https, public .mp4 for video)',
            hintText: 'https://.../video.mp4',
          ),
        ),
        const SizedBox(height: 8),
        InputDecorator(
          decoration: const InputDecoration(
            labelText: 'Media type',
            border: OutlineInputBorder(),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _mediaType,
              isExpanded: true,
              items: const [
                DropdownMenuItem(value: 'image', child: Text('image')),
                DropdownMenuItem(value: 'reel', child: Text('reel / video')),
                DropdownMenuItem(value: 'video', child: Text('video')),
                DropdownMenuItem(value: 'carousel', child: Text('carousel')),
              ],
              onChanged: (v) {
                if (v != null) {
                  setState(() => _mediaType = v);
                }
              },
            ),
          ),
        ),
        SwitchListTile(
          value: _ig,
          onChanged: (v) => setState(() => _ig = v),
          title: const Text('Instagram'),
        ),
        SwitchListTile(
          value: _yt,
          onChanged: (v) => setState(() => _yt = v),
          title: const Text('YouTube Shorts'),
        ),
        ListTile(
          title: const Text('Schedule (optional)'),
          subtitle: Text(_when == null ? 'Post now' : _when.toString()),
          trailing: FilledButton.tonal(
            onPressed: () async {
              final d = await showDatePicker(
                context: context,
                initialDate: DateTime.now().add(const Duration(hours: 1)),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 365)),
              );
              if (d == null || !context.mounted) {
                return;
              }
              if (!context.mounted) {
                return;
              }
              final t = await showTimePicker(
                context: context,
                initialTime: TimeOfDay.fromDateTime(DateTime.now().add(const Duration(hours: 1))),
              );
              if (t == null) {
                return;
              }
              setState(
                () => _when = DateTime(d.year, d.month, d.day, t.hour, t.minute),
              );
            },
            child: const Text('Pick'),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving ? null : () => _submit(schedule: false),
          child: const Text('Publish now'),
        ),
        FilledButton.tonal(
          onPressed: _saving ? null : () => _submit(schedule: true),
          child: const Text('Schedule (uses date above)'),
        ),
        const Text(
          'Full publishing requires a verified account on the server.',
          style: TextStyle(fontSize: 12, color: Colors.blueGrey),
        ),
      ],
    );
  }
}
