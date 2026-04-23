import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/repositories/farmc_api.dart';
import '../../core/services/deep_link_provider.dart';
import '../../core/utils/ui_feedback.dart';

class AccountsOAuthScreen extends ConsumerStatefulWidget {
  const AccountsOAuthScreen({super.key});

  @override
  ConsumerState<AccountsOAuthScreen> createState() => _AccountsOAuthScreenState();
}

class _AccountsOAuthScreenState extends ConsumerState<AccountsOAuthScreen> {
  Map<String, dynamic> _s = {};
  var _load = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _load = true;
    });
    try {
      _s = await ref.read(farmCApiProvider).accountsStatus();
    } catch (e) {
      if (mounted) {
        showAppToast(context, e.toString());
      }
    } finally {
      if (mounted) {
        setState(() {
          _load = false;
        });
      }
    }
  }

  Future<void> _openInsta() async {
    try {
      final u = await ref.read(farmCApiProvider).instagramAuthUrl();
      if (!context.mounted) {
        return;
      }
      if (u.isEmpty) {
        showAppToast(context, 'No auth URL');
        return;
      }
      await context.push<String>(
        '/oauth-web?url=${Uri.encodeComponent(u)}&type=ig',
      );
      if (!context.mounted) {
        return;
      }
      await _refresh();
    } catch (e) {
      if (!context.mounted) {
        return;
      }
      showAppToast(context, e.toString());
    }
  }

  Future<void> _openYt() async {
    try {
      final u = await ref.read(farmCApiProvider).youtubeAuthUrl();
      if (!context.mounted) {
        return;
      }
      if (u.isEmpty) {
        showAppToast(context, 'No auth URL');
        return;
      }
      await context.push<String>(
        '/oauth-web?url=${Uri.encodeComponent(u)}&type=yt',
      );
      if (!context.mounted) {
        return;
      }
      await _refresh();
    } catch (e) {
      if (!context.mounted) {
        return;
      }
      showAppToast(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<int>(accountsOauthRefreshTriggerProvider, (prev, next) {
      if (next > (prev ?? 0)) {
        _refresh();
      }
    });
    ref.listen<String?>(accountsOauthMessageProvider, (prev, next) {
      if (next == null || next.isEmpty) {
        return;
      }
      if (!context.mounted) {
        return;
      }
      showAppToast(context, next, error: next.startsWith('Error') || next.startsWith('error'));
      ref.read(accountsOauthMessageProvider.notifier).state = null;
    });
    if (_load) {
      return const Center(child: CircularProgressIndicator());
    }
    final ig = _s['instagram'] as Map? ?? {};
    final yt = _s['youtube'] as Map? ?? {};
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Connected accounts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            title: const Text('Instagram'),
            subtitle: Text(
              (ig['connected'] == true)
                  ? '@${ig['username'] ?? ig['igUserId'] ?? 'connected'}'
                  : 'Not connected',
            ),
            trailing: FilledButton(
              onPressed: _openInsta,
              child: Text((ig['connected'] == true) ? 'Reconnect' : 'Connect'),
            ),
          ),
        ),
        Card(
          child: ListTile(
            title: const Text('YouTube'),
            subtitle: Text(
              (yt['connected'] == true) ? (yt['channelName'] as String? ?? 'Connected') : 'Not connected',
            ),
            trailing: FilledButton(
              onPressed: _openYt,
              child: Text((yt['connected'] == true) ? 'Reconnect' : 'Connect'),
            ),
          ),
        ),
        TextButton(
          onPressed: _refresh,
          child: const Text('Refresh status'),
        ),
      ],
    );
  }
}
