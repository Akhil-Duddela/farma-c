import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _kJwt = 'farmc_jwt';

class SecureTokenStorage {
  const SecureTokenStorage();
  static const _s = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.unlocked),
  );

  Future<String?> read() => _s.read(key: _kJwt);
  Future<void> write(String token) => _s.write(key: _kJwt, value: token);
  Future<void> clear() => _s.delete(key: _kJwt);
}
