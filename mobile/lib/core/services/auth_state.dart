import 'package:flutter_riverpod/flutter_riverpod.dart' show StateNotifierProvider;
import 'package:state_notifier/state_notifier.dart';

import '../models/user_model.dart';
import 'secure_token_storage.dart';

class AuthState {
  const AuthState({
    this.token,
    this.user,
    this.userLoading = false,
  });

  final String? token;
  final UserModel? user;
  final bool userLoading;

  bool get isAuthenticated => token != null && token!.isNotEmpty;

  AuthState copyWith({
    String? token,
    UserModel? user,
    bool? userLoading,
    bool clearToken = false,
    bool clearUser = false,
  }) {
    return AuthState(
      token: clearToken ? null : (token ?? this.token),
      user: clearUser ? null : (user ?? this.user),
      userLoading: userLoading ?? this.userLoading,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    Future.microtask(_load);
  }
  static const _storage = SecureTokenStorage();

  Future<void> _load() async {
    final t = await _storage.read();
    if (t == null || t.isEmpty) return;
    state = state.copyWith(token: t);
  }

  Future<void> setTokenAndUser(String? token, UserModel? u) async {
    if (token == null) {
      await _storage.clear();
      state = const AuthState();
      return;
    }
    await _storage.write(token);
    state = state.copyWith(token: token, user: u, userLoading: false);
  }

  void setUser(UserModel? u) {
    state = state.copyWith(user: u, userLoading: false);
  }

  void setUserLoading([bool v = true]) {
    state = state.copyWith(userLoading: v);
  }

  Future<void> clear() async {
    await _storage.clear();
    state = const AuthState();
  }
}

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier());
