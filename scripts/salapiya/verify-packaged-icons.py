"""Verify actual PE icon bytes and decoded APK resources without rendering UI.

Usage: python scripts/salapiya/verify-packaged-icons.py --windows EXE --android APK
Pillow 11.2.1. The small PE reader accepts standard PE32/PE32+ resource tables.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import subprocess
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'apps/salapiya'


def visible_rgba(image):
    pixels = bytearray(image.convert('RGBA').tobytes())
    # aapt may canonicalize invisible RGB in fully transparent PNG pixels.
    # Every alpha value and every visible color must remain exactly equal.
    for offset in range(0, len(pixels), 4):
        if pixels[offset + 3] == 0:
            pixels[offset:offset + 3] = b'\0\0\0'
    return bytes(pixels)


def pe_icons(path):
    data = Path(path).read_bytes()
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    assert data[pe:pe + 4] == b'PE\0\0'
    sections, optional_size = struct.unpack_from('<H12xH', data, pe + 6)
    optional = pe + 24
    directory = optional + (112 if struct.unpack_from('<H', data, optional)[0] == 0x20b else 96)
    resource_rva = struct.unpack_from('<I', data, directory + 16)[0]
    section_start = optional + optional_size
    def offset(rva):
        for i in range(sections):
            size, address, raw_size, raw = struct.unpack_from('<IIII', data, section_start + i * 40 + 8)
            if address <= rva < address + max(size, raw_size):
                return raw + rva - address
        raise ValueError('Invalid PE resource address')
    base = offset(resource_rva)
    resources = {}
    def walk(relative, names=()):
        table = base + relative
        named, ids = struct.unpack_from('<HH', data, table + 12)
        for i in range(named + ids):
            name, target = struct.unpack_from('<II', data, table + 16 + i * 8)
            if target & 0x80000000:
                walk(target & 0x7fffffff, names + (name,))
            else:
                rva, length = struct.unpack_from('<II', data, base + target)
                resources[names + (name,)] = data[offset(rva):offset(rva) + length]
    walk(0)
    ico = (APP / 'windows/runner/resources/app_icon.ico').read_bytes()
    count = struct.unpack_from('<H', ico, 4)[0]
    expected = {}
    for i in range(count):
        width, height, _, _, _, _, length, pos = struct.unpack_from('<BBBBHHII', ico, 6 + i * 16)
        expected[(width or 256, height or 256)] = ico[pos:pos + length]
    groups = [v for k, v in resources.items() if k[0] == 14]
    assert len(groups) == 1, 'Expected one application icon group'
    group = groups[0]
    assert struct.unpack_from('<H', group, 4)[0] == count
    actual = []
    for i in range(count):
        width, height, _, _, _, _, length, resource_id = struct.unpack_from('<BBBBHHIH', group, 6 + i * 14)
        frame = next(v for k, v in resources.items() if k[0] == 3 and k[1] == resource_id)
        size = (width or 256, height or 256)
        assert frame == expected[size] and len(frame) == length, f'Packaged icon differs: {size}'
        actual.append(size[0])
    return {'windowsSizes': sorted(actual), 'executableSha256': hashlib.sha256(data).hexdigest()}


def apk_icons(path, aapt2=None):
    manifest = json.loads((APP / 'assets/branding/native-icons.json').read_text())
    checked = []
    resource_files, resource_ids = {}, {}
    if aapt2:
        table = subprocess.check_output([aapt2, 'dump', 'resources', str(path)], text=True, encoding='utf-8')
        current = None
        for line in table.splitlines():
            entry = re.match(r'\s*resource (0x[0-9a-fA-F]+) (\S+)', line)
            if entry:
                current = entry[2]
                resource_ids[current] = entry[1].lower()
                resource_files[current] = {}
            value = re.match(r'\s*\(([^)]*)\) \(file\) (\S+) type=', line)
            if value and current:
                resource_files[current][value[1]] = value[2]
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        for source in manifest['outputs']:
            if not source.endswith('.png'):
                continue
            resource = source.split('/res/')[1]
            folder, filename = resource.split('/')
            # aapt may append -v4 to density qualifiers without changing pixels.
            if aapt2:
                kind, density = folder.split('-', 1)
                variants = resource_files.get(kind + '/' + Path(filename).stem, {})
                matches = [value for qualifier, value in variants.items()
                           if qualifier.split('-')[0] == density]
            else:
                matches = [n for n in names if n.startswith('res/' + folder) and n.endswith('/' + filename)]
            assert len(matches) == 1, f'Missing density resource {resource}'
            original = Image.open(APP / source).convert('RGBA')
            packed = Image.open(io.BytesIO(archive.read(matches[0]))).convert('RGBA')
            assert original.size == packed.size and visible_rgba(original) == visible_rgba(packed), resource
            checked.append(resource)
        for qualifier in ['v26', 'v33']:
            if aapt2:
                packed_xml = resource_files['mipmap/ic_launcher']['anydpi-' + qualifier]
                decoded = subprocess.check_output([aapt2, 'dump', 'xmltree', str(path), '--file', packed_xml], text=True, encoding='utf-8').lower()
                expected_refs = {'background': 'color/ic_launcher_background',
                                 'foreground': 'drawable/ic_launcher_foreground'}
                if qualifier == 'v33':
                    expected_refs['monochrome'] = 'drawable/ic_launcher_monochrome'
                for element, target in expected_refs.items():
                    assert re.search(r'e: ' + element + r'[^\n]*\n\s*a: [^\n]*:drawable[^\n]*=@' + resource_ids[target], decoded), (qualifier, element)
            else:
                assert any(n.startswith('res/mipmap-anydpi-' + qualifier) and n.endswith('/ic_launcher.xml') for n in names)
        extraction = resource_files['xml/data_extraction_rules'][''] if aapt2 else 'res/xml/data_extraction_rules.xml'
        assert extraction in names
        if aapt2:
            def xml_tree(name):
                return subprocess.check_output([aapt2, 'dump', 'xmltree', str(path), '--file', name], text=True, encoding='utf-8')
            android_manifest = xml_tree('AndroidManifest.xml')
            for attribute in ['allowBackup', 'fullBackupContent']:
                assert re.search(':' + attribute + r'\([^\n]*\)=false', android_manifest), attribute
            debug = re.findall(r':debuggable\([^\n]*\)=([^\n]+)', android_manifest)
            assert not debug or debug == ['false'], 'Release APK is debuggable'
            for attribute, target in [('icon', 'mipmap/ic_launcher'), ('dataExtractionRules', 'xml/data_extraction_rules')]:
                assert re.search(':' + attribute + r'\([^\n]*\)=@' + resource_ids[target], android_manifest)
            for attribute, value in [('scheme', 'dev.salapiya.p0'), ('host', 'auth'), ('path', '/callback')]:
                assert re.search(':' + attribute + r'\([^\n]*\)="' + re.escape(value) + '"', android_manifest)
            sections = re.split(r'\n +E: (cloud-backup|device-transfer)[^\n]*\n', xml_tree(extraction))
            assert len(sections) == 5 and set(sections[1::2]) == {'cloud-backup', 'device-transfer'}
            for body in sections[2::2]:
                assert set(re.findall(r' A: domain="([a-z]+)"', body)) == {'root', 'file', 'database', 'sharedpref', 'external'}
                assert len(re.findall(r'E: exclude ', body)) == 5
                assert len(re.findall(r' A: path="\."', body)) == 5
    return {'androidPngResources': len(checked), 'adaptiveAndThemedXmlPresent': True,
            'apkSha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'binaryXmlReferencesVerified': bool(aapt2),
            'releaseManifestAndBackupExclusionsVerified': bool(aapt2),
            'limits': 'Launcher/OS appearance remains owner review; decoded pixels and resource references do not capture UI.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--windows')
    parser.add_argument('--android')
    parser.add_argument('--aapt2', help='Official build-tools aapt2, required for optimized resource paths')
    args = parser.parse_args()
    result = {}
    if args.windows:
        result.update(pe_icons(args.windows))
    if args.android:
        result.update(apk_icons(args.android, args.aapt2))
    print(json.dumps(result))
