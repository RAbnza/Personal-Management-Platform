"""Scan source, native executables/APK contents and proof logs without printing matches."""
import json
from pathlib import Path
import subprocess
import sys
import urllib.parse
import zipfile

values = json.load(sys.stdin)
patterns = set()
for value in values:
    for encoded in (value, urllib.parse.quote(value, safe="")):
        patterns.add(encoded.encode())
        patterns.add(encoded.encode("utf-16le"))
overlap = max(map(len, patterns)) - 1
root = Path.cwd().parents[2]
paths = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root
).decode().split("\0")
files = {root / path for path in paths if path}
app = root / "apps/salapiya"
files.update((app / "build").glob("p0-*.log"))
files.update((app / "build").glob("p2-*.log"))
files.update((app / "build").glob("p3-*.log"))
files.update((app / "build").glob("p4-*.log"))
files.update((app / "build").glob("p5-*.log"))
files.update((app / "build").glob("p6-*.log"))
files.update((app / "build").glob("release-*.log"))
files.update((root / "out").glob("release-*.log"))
for extension in ("*.log", "*.txt", "*.json", "*.xml"):
    files.update((root / "out/release-gate").rglob(extension))
for extension in ("*.log", "*.txt", "*.json"):
    files.update((app / "build/private-release").rglob(extension))
for configuration in ("Debug", "Release"):
    native = app / "build/windows/x64/runner" / configuration
    files.update(native.glob("*.exe"))
    files.update(native.glob("*.dll"))
    files.update(native.rglob("kernel_blob.bin"))
    files.update(native.rglob("app.so"))
files.update((app / "build/app/outputs/flutter-apk").glob("*.apk"))
files.update((app / "build/private-release").rglob("*.apk"))
files.update((app / "build/private-release").rglob("*.zip"))
files.update((app / "build/private-release").rglob("*.exe"))

def contains_secret(stream):
    prior = b""
    while block := stream.read(1024 * 1024):
        data = prior + block
        if any(pattern in data for pattern in patterns):
            return True
        prior = data[-overlap:]
    return False

hits = []
scanned = 0
for file in sorted(files):
    if not file.is_file():
        continue
    scanned += 1
    label = str(file.relative_to(root))
    with file.open("rb") as stream:
        if contains_secret(stream):
            hits.append(label)
    if file.suffix in (".apk", ".zip"):
        with zipfile.ZipFile(file) as archive:
            for member in archive.infolist():
                if member.is_dir():
                    continue
                with archive.open(member) as stream:
                    if contains_secret(stream):
                        hits.append(label + ":" + member.filename)
print(json.dumps({"credentialScanFiles": scanned, "matchingPaths": hits,
                  "scope": "working source, P0-P6/release logs and proof metadata, Debug/Release Windows binaries, versioned installers and decompressed APK/ZIP contents"}))
sys.exit(bool(hits))
