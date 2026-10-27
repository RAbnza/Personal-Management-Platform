import 'dart:convert';
import 'dart:io';

import 'package:salapiya/life/life_domain.dart';

void main() {
  String id(int n) =>
      '50000000-0000-4000-8000-${n.toRadixString(16).padLeft(12, '0')}';
  final owner = id(1),
      commands = <LifeCommand>[],
      records = <String, LifeRecord>{};
  var serial = 100;
  void add(
    int record,
    LifeType type,
    Map<String, String> fields,
    String reason,
  ) {
    final old = records[id(record)];
    final c = LifeCommand(
      id: id(serial++),
      owner: owner,
      recordId: id(record),
      type: type,
      expectedVersion: old?.version ?? 0,
      fields: {...?old?.fields, ...fields},
      reason: reason,
      recordedAt: DateTime.utc(2026, 10, 26, 8, serial - 100),
    );
    records[c.recordId] = applyLifeCommand(records, c);
    commands.add(c);
  }

  add(2, LifeType.task, {
    'title': 'Synthetic task',
    'due': '2026-11-01',
    'status': 'Not started',
  }, 'Created');
  add(2, LifeType.task, {
    'status': 'Completed',
    'completed': '2026-10-25',
  }, 'Explicit completion; manual date is a field value');
  add(2, LifeType.task, {'status': 'In progress'}, 'Reopened');
  add(2, LifeType.task, {'archived': 'true'}, 'Archived');
  add(2, LifeType.task, {'archived': 'false'}, 'Restored');
  add(3, LifeType.learning, {
    'title': 'Synthetic learning',
    'total': '12',
    'progress': '4',
    'due': '2026-11-04',
    'started': '2026-10-20',
  }, 'Created');
  add(3, LifeType.learning, {
    'progress': '12',
    'status': 'Completed',
  }, 'Explicit progress completion');
  add(3, LifeType.learning, {
    'progress': '10',
    'status': 'In progress',
  }, 'Progress correction and reopening');
  add(4, LifeType.book, {
    'title': 'Synthetic book',
    'detail': 'Synthetic author',
    'total': '256',
    'progress': '20',
    'rating': '4',
  }, 'Created');
  add(4, LifeType.book, {
    'progress': '256',
    'status': 'Completed',
    'completed': '2026-10-26',
  }, 'Finished');
  add(5, LifeType.personal, {
    'title': 'Synthetic appointment',
    'date': '2026-11-01',
    'time': '09:30',
    'timezone': 'Asia/Manila',
  }, 'Created timed appointment');
  add(5, LifeType.personal, {'date': '2026-11-02', 'utc': ''}, 'Rescheduled');
  add(6, LifeType.personal, {
    'title': 'Synthetic civil event',
    'date': '2026-11-02',
  }, 'Created all day');
  add(6, LifeType.personal, {'status': 'Cancelled'}, 'Cancelled');
  add(7, LifeType.application, {
    'title': 'Synthetic role',
    'company': 'Synthetic employer',
    'stageDate': '2026-10-20',
  }, 'Saved independent attempt');
  add(7, LifeType.application, {
    'date': '2026-10-21',
    'stageDate': '2026-10-21',
    'status': 'Applied',
  }, 'Submitted');
  add(7, LifeType.application, {
    'stageDate': '2026-10-23',
    'status': 'Interview',
  }, 'Skipped screening');
  add(8, LifeType.careerEvent, {
    'title': 'Interview',
    'application': id(7),
    'eventKind': 'Interview',
    'date': '2026-11-03',
    'time': '10:00',
    'timezone': 'Asia/Manila',
  }, 'First interview');
  add(8, LifeType.careerEvent, {
    'date': '2026-11-04',
    'utc': '',
  }, 'Rescheduled authoritative interview');
  add(9, LifeType.careerEvent, {
    'title': 'Interview',
    'application': id(7),
    'eventKind': 'Interview',
    'date': '2026-11-06',
    'time': '10:00',
    'timezone': 'Asia/Manila',
  }, 'Repeated independent interview');
  add(10, LifeType.careerEvent, {
    'title': 'No response',
    'application': id(7),
    'eventKind': 'No response',
    'date': '2026-10-25',
    'status': 'Completed',
  }, 'Dated observation, not rejection');
  add(7, LifeType.application, {
    'stageDate': '2026-10-25',
    'status': 'Technical assessment',
  }, 'Nonlinear stage change');
  add(11, LifeType.careerEvent, {
    'title': 'Assessment',
    'application': id(7),
    'eventKind': 'Assessment',
    'date': '2026-11-10',
    'time': '14:00',
  }, 'Scheduled assessment');
  add(12, LifeType.document, {
    'title': 'resume.pdf',
    'application': id(7),
    'sourceVersion': '4',
    'mime': 'application/pdf',
    'size': '8',
    'checksum': 'a' * 64,
  }, 'Metadata only; no cloud bytes');
  add(7, LifeType.application, {
    'stageDate': '2026-10-26',
    'status': 'Declined offer',
  }, 'Distinct outcome');
  File('../../contracts/salapiya/p5_life.json').writeAsStringSync(
    jsonEncode({
      'contract': 1,
      'profile': owner,
      'commands': [
        for (final c in commands) {'id': c.id, 'payload': c.payload},
      ],
    }),
  );
}
