import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/post_model.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';
import '../services/api_error.dart';

final farmCApiProvider = Provider<FarmCApi>((ref) => FarmCApi(ref));

class FarmCApi {
  FarmCApi(this._ref);
  final Ref _ref;

  // —— Auth ——
  Future<void> register({
    required String email,
    required String password,
    String name = '',
  }) async {
    await _ref.postData(
      '/auth/register',
      data: {'email': email, 'password': password, if (name.isNotEmpty) 'name': name},
    );
  }

  Future<(String token, UserModel user)> login(String email, String password) async {
    final d = await _ref.postData(
      '/auth/login',
      data: {'email': email, 'password': password},
    ) as Map;
    final t = d['token'] as String;
    final u = UserModel.fromJson(Map<String, dynamic>.from(d['user'] as Map));
    return (t, u);
  }

  Future<UserModel> me() async {
    final d = await _ref.getData('/auth/me') as Map;
    return UserModel.fromJson(Map<String, dynamic>.from(d));
  }

  Future<void> resendEmail() async {
    await _ref.postData('/auth/resend-verification');
  }

  Future<void> registerFcmToken(String token) async {
    await _ref.postData(
      '/notifications/register-device',
      data: {'token': token},
    );
  }

  /// Public email verification (no prior login). Uses `json=1` to avoid follow redirects.
  Future<void> verifyEmailByToken(String token) async {
    try {
      await _ref.read(apiClientProvider).get(
            '/auth/verify-email',
            queryParameters: <String, dynamic>{'token': token, 'json': '1'},
          );
    } on DioException catch (e) {
      final a = parseDioError(e);
      throw a ?? Exception(e.message);
    }
  }

  /// [captchaToken] required when server uses hCaptcha (empty for local dev)
  Future<void> sendOtp(String e164phone, {String captchaToken = ''}) async {
    await _ref.postData(
      '/auth/send-otp',
      data: {'phoneNumber': e164phone, 'captchaToken': captchaToken},
    );
  }

  Future<UserModel> verifyOtp(String phone, String otp) async {
    final d = await _ref.postData(
      '/auth/verify-otp',
      data: {'phoneNumber': phone, 'otp': otp},
    ) as Map;
    return UserModel.fromJson(Map<String, dynamic>.from(d['user'] as Map));
  }

  // —— AI ——
  Future<Map<String, dynamic>> enhance(String input) async {
    final d = await _ref.postData(
      '/ai/enhance',
      data: {'input': input},
    );
    if (d is! Map) return {};
    return Map<String, dynamic>.from(d);
  }

  Future<Map<String, dynamic>> recommendations() async {
    final d = await _ref.getData('/ai/recommendations');
    if (d is! Map) return {};
    return Map<String, dynamic>.from(d);
  }

  // —— Posts ——
  Future<List<PostModel>> listPosts({int limit = 30}) async {
    final d = await _ref.getData('/posts?limit=$limit');
    if (d is! List) return [];
    return d
        .map((e) => PostModel.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<PostModel> getPost(String id) async {
    final d = await _ref.getData('/posts/$id') as Map;
    return PostModel.fromJson(Map<String, dynamic>.from(d));
  }

  Future<PostModel> createPostV2({
    String content = '',
    String caption = '',
    required String mediaUrl,
    required String mediaType,
    required bool instagram,
    required bool youtube,
    String? scheduledAt,
    String status = 'draft',
  }) async {
    final d = await _ref.postData(
      '/posts/create',
      data: {
        'content': content,
        'caption': caption,
        'mediaUrl': mediaUrl,
        'mediaType': mediaType,
        'platforms': {'instagram': instagram, 'youtube': youtube},
        if (scheduledAt != null && scheduledAt.isNotEmpty) 'scheduledAt': scheduledAt,
        'status': status,
      },
    ) as Map;
    return PostModel.fromJson(Map<String, dynamic>.from(d));
  }

  Future<Map<String, dynamic>> postErrors(String id) async {
    final d = await _ref.getData('/posts/$id/errors') as Map;
    return Map<String, dynamic>.from(d);
  }

  Future<PostModel> retryPost(String id) async {
    final d = await _ref.postData(
      '/posts/$id/retry',
      data: <String, dynamic>{},
    ) as Map;
    return PostModel.fromJson(Map<String, dynamic>.from(d));
  }

  // —— Accounts (aggregated) ——
  Future<Map<String, dynamic>> accountsStatus() async {
    final d = await _ref.getData('/accounts/status');
    if (d is! Map) return {};
    return Map<String, dynamic>.from(d);
  }

  // —— Instagram ——
  Future<String> instagramAuthUrl() async {
    final d = await _ref.getData('/instagram/auth-url') as Map;
    return d['url'] as String? ?? '';
  }

  Future<Map<String, dynamic>> igOauthPending(String key) async {
    final d = await _ref.getData('/instagram/oauth-pending?key=$key') as Map;
    return Map<String, dynamic>.from(d);
  }

  Future<void> selectInstagram({required String accountId, required String pickKey}) async {
    await _ref.postData(
      '/instagram/select-account',
      data: {'accountId': accountId, 'pickKey': pickKey},
    );
  }

  // —— YouTube ——
  Future<String> youtubeAuthUrl() async {
    final d = await _ref.getData('/youtube/auth-url') as Map;
    return d['url'] as String? ?? '';
  }

  Future<Map<String, dynamic>> ytOauthPending(String key) async {
    final d = await _ref.getData('/youtube/oauth-pending?key=$key') as Map;
    return Map<String, dynamic>.from(d);
  }

  Future<void> selectYoutubeChannel({required String pickKey, required String channelId}) async {
    await _ref.postData(
      '/youtube/select-channel',
      data: {'pickKey': pickKey, 'channelId': channelId},
    );
  }

  // —— Automation (requires full verification) ——
  Future<Map<String, dynamic>> runAutomation(
    String input, {
    bool instagram = true,
    bool youtube = true,
  }) async {
    final d = await _ref.postData(
      '/automation/run',
      data: {
        'input': input,
        'platforms': {'instagram': instagram, 'youtube': youtube},
      },
    ) as Map;
    return Map<String, dynamic>.from(d);
  }

  // —— Profile (verification) ——
  Future<Map<String, dynamic>> profileStatus() async {
    final d = await _ref.getData('/profile/status') as Map;
    return Map<String, dynamic>.from(d);
  }

  Future<void> submitProfileVerification() async {
    await _ref.postData('/profile/submit-verification');
  }

  // —— Analytics ——
  Future<Map<String, dynamic>> analytics() async {
    final d = await _ref.getData('/analytics/summary') as Map;
    return Map<String, dynamic>.from(d);
  }

  // —— Users / leaderboard ——
  Future<Map<String, dynamic>> leaderboard({int limit = 30}) async {
    final d = await _ref.getData('/users/leaderboard?limit=$limit') as Map;
    return Map<String, dynamic>.from(d);
  }

  // —— Automation ——
  Future<List<dynamic>> automationHistory({int limit = 20}) async {
    final d = await _ref.getData('/automation/history?limit=$limit');
    if (d is! List) return const [];
    return d;
  }
}
