import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/repositories/farmc_api.dart';
import '../../core/utils/ui_feedback.dart';

class VerifyCallbackScreen extends ConsumerStatefulWidget {
  const VerifyCallbackScreen({
    super.key,
    this.token,
    this.result,
    this.reason,
  });

  final String? token;
  final String? result;
  final String? reason;

  @override
  ConsumerState<VerifyCallbackScreen> createState() => _VerifyCallbackScreenState();
}

class _VerifyCallbackScreenState extends ConsumerState<VerifyCallbackScreen> {
  var _phase = 'loading';
  var _err = '';
  var _tried = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _go());
  }

  Future<void> _go() async {
    if (_tried) {
      return;
    }
    if (widget.result == 'ok') {
      if (mounted) {
        setState(() {
          _phase = 'ok';
        });
      }
      return;
    }
    if (widget.result == 'error') {
      if (mounted) {
        setState(() {
          _phase = 'err';
          _err = _mapReason(widget.reason);
        });
      }
      return;
    }
    final t = widget.token;
    if (t == null || t.isEmpty) {
      if (mounted) {
        setState(() {
          _phase = 'err';
          _err = 'This link is missing a token. Open the full link from your email.';
        });
      }
      return;
    }
    _tried = true;
    if (mounted) {
      setState(() {
        _phase = 'loading';
      });
    }
    try {
      await ref.read(farmCApiProvider).verifyEmailByToken(t);
      if (mounted) {
        setState(() {
          _phase = 'ok';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _phase = 'err';
          _err = e.toString();
        });
      }
    }
  }

  String _mapReason(String? r) {
    const m = {
      'invalid_token': 'This link is invalid or already used.',
      'expired_token': 'This link has expired. Request a new one in the app.',
    };
    return m[r] ?? (r != null && r.isNotEmpty ? r : 'Verification could not be completed.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Email verification')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _buildBody(),
        ),
      ),
    );
  }

  Widget _buildBody() {
    switch (_phase) {
      case 'loading':
        return const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Verifying your email…'),
          ],
        );
      case 'ok':
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle, size: 64, color: Colors.green),
            const SizedBox(height: 16),
            const Text('Your email is verified.', textAlign: TextAlign.center, style: TextStyle(fontSize: 18)),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/login');
                }
              },
              child: const Text('Sign in'),
            ),
          ],
        );
      case 'err':
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.orange),
            const SizedBox(height: 16),
            Text(_err, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.tonal(
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/login');
                }
              },
              child: const Text('Back'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/login');
                }
                showAppToast(context, 'Resend the email from the Verification screen after you sign in.');
              },
              child: const Text('Resend help'),
            ),
            TextButton(
              onPressed: () {
                if (widget.token == null || widget.token!.isEmpty) {
                  return;
                }
                setState(() {
                  _tried = false;
                  _phase = 'loading';
                });
                _go();
              },
              child: const Text('Try again'),
            ),
          ],
        );
      default:
        return const SizedBox.shrink();
    }
  }
}
