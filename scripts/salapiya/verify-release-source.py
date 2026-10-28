"""Check release identity and fail-closed configuration without compiling UI."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'apps/salapiya'
version = re.search(r'^version: (\S+)$', (APP / 'pubspec.yaml').read_text(), re.M)[1]
assert f"'{version}'" in (APP / 'lib/app/release_identity.dart').read_text()
gradle = (APP / 'android/app/build.gradle.kts').read_text()
assert 'applicationId = "dev.salapiya.salapiya"' in gradle
assert 'signingConfigs.getByName("debug")' not in gradle
assert 'SALAPIYA_UNSIGNED_STAGING' in gradle and 'Release signing is required' in gradle
android = '{http://schemas.android.com/apk/res/android}'
manifest = ET.parse(APP / 'android/app/src/main/AndroidManifest.xml').getroot()
app = manifest.find('application')
assert app.get(android + 'allowBackup') == 'false'
assert app.get(android + 'fullBackupContent') == 'false'
assert app.get(android + 'dataExtractionRules') == '@xml/data_extraction_rules'
assert app.get(android + 'icon') == '@mipmap/ic_launcher'
data = manifest.find('.//data')
assert data.get(android + 'scheme') == 'dev.salapiya.p0'
assert data.get(android + 'host') == 'auth' and data.get(android + 'path') == '/callback'
rules = ET.parse(APP / 'android/app/src/main/res/xml/data_extraction_rules.xml').getroot()
for section in ['cloud-backup', 'device-transfer']:
    assert {e.get('domain') for e in rules.find(section)} == {'root', 'file', 'database', 'sharedpref', 'external'}
    assert all(e.tag == 'exclude' and e.get('path') == '.' for e in rules.find(section))
for api in [26, 33]:
    icon = ET.parse(APP / f'android/app/src/main/res/mipmap-anydpi-v{api}/ic_launcher.xml').getroot()
    assert icon.find('foreground').get(android + 'drawable') == '@drawable/ic_launcher_foreground'
    if api == 33:
        assert icon.find('monochrome').get(android + 'drawable') == '@drawable/ic_launcher_monochrome'
suite = (APP / 'integration_test/p6_local_regression_test.dart').read_text()
assert 'final_redesign_test.dart' not in suite and 'gallery' not in suite.replace('// Explicit no-image native suite. Never import gallery/image-capture targets.', '')
print(f'Release identity {version}, signing guard, callback, backup exclusions and adaptive/themed references verified.')
