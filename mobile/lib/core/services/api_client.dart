import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'api_error.dart';
import 'auth_state.dart';
import 'secure_token_storage.dart';

final secureTokenProvider = Provider<SecureTokenStorage>((ref) => const SecureTokenStorage());

final apiClientProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (o, h) {
        final t = ref.read(authStateProvider).token;
        if (t != null && t.isNotEmpty) {
          o.headers['Authorization'] = 'Bearer $t';
        }
        return h.next(o);
      },
      onError: (e, h) {
        if (e.response?.statusCode == 401) {
          ref.read(authStateProvider.notifier).clear();
        }
        return h.next(e);
      },
    ),
  );
  return dio;
});

extension ApiX on Ref {
  Future<dynamic> getData(String path) async {
    try {
      return (await read(apiClientProvider).get(path)).data;
    } on DioException catch (e) {
      final a = parseDioError(e);
      throw a ?? Exception(e.message);
    }
  }

  Future<dynamic> postData(String path, {Map<String, dynamic>? data}) async {
    try {
      return (await read(apiClientProvider).post(path, data: data)).data;
    } on DioException catch (e) {
      final a = parseDioError(e);
      throw a ?? Exception(e.message);
    }
  }
}

/// Top-level [Ref] is not available outside ProviderBase; use [Dio] from ref in repositories.
