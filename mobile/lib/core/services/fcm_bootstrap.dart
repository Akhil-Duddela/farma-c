import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../repositories/farmc_api.dart';
import '../router/app_router.dart';
import 'auth_state.dart';
import 'fcm_state.dart' as fcm_state;

final FlutterLocalNotificationsPlugin _fln = FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  if (kDebugMode) {
    debugPrint('FCM background: ${message.messageId}');
  }
}

/// Register the background handler before [runApp]; [Firebase.initializeApp] in main.
void registerFcmBackgroundHandler() {
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
}

Future<void> tryInitFirebase() async {
  if (kIsWeb) {
    return;
  }
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
  } catch (e) {
    if (kDebugMode) {
      debugPrint('Firebase.initializeApp failed (add google-services / Firebase config): $e');
    }
  }
}

String _dStr(Object? o) => o == null ? '' : o.toString();

void _onNavigateFromData(WidgetRef ref, Map<String, dynamic> data) {
  if (!data.containsKey('type') || _dStr(data['type']).isEmpty) {
    return;
  }
  final type = _dStr(data['type']);
  final postId = _dStr(data['postId']);
  final r = ref.read(goRouterProvider);
  switch (type) {
    case 'post_success':
    case 'post_failed':
      if (postId.isNotEmpty) {
        r.go('/post/$postId');
      } else {
        r.go('/home');
      }
      return;
    case 'verification_approved':
    case 'verification_rejected':
      r.go('/verify');
      return;
    case 'account_connected':
      r.go('/accounts');
      return;
    default:
      r.go('/home');
  }
}

Future<void> _showLocalNotification(RemoteMessage message) async {
  final title = message.notification?.title ?? message.data['title'] ?? 'Farm-C AI';
  final body = message.notification?.body ?? message.data['body'] ?? '';
  final android = AndroidNotificationDetails(
    'farmc_default',
    'General',
    channelDescription: 'Posts, accounts, and verification',
    importance: Importance.defaultImportance,
    priority: Priority.defaultPriority,
  );
  final details = NotificationDetails(android: android);
  await _fln.show(
    id: message.hashCode,
    title: title,
    body: body,
    notificationDetails: details,
  );
}

/// Call from [FarmCApp] after the widget tree and [goRouter] exist.
void startFcmListeners(WidgetRef ref) {
  if (kIsWeb || Firebase.apps.isEmpty) {
    return;
  }
  if (Platform.isAndroid) {
    unawaited(_fln
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            'farmc_default',
            'General',
            description: 'Posts, accounts, and verification',
            importance: Importance.defaultImportance,
          ),
        ),);
  }

  unawaited(
    _fln.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (res) {
        if (res.payload == null) {
          return;
        }
      },
    ),
  );

  FirebaseMessaging.instance.getInitialMessage().then((m) {
    if (m != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _onNavigateFromData(ref, m.data);
      });
    }
  });

  FirebaseMessaging.onMessageOpenedApp.listen((m) {
    _onNavigateFromData(ref, m.data);
  });

  if (defaultTargetPlatform == TargetPlatform.iOS) {
    unawaited(
      FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      ),
    );
  }

  FirebaseMessaging.onMessage.listen((m) {
    if (Platform.isAndroid) {
      unawaited(_showLocalNotification(m));
    } else {
      // iOS uses setForegroundNotificationPresentationOptions
    }
  });

  FirebaseMessaging.instance.onTokenRefresh.listen((t) {
    fcm_state.fcmDeviceToken = t;
    unawaited(_registerTokenToBackendIfLoggedIn(ref, t));
  });

  unawaited(
    _requestPermsAndRegister(
      ref,
    ),
  );
}

Future<void> _requestPermsAndRegister(WidgetRef ref) async {
  final msg = FirebaseMessaging.instance;
  final s = await msg.getNotificationSettings();
  if (s.authorizationStatus == AuthorizationStatus.notDetermined) {
    await msg.requestPermission(alert: true, badge: true, sound: true, provisional: true);
  }
  try {
    final t = await msg.getToken();
    if (t == null) {
      return;
    }
    fcm_state.fcmDeviceToken = t;
    await _registerTokenToBackendIfLoggedIn(ref, t);
  } catch (e) {
    if (kDebugMode) {
      debugPrint('getToken: $e');
    }
  }
}

Future<void> _registerTokenToBackendIfLoggedIn(WidgetRef ref, String t) async {
  final a = ref.read(authStateProvider);
  if (a.token == null || a.token!.isEmpty) {
    return;
  }
  try {
    await ref.read(farmCApiProvider).registerFcmToken(t);
  } catch (e) {
    if (kDebugMode) {
      debugPrint('registerFcmToken: $e');
    }
  }
}

/// Call after the user has started a new session.
Future<void> reregisterFcmForLoggedInUser(WidgetRef ref) async {
  if (Firebase.apps.isEmpty || fcm_state.fcmDeviceToken == null) {
    return;
  }
  await _registerTokenToBackendIfLoggedIn(ref, fcm_state.fcmDeviceToken!);
}

