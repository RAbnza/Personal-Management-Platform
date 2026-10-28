"""Verify actual PE icon bytes and decoded APK resources without rendering UI.

Usage: python scripts/salapiya/verify-packaged-icons.py --windows EXE --android APK
Pillow 11.2.1. The small PE reader accepts standard PE32/PE32+ resource tables.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'apps/salapiya'


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


def apk_icons(path):
    manifest = json.loads((APP / 'assets/branding/native-icons.json').read_text())
    checked = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        for source in manifest['outputs']:
            if not source.endswith('.png'):
                continue
            resource = source.split('/res/')[1]
            folder, filename = resource.split('/')
            # aapt may append -v4 to density qualifiers without changing pixels.
            matches = [n for n in names if n.startswith('res/' + folder) and n.endswith('/' + filename)]
            assert len(matches) == 1, f'Missing density resource {resource}'
            original = Image.open(APP / source).convert('RGBA')
            packed = Image.open(io.BytesIO(archive.read(matches[0]))).convert('RGBA')
            assert original.size == packed.size and original.tobytes() == packed.tobytes(), resource
            checked.append(resource)
        for qualifier in ['v26', 'v33']:
            assert any(n.startswith('res/mipmap-anydpi-' + qualifier) and n.endswith('/ic_launcher.xml') for n in names)
        assert 'res/xml/data_extraction_rules.xml' in names
    return {'androidPngResources': len(checked), 'adaptiveAndThemedXmlPresent': True,
            'apkSha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'limits': 'Binary XML references must also be checked with aapt2; appearance remains owner review.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--windows')
    parser.add_argument('--android')
    args = parser.parse_args()
    result = {}
    if args.windows:
        result.update(pe_icons(args.windows))
    if args.android:
        result.update(apk_icons(args.android))
    print(json.dumps(result))
