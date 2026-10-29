import 'package:flutter/foundation.dart';

class DemoAttachment {
  DemoAttachment(
    this.id,
    this.name,
    this.source,
    this.state, {
    this.sizeKiB = 240,
  });
  final String id;
  String name, source, state;
  int sizeKiB;
  bool keepOffline = false;
  final List<String> history = [];
}

class SupportingController extends ChangeNotifier {
  final List<DemoAttachment> files = [];
  int serial = 0;
  void reset({bool empty = false}) {
    files.clear();
    if (!empty) {
      files.addAll([
        DemoAttachment(
          'receipt',
          'Market receipt.jpg',
          'action:seed-0',
          'Local only',
        ),
        DemoAttachment(
          'statement',
          'October statement.pdf',
          'statement:statement-oct:v1',
          'Downloaded',
        ),
        DemoAttachment(
          'resume',
          'Resume v2.pdf',
          'career:studio',
          'Online only',
        ),
        DemoAttachment(
          'brief',
          'Portfolio brief.pdf',
          'career:studio',
          'Missing',
        ),
        DemoAttachment('loan', 'Loan evidence.pdf', 'debt:debt-1', 'Unscanned'),
      ]);
    }
    notifyListeners();
  }

  void add(Map<String, String> v) {
    final size = int.tryParse(v['size'] ?? '') ?? 0;
    if (size < 1 ||
        size > 10240 ||
        !RegExp(
          r'\.(pdf|png|jpe?g)$',
          caseSensitive: false,
        ).hasMatch(v['name'] ?? '')) {
      throw const FormatException(
        'Choose PDF, JPEG or PNG metadata, at most 10 MiB. No actual file is read.',
      );
    }
    files.add(
      DemoAttachment(
          'file-${++serial}',
          v['name']!,
          v['source']!,
          'Unscanned',
          sizeKiB: size,
        )
        ..history.add(
          'Metadata staged · actual bytes not present in this prototype',
        ),
    );
    notifyListeners();
  }

  void transition(DemoAttachment f, String action) {
    final next = switch (action) {
      'Retry upload' => 'Uploading',
      'Simulate transfer complete' => 'Downloaded',
      'Simulate download' => 'Downloaded',
      'Remove local copy' => 'Online only',
      'Reject unsafe file' => 'Rejected',
      'Simulate scan passed' => 'Local only',
      'Delete metadata' => 'Deleted',
      _ => action,
    };
    if ([
          'Unscanned',
          'Rejected',
          'Missing',
          'Metadata only',
          'Deleted',
        ].contains(f.state) &&
        ['Downloaded', 'Uploading', 'Online only'].contains(next)) {
      throw const FormatException(
        'Unavailable or unsafe bytes cannot be transferred. Review or replace the source metadata.',
      );
    }
    if (action == 'Simulate scan passed' && f.state != 'Unscanned') {
      throw const FormatException(
        'Only the unscanned specimen can transition to the simulated safe state.',
      );
    }
    f.history.add('${f.state} → $next · simulation only');
    f.state = next;
    notifyListeners();
  }

  void changed() => notifyListeners();
}
