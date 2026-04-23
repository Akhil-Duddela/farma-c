import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/config/app_config.dart';
import '../../core/repositories/farmc_api.dart';
import '../../core/utils/ui_feedback.dart';

/// OAuth: backend redirects to [AppConfig.webAppOrigin]/dashboard?ig=...|yt=...
class OAuthWebViewScreen extends ConsumerStatefulWidget {
  const OAuthWebViewScreen({super.key, required this.url, this.type = 'ig'});

  final String url;
  final String type;

  @override
  ConsumerState<OAuthWebViewScreen> createState() => _OAuthWebViewScreenState();
}

class _OAuthWebViewScreenState extends ConsumerState<OAuthWebViewScreen> {
  late final WebViewController _c;
  var _progress = 0;

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) => setState(() => _progress = p),
          onNavigationRequest: (req) {
            return NavigationDecision.navigate;
          },
          onPageFinished: (u) {
            _handleUrl(u);
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  void _handleUrl(String u) {
    if (!context.mounted) {
      return;
    }
    final base = AppConfig.webAppOrigin.replaceAll(RegExp(r'/$'), '');
    if (!u.startsWith(base) && !u.contains('dashboard')) {
      return;
    }
    final uri = Uri.tryParse(u);
    if (uri == null) {
      return;
    }
    final p = uri.queryParameters;
    if (widget.type == 'ig' || p.containsKey('ig')) {
      if (p['ig'] == 'connected') {
        showAppToast(context, 'Instagram connected', error: false);
        context.pop('ok');
        return;
      }
      if (p['ig'] == 'choose' && p['key'] != null) {
        _pickInsta(p['key']!);
        return;
      }
      if (p['ig'] == 'error') {
        showAppToast(context, 'Error: ${p['reason'] ?? 'unknown'}');
        context.pop();
      }
    }
    if (widget.type == 'yt' || p.containsKey('yt')) {
      if (p['yt'] == 'connected') {
        showAppToast(context, 'YouTube connected', error: false);
        context.pop('ok');
        return;
      }
      if (p['yt'] == 'choose' && p['key'] != null) {
        _pickYt(p['key']!);
        return;
      }
      if (p['yt'] == 'error') {
        showAppToast(context, 'Error: ${p['reason'] ?? 'unknown'}');
        context.pop();
      }
    }
  }

  Future<void> _pickInsta(String key) async {
    final api = ref.read(farmCApiProvider);
    final d = await api.igOauthPending(key);
    if (!context.mounted) {
      return;
    }
    final acc = d['accounts'];
    if (acc is! List || acc.isEmpty) {
      showAppToast(context, 'No accounts to pick from');
      context.pop();
      return;
    }
    String? id;
    await showModalBottomSheet<void>(
      context: context,
      builder: (c) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: acc.map<Widget>((a) {
              if (a is! Map) {
                return const SizedBox.shrink();
              }
              return ListTile(
                title: Text('${a['username'] ?? a['accountId'] ?? a}'),
                onTap: () {
                  id = a['accountId']?.toString();
                  Navigator.of(c).pop();
                },
              );
            }).toList(),
          ),
        );
      },
    );
    if (id == null) {
      return;
    }
    if (!context.mounted) {
      return;
    }
    try {
      await ref.read(farmCApiProvider).selectInstagram(
            accountId: id!,
            pickKey: key,
          );
      if (!context.mounted) {
        return;
      }
      showAppToast(context, 'Account linked', error: false);
      context.pop('ok');
    } catch (e) {
      if (!context.mounted) {
        return;
      }
      showAppToast(context, e.toString());
    }
  }

  Future<void> _pickYt(String key) async {
    final api = ref.read(farmCApiProvider);
    final d = await api.ytOauthPending(key);
    if (!context.mounted) {
      return;
    }
    final ch = d['channels'];
    if (ch is! List || ch.isEmpty) {
      showAppToast(context, 'No channels in pick list');
      context.pop();
      return;
    }
    String? cid;
    await showModalBottomSheet<void>(
      context: context,
      builder: (c) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: ch.map<Widget>((x) {
              if (x is! Map) {
                return const SizedBox.shrink();
              }
              return ListTile(
                title: Text('${x['title'] ?? x['channelId'] ?? x}'),
                onTap: () {
                  cid = x['channelId'] != null
                      ? x['channelId'].toString()
                      : x['id']?.toString();
                  Navigator.of(c).pop();
                },
              );
            }).toList(),
          ),
        );
      },
    );
    if (cid == null) {
      return;
    }
    if (!context.mounted) {
      return;
    }
    try {
      await ref.read(farmCApiProvider).selectYoutubeChannel(
            pickKey: key,
            channelId: cid!,
          );
      if (!context.mounted) {
        return;
      }
      showAppToast(context, 'Channel linked', error: false);
      context.pop('ok');
    } catch (e) {
      if (!context.mounted) {
        return;
      }
      showAppToast(context, e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Connect account'),
        actions: [
          IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_progress < 100)
            LinearProgressIndicator(value: _progress / 100.0)
          else
            const SizedBox.shrink(),
          Expanded(
            child: WebViewWidget(controller: _c),
          ),
        ],
      ),
    );
  }
}
