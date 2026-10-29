import 'package:flutter/foundation.dart';

/// Identity and recovery presentation state; no credentials, filesystem or APIs.
class ProfileController extends ChangeNotifier {
  String name = 'Amihan',
      profileId = 'local-demo-01',
      identity = 'Not connected';
  String connection = 'Local only',
      enrollment = 'Not started',
      restore = 'Not started';
  String backup = 'No portable backup created', deletion = 'Not requested';
  bool paused = false, locked = false, diagnostics = false, keepOffline = true;
  int generation = 0;
  final Map<String, String> devices = {
    'This installation': 'Local only',
    'Android demo phone': 'Illustrative · not enrolled',
  };
  final List<String> history = [];
  void changed() {
    notifyListeners();
  }

  void reset() {
    name = 'Amihan';
    profileId = 'local-demo-01';
    identity = 'Not connected';
    connection = 'Local only';
    enrollment = 'Not started';
    restore = 'Not started';
    backup = 'No portable backup created';
    deletion = 'Not requested';
    paused = false;
    locked = false;
    diagnostics = false;
    keepOffline = true;
    devices
      ..clear()
      ..addAll({
        'This installation': 'Local only',
        'Android demo phone': 'Illustrative · not enrolled',
      });
    history.clear();
    generation++;
    changed();
  }

  void enrollmentStep(String value) {
    enrollment = value;
    history.add('Enrollment: $value · synthetic checkpoint only');
    changed();
  }

  void connect() {
    identity = 'Amihan · fictional Google identity';
    connection = 'Connected demo';
    enrollment = 'Published demo snapshot';
    devices['This installation'] = 'Enrolled in simulation';
    history.add('Identity linked; synthetic snapshot publication complete.');
    changed();
  }

  void lifecycle(String action) {
    switch (action) {
      case 'Pause sync':
        paused = true;
        connection = 'Sync paused';
      case 'Resume sync':
        paused = false;
        connection = identity == 'Not connected'
            ? 'Local only'
            : 'Connected demo';
      case 'Lock preview':
        locked = true;
      case 'Unlock preview':
        locked = false;
      case 'Sign out':
        identity = 'Not connected';
        connection = 'Signed out · private local copy retained';
        devices['This installation'] = 'Signed out';
      case 'Request cloud deletion':
        deletion = 'Requested in simulation · not globally completed';
        connection = 'Deletion review';
      case 'Cancel cloud deletion':
        deletion = 'Cancelled in simulation';
    }
    history.add('$action · simulated only');
    changed();
  }
}
