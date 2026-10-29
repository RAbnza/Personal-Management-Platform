// Explicit no-image native suite. Never import gallery/image-capture targets.
import 'package:flutter_test/flutter_test.dart';

import 'p6_release_test.dart' as release;
import 'p1_local_money_test.dart' as money;
import 'p4_cards_test.dart' as cards;
import 'p4_debts_test.dart' as debts;
import 'p4_planning_test.dart' as planning;
import 'p5_life_native_test.dart' as life;
import 'android_overview_polish_test.dart' as polish;

void main() {
  WidgetController.hitTestWarningShouldBeFatal = true;
  release.main();
  money.main();
  cards.main();
  debts.main();
  planning.main();
  life.main();
  polish.main();
}
