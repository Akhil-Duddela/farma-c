import 'package:dio/dio.dart';

import '../config/app_config.dart';
import 'fcm_state.dart';

/// Unregister the device token while JWT is still valid (logout / session end).
Future<void> unregisterFcmOnLogout(String? jwt) async {
  final t = fcmDeviceToken;
  if (t == null || t.isEmpty || jwt == null || jwt.isEmpty) {
    return;
  }
  try {
    final d = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 20),
      ),
    );
    await d.post<dynamic>('/notifications/unregister-device', data: {'token': t});
  } catch (_) {}
}
