import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/repositories/farmc_api.dart';
import '../../core/services/auth_state.dart';
import '../../core/utils/ui_feedback.dart';

class VerificationScreen extends ConsumerStatefulWidget {
  const VerificationScreen({super.key});

  @override
  ConsumerState<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends ConsumerState<VerificationScreen> {
  var _status = <String, dynamic>{};
  var _loading = true;
  var _sendingOtp = false;
  var _captcha = '';
  final _phone = TextEditingController();
  final _otp = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final a = ref.read(farmCApiProvider);
      _status = await a.profileStatus();
      if (ref.read(authStateProvider).isAuthenticated) {
        final m = await a.me();
        ref.read(authStateProvider.notifier).setUser(m);
      }
    } catch (e) {
      if (mounted) {
        showAppToast(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resendEmail() async {
    setState(() => _loading = true);
    try {
      await ref.read(farmCApiProvider).resendEmail();
      if (mounted) {
        showAppToast(context, 'If SMTP is set, a new link was sent.', error: false);
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

  Future<void> _sendOtp() async {
    setState(() => _sendingOtp = true);
    try {
      await ref.read(farmCApiProvider).sendOtp(
            _phone.text.trim(),
            captchaToken: AppConfig.hcaptchaSiteKey.isEmpty ? '' : _captcha,
          );
      if (mounted) {
        showAppToast(context, 'If SMS is configured, check your phone.', error: false);
      }
    } catch (e) {
      if (mounted) {
        showAppToast(context, e.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _sendingOtp = false);
      }
    }
  }

  Future<void> _verifyOtp() async {
    setState(() => _loading = true);
    try {
      final u = await ref
          .read(farmCApiProvider)
          .verifyOtp(_phone.text.trim(), _otp.text.trim());
      ref.read(authStateProvider.notifier).setUser(u);
      await _load();
      if (mounted) {
        showAppToast(context, 'Phone verified', error: false);
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

  @override
  Widget build(BuildContext context) {
    if (_loading && _status.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    final emailOk = _status['emailVerified'] == true;
    final phoneOk = _status['phoneVerified'] == true;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Verification', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        ListTile(
          leading: Icon(
            emailOk ? Icons.check_circle : Icons.mark_email_unread,
            color: emailOk ? Colors.green : null,
          ),
          title: const Text('Email'),
          subtitle: Text(emailOk ? 'Verified' : 'Not verified — open the link in your email'),
          trailing: emailOk
              ? null
              : TextButton(
                  onPressed: _resendEmail,
                  child: const Text('Resend link'),
                ),
        ),
        const Divider(),
        ListTile(
          leading: Icon(phoneOk ? Icons.check_circle : Icons.phone, color: phoneOk ? Colors.green : null),
          title: const Text('Phone (E.164)'),
          subtitle: Text(phoneOk ? 'Verified' : 'Enter e.g. +12025551234'),
        ),
        if (!phoneOk) ...[
          if (AppConfig.hcaptchaSiteKey.isNotEmpty) ...[
            const Text('Server requires hCaptcha. Paste a token if prompted by API, or set HCAPTCHA on web.'),
            TextFormField(
              onChanged: (s) => _captcha = s,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'captchaToken (if required)',
              ),
            ),
          ],
          TextFormField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone number (E.164)',
            ),
          ),
          FilledButton(
            onPressed: _sendingOtp ? null : _sendOtp,
            child: const Text('Send code'),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _otp,
            maxLength: 6,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '6-digit code'),
          ),
          FilledButton.tonal(
            onPressed: _loading ? null : _verifyOtp,
            child: const Text('Verify phone'),
          ),
        ],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _loading
              ? null
              : () async {
                  setState(() => _loading = true);
                  try {
                    await ref.read(farmCApiProvider).submitProfileVerification();
                    if (!context.mounted) {
                      return;
                    }
                    showAppToast(
                        context, 'Profile submitted for review (if required)',
                        error: false);
                    await _load();
                    if (!context.mounted) {
                      return;
                    }
                  } catch (e) {
                    if (!context.mounted) {
                      return;
                    }
                    showAppToast(context, e.toString());
                  } finally {
                    if (mounted) {
                      setState(() => _loading = false);
                    }
                  }
                },
          child: const Text('Submit profile for verification'),
        ),
      ],
    );
  }
}
