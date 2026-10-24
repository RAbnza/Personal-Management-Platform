import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

class PrivateFileProtection {
  static final _cipher = AesGcm.with256bits();
  static final _header = utf8.encode('SALAPIYA-P0-FILE-1\n');
  static SecretKey _key(String encoded) {
    final bytes = base64Url.decode(encoded);
    if (bytes.length != 32)
      throw const FormatException('Invalid private-file key');
    return SecretKey(bytes);
  }

  static Future<Uint8List> encrypt(List<int> bytes, String encodedKey) async {
    if (bytes.length > 1024 * 1024)
      throw const FormatException('Proof file limit exceeded');
    final box = await _cipher.encrypt(
      bytes,
      secretKey: _key(encodedKey),
      aad: _header,
    );
    return Uint8List.fromList([..._header, ...box.concatenation()]);
  }

  static Future<Uint8List> decrypt(List<int> bytes, String encodedKey) async {
    if (bytes.length < _header.length + 28 ||
        bytes.length > 1024 * 1024 + _header.length + 28 ||
        !List.generate(
          _header.length,
          (i) => bytes[i] == _header[i],
        ).every((x) => x))
      throw const FormatException('Invalid private file');
    return Uint8List.fromList(
      await _cipher.decrypt(
        SecretBox.fromConcatenation(
          bytes.sublist(_header.length),
          nonceLength: 12,
          macLength: 16,
        ),
        secretKey: _key(encodedKey),
        aad: _header,
      ),
    );
  }
}
