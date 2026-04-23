import 'package:flutter/material.dart';

void showAppToast(BuildContext context, String message, {bool error = true}) {
  final m = ScaffoldMessenger.of(context);
  m.clearMaterialBanners();
  m.showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: error ? Theme.of(context).colorScheme.error : null,
      behavior: SnackBarBehavior.floating,
    ),
  );
}
