import 'dart:convert';

import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../local/finance_domain.dart' show newLocalId;
import '../connected/financial_contract.dart' show canonicalJson;

enum LifeType {
  task,
  learning,
  book,
  personal,
  application,
  careerEvent,
  document,
}

const careerStages = [
  'Saved',
  'Applied',
  'Screening',
  'Interview',
  'Technical assessment',
  'Final interview',
  'Offer',
  'Accepted',
  'Rejected',
  'Withdrawn',
  'Declined offer',
  'Expired offer',
  'Employer-cancelled opening',
];
const careerOutcomes = [
  'Accepted',
  'Rejected',
  'Withdrawn',
  'Declined offer',
  'Expired offer',
  'Employer-cancelled opening',
];
const careerPipelineStages = [
  'Saved',
  'Applied',
  'Screening',
  'Interview',
  'Technical assessment',
  'Final interview',
  'Offer',
  'Accepted',
];
const careerEventKinds = [
  'Interview',
  'Assessment',
  'Follow-up',
  'Submission',
  'Response',
  'Offer',
  'No response',
  'Note',
];
const lifeStatuses = ['Not started', 'In progress', 'Completed', 'On hold'];

Never lifeReject(String message) => throw FormatException(message);

String lifeDate(String value, {bool optional = false}) {
  if (optional && value.isEmpty) return value;
  final parsed = DateTime.tryParse('${value}T00:00:00Z');
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value) ||
      parsed == null ||
      parsed.year < 1900 ||
      parsed.year > 2200 ||
      parsed.toIso8601String().substring(0, 10) != value) {
    lifeReject('Choose a valid civil date between 1900 and 2200.');
  }
  return value;
}

class LifeTime {
  static bool _ready = false;
  static void initialize() {
    if (!_ready) {
      tzdata.initializeTimeZones();
      _ready = true;
    }
  }

  static tz.Location zone(String name) {
    initialize();
    if (name == 'UTC' || name == 'Etc/UTC') return tz.UTC;
    try {
      return tz.getLocation(name);
    } catch (_) {
      lifeReject('Choose a supported IANA timezone.');
    }
  }

  static String today([String timezone = 'Asia/Manila', DateTime? clock]) =>
      tz.TZDateTime.from(
        clock ?? DateTime.now(),
        zone(timezone),
      ).toIso8601String().substring(0, 10);
  static List<DateTime> candidates(String date, String time, String timezone) {
    lifeDate(date);
    if (!RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(time)) {
      lifeReject('Use a 24-hour time (HH:MM).');
    }
    final location = zone(timezone), wall = DateTime.parse('${date}T$time:00Z');
    final result = <DateTime>[];
    for (final offset in location.zones.map((z) => z.offset).toSet()) {
      final instant = wall.subtract(offset);
      final local = tz.TZDateTime.from(instant, location);
      if (local.year == wall.year &&
          local.month == wall.month &&
          local.day == wall.day &&
          local.hour == wall.hour &&
          local.minute == wall.minute) {
        result.add(instant);
      }
    }
    result.sort();
    return result;
  }

  static DateTime instant(
    String date,
    String time,
    String timezone, [
    String fold = '',
  ]) {
    final matches = candidates(date, time, timezone);
    if (matches.isEmpty) {
      lifeReject(
        'That local time falls in a daylight-saving gap. Choose another time.',
      );
    }
    if (matches.length > 1 && !['Earlier', 'Later'].contains(fold)) {
      lifeReject(
        'That local time occurs twice. Explicitly choose Earlier or Later.',
      );
    }
    return fold == 'Later' ? matches.last : matches.first;
  }
}

/// Preset version 1 has closed, independently validated fields. JSON is only the
/// lossless command/storage boundary, never an arbitrary tracker definition.
sealed class LifeRecord {
  LifeRecord(this.id, this.owner, this.version, Map<String, String> fields)
    : fields = Map.unmodifiable(fields);
  final String id, owner;
  final int version;
  final Map<String, String> fields;
  LifeType get type;
  String? get presetId => switch (type) {
    LifeType.task => 'tasks',
    LifeType.learning => 'learning',
    LifeType.book => 'books',
    _ => null,
  };
  String get title => fields['title']!;
  String get status => fields['status']!;
  bool get archived => fields['archived'] == 'true';
  String get notes => fields['notes']!;
  bool get active => !archived && !['Completed', 'Cancelled'].contains(status);
  factory LifeRecord.read(
    String id,
    String owner,
    int version,
    LifeType type,
    Map<String, String> fields,
  ) {
    final v = validateLifeFields(type, fields);
    return switch (type) {
      LifeType.task => TaskRecord(id, owner, version, v),
      LifeType.learning => LearningRecord(id, owner, version, v),
      LifeType.book => BookRecord(id, owner, version, v),
      LifeType.personal => PersonalRecord(id, owner, version, v),
      LifeType.application => ApplicationRecord(id, owner, version, v),
      LifeType.careerEvent => CareerEventRecord(id, owner, version, v),
      LifeType.document => CareerDocumentRecord(id, owner, version, v),
    };
  }
}

final class TaskRecord extends LifeRecord {
  TaskRecord(super.id, super.owner, super.version, super.fields);
  @override
  LifeType get type => LifeType.task;
  String get priority => fields['priority']!;
  String get due => fields['due']!;
  String get completionDate => fields['completed']!;
}

sealed class ProgressRecord extends LifeRecord {
  ProgressRecord(super.id, super.owner, super.version, super.fields);
  int get total => int.parse(fields['total']!);
  int get progress => int.parse(fields['progress']!);
  String get due => fields['due']!;
}

final class LearningRecord extends ProgressRecord {
  LearningRecord(super.id, super.owner, super.version, super.fields);
  @override
  LifeType get type => LifeType.learning;
  String get resource => fields['detail']!;
}

final class BookRecord extends ProgressRecord {
  BookRecord(super.id, super.owner, super.version, super.fields);
  @override
  LifeType get type => LifeType.book;
  String get author => fields['detail']!;
  int? get rating => int.tryParse(fields['rating']!);
}

sealed class ScheduledRecord extends LifeRecord {
  ScheduledRecord(super.id, super.owner, super.version, super.fields);
  String get date => fields['date']!;
  String get time => fields['time']!;
  String get timezone => fields['timezone']!;
  DateTime? get utc => DateTime.tryParse(fields['utc']!);
  bool get allDay => time.isEmpty;
}

final class PersonalRecord extends ScheduledRecord {
  PersonalRecord(super.id, super.owner, super.version, super.fields);
  @override
  LifeType get type => LifeType.personal;
}

final class ApplicationRecord extends LifeRecord {
  ApplicationRecord(super.id, super.owner, super.version, super.fields);
  @override
  LifeType get type => LifeType.application;
  String get company => fields['company']!;
  String get position => title;
  bool get terminal => careerOutcomes.contains(status);
  String get stage =>
      fields['pipelineStage'] ??
      (careerPipelineStages.contains(status)
          ? status
          : 'Unspecified in preset v1');
  String get outcome => fields['outcome'] ?? (terminal ? status : '');
}

final class CareerEventRecord extends ScheduledRecord {
  CareerEventRecord(super.id, super.owner, super.version, super.fields);
  @override
  LifeType get type => LifeType.careerEvent;
  String get applicationId => fields['application']!;
  String get kind => fields['eventKind']!;
}

final class CareerDocumentRecord extends LifeRecord {
  CareerDocumentRecord(super.id, super.owner, super.version, super.fields);
  @override
  LifeType get type => LifeType.document;
  String get applicationId => fields['application']!;
  Map<String, String> get fileMetadata => {
    'name': title,
    'mime': fields['mime']!,
    'size': fields['size']!,
    'checksum': fields['checksum']!,
    'sourceRevision': 'career:$applicationId:v${fields['sourceVersion']}',
  };
}

const _common = {
  'title': '',
  'status': 'In progress',
  'notes': '',
  'archived': 'false',
};
Map<String, String> lifeDefaults(LifeType type) => {
  ..._common,
  ...switch (type) {
    LifeType.task => {
      'detail': '',
      'due': '',
      'priority': 'Normal',
      'completed': '',
    },
    LifeType.learning || LifeType.book => {
      'detail': '',
      'due': '',
      'total': '1',
      'progress': '0',
      'started': '',
      'completed': '',
      if (type == LifeType.book) 'rating': '',
    },
    LifeType.personal || LifeType.careerEvent => {
      'status': 'Scheduled',
      'date': '',
      'time': '',
      'timezone': 'Asia/Manila',
      'fold': '',
      'utc': '',
      'location': '',
      'outcome': '',
      if (type == LifeType.careerEvent) ...{
        'application': '',
        'eventKind': 'Interview',
      },
    },
    LifeType.application => {
      'status': 'Saved',
      'company': '',
      'date': '',
      'stageDate': '',
      'location': '',
      'arrangement': 'unspecified',
      'postingUrl': '',
      'source': '',
      'salaryMin': '',
      'salaryMax': '',
      'currency': 'PHP',
      'salaryPeriod': 'month',
      'technologies': '',
      'description': '',
      'contact': '',
      'resume': '',
      'nextAction': '',
      'followUp': '',
    },
    LifeType.document => {
      'status': 'Linked',
      'application': '',
      'sourceVersion': '',
      'mime': '',
      'size': '',
      'checksum': '',
    },
  },
};

Map<String, String> validateLifeFields(
  LifeType type,
  Map<String, String> input,
) {
  final defaults = lifeDefaults(type);
  if (input.keys.any(
    (k) =>
        !defaults.containsKey(k) &&
        !(type == LifeType.application &&
            ['pipelineStage', 'outcome'].contains(k)),
  )) {
    lifeReject('Unsupported preset field.');
  }
  final v = {...defaults, ...input};
  for (final entry in v.entries) {
    if (entry.value.length >
            (['notes', 'description'].contains(entry.key) ? 20000 : 2000) ||
        entry.value.contains('\u0000')) {
      lifeReject('A field exceeds its supported limit.');
    }
  }
  v['title'] = v['title']!.trim();
  if (v['title']!.isEmpty || v['title']!.length > 200) {
    lifeReject('Enter a title of at most 200 characters.');
  }
  if (!['true', 'false'].contains(v['archived'])) {
    lifeReject('Invalid archive state.');
  }
  if ([LifeType.task, LifeType.learning, LifeType.book].contains(type)) {
    if (!lifeStatuses.contains(v['status'])) {
      lifeReject('Choose a supported preset status.');
    }
    for (final key in ['due', 'started', 'completed']) {
      if (v.containsKey(key)) lifeDate(v[key]!, optional: true);
    }
    if ((v['started'] ?? '').isNotEmpty &&
        v['completed']!.isNotEmpty &&
        v['completed']!.compareTo(v['started']!) < 0) {
      lifeReject('Completion cannot precede the started date.');
    }
    if (type == LifeType.task) {
      if (!['High', 'Normal', 'Low'].contains(v['priority'])) {
        lifeReject('Choose a supported priority.');
      }
    } else {
      final total = int.tryParse(v['total']!),
          progress = int.tryParse(v['progress']!);
      if (total == null ||
          total < 1 ||
          total > 1000000 ||
          progress == null ||
          progress < 0 ||
          progress > total) {
        lifeReject(
          'Progress must be between zero and the positive total (at most 1,000,000).',
        );
      }
      v['total'] = '$total';
      v['progress'] = '$progress';
      if (type == LifeType.book &&
          v['rating']!.isNotEmpty &&
          !['1', '2', '3', '4', '5'].contains(v['rating'])) {
        lifeReject('Rating must be between 1 and 5.');
      }
    }
  } else if (type == LifeType.document) {
    lifeId(v['application']!);
    final size = int.tryParse(v['size']!),
        sourceVersion = int.tryParse(v['sourceVersion']!);
    if (v['status'] != 'Linked' ||
        !['application/pdf', 'image/jpeg', 'image/png'].contains(v['mime']) ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(v['checksum']!) ||
        size == null ||
        size < 1 ||
        size > 10485760 ||
        sourceVersion == null ||
        sourceVersion < 1 ||
        sourceVersion > 1000000 ||
        RegExp(r'[\\/:\x00-\x1f\x7f]').hasMatch(v['title']!)) {
      lifeReject('Invalid bounded private Career document metadata.');
    }
  } else if (type == LifeType.application) {
    if (!careerStages.contains(v['status'])) {
      lifeReject('Choose a supported Career stage or outcome.');
    }
    if (v['company']!.trim().isEmpty || v['company']!.length > 200) {
      lifeReject('Enter the company (at most 200 characters).');
    }
    final phase = v['pipelineStage'] ?? v['status']!;
    if (v.containsKey('pipelineStage') || v.containsKey('outcome')) {
      final outcome = v['outcome'];
      if (!careerPipelineStages.contains(phase) ||
          outcome == null ||
          outcome.isNotEmpty && !careerOutcomes.contains(outcome) ||
          (phase == 'Accepted') != (outcome == 'Accepted') ||
          v['status'] != (outcome.isEmpty ? phase : outcome)) {
        lifeReject('Record the Career stage and distinct outcome explicitly.');
      }
    }
    lifeDate(v['date']!, optional: phase == 'Saved');
    if (phase == 'Saved' && v['date']!.isNotEmpty) {
      lifeReject(
        'A saved opportunity is not submitted and has no application date.',
      );
    }
    lifeDate(v['stageDate']!);
    if (v['date']!.isNotEmpty && v['stageDate']!.compareTo(v['date']!) < 0) {
      lifeReject('The stage date cannot precede submission.');
    }
    lifeDate(v['followUp']!, optional: true);
    if (![
      'onsite',
      'hybrid',
      'remote',
      'unspecified',
    ].contains(v['arrangement'])) {
      lifeReject('Choose a supported work arrangement.');
    }
    if (!RegExp(r'^[A-Z]{3}$').hasMatch(v['currency']!) ||
        !['hour', 'month', 'year'].contains(v['salaryPeriod'])) {
      lifeReject('Choose a salary currency and period.');
    }
    for (final key in ['salaryMin', 'salaryMax']) {
      if (v[key]!.isNotEmpty &&
          !RegExp(r'^(0|[1-9]\d{0,11})(\.\d{1,2})?$').hasMatch(v[key]!)) {
        lifeReject(
          'Use a nonnegative exact salary value with at most two decimal places.',
        );
      }
    }
    BigInt salary(String s) {
      final p = s.split('.');
      return BigInt.parse(p[0]) * BigInt.from(100) +
          BigInt.parse((p.length > 1 ? p[1] : '').padRight(2, '0'));
    }

    if (v['salaryMin']!.isNotEmpty &&
        v['salaryMax']!.isNotEmpty &&
        salary(v['salaryMin']!) > salary(v['salaryMax']!)) {
      lifeReject('Salary minimum exceeds maximum.');
    }
    if (v['postingUrl']!.isNotEmpty) {
      final uri = Uri.tryParse(v['postingUrl']!);
      if (uri == null ||
          !['http', 'https'].contains(uri.scheme) ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty) {
        lifeReject('Use an HTTP(S) posting URL without credentials.');
      }
    }
  } else {
    lifeDate(v['date']!);
    LifeTime.zone(v['timezone']!);
    if (!['Scheduled', 'Completed', 'Cancelled'].contains(v['status'])) {
      lifeReject('Choose a supported event status.');
    }
    if (!['', 'Earlier', 'Later'].contains(v['fold'])) {
      lifeReject('Choose a supported daylight-saving occurrence.');
    }
    final utc = v['time']!.isEmpty
        ? ''
        : LifeTime.instant(
            v['date']!,
            v['time']!,
            v['timezone']!,
            v['fold']!,
          ).toIso8601String();
    if (input['utc'] != null &&
        input['utc']!.isNotEmpty &&
        input['utc'] != utc) {
      lifeReject('UTC instant does not match the original timezone context.');
    }
    v['utc'] = utc;
    if (type == LifeType.careerEvent) {
      lifeId(v['application']!);
      if (!careerEventKinds.contains(v['eventKind'])) {
        lifeReject('Choose a supported Career event kind.');
      }
      if (['Interview', 'Assessment'].contains(v['eventKind']) &&
          v['time']!.isEmpty) {
        lifeReject('Interviews and assessments require a time and timezone.');
      }
      if ([
            'No response',
            'Response',
            'Submission',
            'Note',
            'Offer',
          ].contains(v['eventKind']) &&
          v['status'] != 'Completed') {
        lifeReject(
          'An observation is completed dated evidence, not an inferred outcome.',
        );
      }
    }
  }
  return Map.unmodifiable(v);
}

void lifeId(String id) {
  if (!RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      .hasMatch(id)) {
    lifeReject('Invalid stable Life identity.');
  }
}

class LifeCommand {
  LifeCommand({
    String? id,
    required this.owner,
    required this.recordId,
    required this.type,
    required this.expectedVersion,
    required Map<String, String> fields,
    required this.reason,
    DateTime? recordedAt,
  }) : id = id ?? newLocalId(),
       fields = validateLifeFields(type, fields),
       recordedAt = (recordedAt ?? DateTime.now()).toUtc() {
    lifeId(this.id);
    lifeId(owner);
    lifeId(recordId);
    if (expectedVersion < 0 ||
        expectedVersion > 1000000 ||
        reason.trim().isEmpty ||
        reason.length > 2000) {
      lifeReject('A supported source version and reason are required.');
    }
  }
  final String id, owner, recordId, reason;
  final LifeType type;
  final int expectedVersion;
  final Map<String, String> fields;
  final DateTime recordedAt;
  String get payload => canonicalJson({
    'contract': 5,
    'presetVersion': 1,
    'owner': owner,
    'record': recordId,
    'type': type.name,
    'expectedVersion': expectedVersion,
    'fields': fields,
    'reason': reason,
    'recordedAt': recordedAt.toIso8601String(),
  });
  factory LifeCommand.decode(String id, String payload) {
    final b = jsonDecode(payload) as Map;
    if (b.length != 9 ||
        b['contract'] != 5 ||
        b['presetVersion'] != 1 ||
        b['recordedAt'] is! String ||
        !(b['recordedAt'] as String).endsWith('Z')) {
      lifeReject('Unsupported Life command contract.');
    }
    final c = LifeCommand(
      id: id,
      owner: b['owner'] as String,
      recordId: b['record'] as String,
      type: LifeType.values.byName(b['type'] as String),
      expectedVersion: b['expectedVersion'] as int,
      fields: Map<String, String>.from(b['fields'] as Map),
      reason: b['reason'] as String,
      recordedAt: DateTime.parse(b['recordedAt'] as String),
    );
    if (c.payload != payload) {
      lifeReject('Life command must preserve its original canonical payload.');
    }
    return c;
  }
}

LifeRecord applyLifeCommand(Map<String, LifeRecord> current, LifeCommand c) {
  final old = current[c.recordId];
  if ((old?.version ?? 0) != c.expectedVersion ||
      old != null && (old.type != c.type || old.owner != c.owner)) {
    lifeReject(
      'This source changed. Review the current record and preserve your draft.',
    );
  }
  if (c.type == LifeType.careerEvent) {
    final parent = current[c.fields['application']];
    if (parent is! ApplicationRecord ||
        parent.owner != c.owner ||
        parent.archived ||
        parent.terminal) {
      lifeReject('Choose an active owned Career application.');
    }
    if (old != null && old.fields['application'] != parent.id) {
      lifeReject('A Career event cannot move between attempts.');
    }
  }
  if (c.type == LifeType.document) {
    final parent = current[c.fields['application']];
    if (parent is! ApplicationRecord ||
        parent.owner != c.owner ||
        old == null && '${parent.version}' != c.fields['sourceVersion']) {
      lifeReject('Choose the current owned Career application.');
    }
    if (old != null &&
        old.fields.entries.any(
          (entry) =>
              !['archived', 'notes'].contains(entry.key) &&
              c.fields[entry.key] != entry.value,
        )) {
      lifeReject(
        'Document byte/source metadata is immutable. Select a new original for a new link.',
      );
    }
    final docs = current.values.whereType<CareerDocumentRecord>();
    if (old == null &&
        (docs.length >= 1000 ||
            docs.fold<int>(0, (n, r) => n + int.parse(r.fields['size']!)) +
                    int.parse(c.fields['size']!) >
                1073741824)) {
      lifeReject(
        'Career document metadata exceeds the 1,000 object / 1 GiB limit.',
      );
    }
  }
  return LifeRecord.read(
    c.recordId,
    c.owner,
    c.expectedVersion + 1,
    c.type,
    c.fields,
  );
}

void validateLifeArchive(
  Map<String, dynamic> life,
  String owner, {
  required bool connected,
}) {
  if (life['contract'] != 1 ||
      life['presetVersion'] != 1 ||
      life['attachmentByteObjects'] != 0 ||
      life['revisions'] is! List ||
      life['intents'] is! List ||
      (life['revisions'] as List).length > 20000 ||
      (life['intents'] as List).length > 20000 ||
      !connected && (life['intents'] as List).isNotEmpty) {
    lifeReject('Unsupported Life archive coverage.');
  }
  final records = <String, LifeRecord>{}, payloads = <String, String>{};
  for (final raw in life['revisions'] as List) {
    final row = raw as Map,
        c = LifeCommand.decode(row['id'] as String, row['payload'] as String);
    if (c.owner != owner ||
        payloads.containsKey(c.id) ||
        DateTime.tryParse(row['recorded_at'] as String) == null) {
      lifeReject('Invalid Life archive history.');
    }
    records[c.recordId] = applyLifeCommand(records, c);
    payloads[c.id] = c.payload;
  }
  final intentIds = <String>{};
  for (final raw in life['intents'] as List) {
    final row = raw as Map,
        c = LifeCommand.decode(row['id'] as String, row['payload'] as String);
    if (c.owner != owner ||
        !intentIds.add(c.id) ||
        payloads.containsKey(c.id) && payloads[c.id] != c.payload ||
        ![
          'pending',
          'accepted',
          'reconciled',
          'review',
          'restored',
        ].contains(row['state'])) {
      lifeReject('Invalid original Life recovery intent.');
    }
    // Rejected/conflicting intent is retained as evidence, never applied to the
    // replacement graph or automatically granted authority by an archive.
  }
  final decisions = <String>{};
  for (final raw in life['resolutions'] as List? ?? []) {
    final row = raw as Map;
    if (!intentIds.contains(row['intent_id']) ||
        !decisions.add(row['intent_id'] as String) ||
        row['replacement_id'] != null &&
            !payloads.containsKey(row['replacement_id']) &&
            !intentIds.contains(row['replacement_id']) ||
        DateTime.tryParse(row['recorded_at'] as String) == null) {
      lifeReject('Invalid retained Life review decision.');
    }
  }
  if (life['viewPreferences'] case final Map prefs) {
    validateLifeView(Map<String, dynamic>.from(prefs));
  }
}

void validateLifeView(Map<String, dynamic> prefs) {
  if (prefs.length != 3 ||
      prefs['timezone'] is! String ||
      prefs['tabs'] is! Map ||
      prefs['calendar'] is! Map) {
    lifeReject('Unsupported Life visibility preferences.');
  }
  LifeTime.zone(prefs['timezone'] as String);
  for (final entry in (prefs['tabs'] as Map).entries) {
    if (!['Tasks', 'Learning', 'Books', 'Career'].contains(entry.key) ||
        entry.value is! bool) {
      lifeReject('Unsupported Life navigation preference.');
    }
  }
  for (final entry in (prefs['calendar'] as Map).entries) {
    if (![
          'Personal',
          'Tasks',
          'Learning',
          'Books',
          'Career',
          'Debts',
          'Cards',
          'Recurring',
        ].contains(entry.key) ||
        entry.value is! bool) {
      lifeReject('Unsupported Calendar visibility preference.');
    }
  }
}
