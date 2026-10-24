import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// Explicit scopes keep proof credentials separate from any future real profile.
class SecureSessionStorage extends LocalStorage {
  const SecureSessionStorage(this.storage, this.slot);
  final FlutterSecureStorage storage;
  final String slot;
  @override
  Future<void> initialize() async {}
  @override
  Future<bool> hasAccessToken() async => await accessToken() != null;
  @override
  Future<String?> accessToken() => storage.read(key: slot);
  @override
  Future<void> persistSession(String value) =>
      storage.write(key: slot, value: value);
  @override
  Future<void> removePersistedSession() => storage.delete(key: slot);
}

class SecurePkceStorage extends GotrueAsyncStorage {
  const SecurePkceStorage(this.storage, this.scope);
  final FlutterSecureStorage storage;
  final String scope;
  @override
  Future<String?> getItem({required String key}) =>
      storage.read(key: '$scope.$key');
  @override
  Future<void> setItem({required String key, required String value}) =>
      storage.write(key: '$scope.$key', value: value);
  @override
  Future<void> removeItem({required String key}) =>
      storage.delete(key: '$scope.$key');
}
