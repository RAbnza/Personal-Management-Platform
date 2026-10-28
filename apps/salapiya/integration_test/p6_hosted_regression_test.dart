// Real hosted sessions and the isolated encrypted capacity fixture; no images.
import 'p3_native_test.dart' as shared;
import 'p4_connected_cards_test.dart' as cards;
import 'p5_connected_native_test.dart' as life;
import 'p6_capacity_native_test.dart' as capacity;
import 'p5_notifications_native_test.dart' as notifications;

void main() {
  shared.main();
  cards.main();
  life.main();
  capacity.main();
  notifications.main();
}
