import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/services/fcm_bootstrap.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  registerFcmBackgroundHandler();
  await tryInitFirebase();
  runApp(
    const ProviderScope(
      child: FarmCApp(),
    ),
  );
}
