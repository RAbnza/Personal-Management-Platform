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
files.update((app / "build/windows/x64/runner/Debug").glob("*.exe"))
files.update((app / "build/windows/x64/runner/Debug").glob("*.dll"))
files.update((app / "build/app/outputs/flutter-apk").glob("app-debug.apk"))

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
    if file.suffix == ".apk":
        with zipfile.ZipFile(file) as archive:
            for member in archive.infolist():
                if member.is_dir():
                    continue
                with archive.open(member) as stream:
                    if contains_secret(stream):
                        hits.append(label + ":" + member.filename)
print(json.dumps({"credentialScanFiles": scanned, "matchingPaths": hits,
                  "scope": "working source, proof logs, Debug Windows binaries and decompressed debug APK"}))
sys.exit(bool(hits))
