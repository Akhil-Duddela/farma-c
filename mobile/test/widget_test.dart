import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:farm_c_ai_mobile/app.dart';

void main() {
  testWidgets('app builds', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: FarmCApp(),
      ),
    );
    expect(find.text('Sign in'), findsOneWidget);
  });
}
