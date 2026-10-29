"""Write the D1 full source/configuration snapshot and exact file inventory.

Run from any directory with Python 3. Uses only the standard library and Git.
The D0 baseline is fixed so the output remains reproducible after committing D1.
Generated inventory excludes its own hash to avoid a recursive checksum.
"""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BASE = "7914b72310d2979b9d7d80885c587b0437585194"
DOCS = ROOT / "docs/salapiya/design"


def git_paths(*args):
    raw = subprocess.check_output(["git", "-C", str(ROOT), *args])
    return {p for p in raw.decode("utf-8").split("\0") if p}


def main():
    changed = git_paths("diff", "--name-only", "-z", BASE)
    changed |= git_paths("ls-files", "--others", "--exclude-standard", "-z")
    changed = {p for p in changed if (ROOT / p).is_file()}
    code = sorted(p for p in changed if (
        p.startswith("apps/salapiya/") and Path(p).suffix in {".dart", ".yaml", ".lock", ".json"}
        or p.startswith("scripts/salapiya/") and Path(p).suffix in {".cjs", ".py"}
    ))
    lines = ["# D1 complete authored code and configuration", "",
             "Full UTF-8 file contents, not diffs or excerpts. Generated with",
             "`python scripts/salapiya/write-source-snapshot.py` against approved D0.",
             "Binary fonts/logos and unchanged third-party notices are linked in",
             "[the exact file inventory](D1_FILES.json); rendered evidence has its",
             "[own review index](review/d1/README.md). Source files remain authoritative.", ""]
    for path in code:
        contents = (ROOT / path).read_text(encoding="utf-8-sig")
        language = {".dart": "dart", ".yaml": "yaml", ".lock": "yaml", ".json": "json", ".cjs": "javascript", ".py": "python"}[Path(path).suffix]
        lines += [f"## {path}", "", f"````{language}", contents.rstrip("\n"), "````", ""]
    snapshot = DOCS / "D1_SOURCE_SNAPSHOT.md"
    snapshot.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    changed.add(snapshot.relative_to(ROOT).as_posix())
    inventory = DOCS / "D1_FILES.json"
    changed.add(inventory.relative_to(ROOT).as_posix())
    previous = git_paths("ls-tree", "-r", "--name-only", "-z", BASE)
    files = []
    for path in sorted(changed):
        full = ROOT / path
        own = full == inventory
        data = b"" if own else full.read_bytes()
        files.append({"path": path, "status": "modified" if path in previous else "created",
                      "bytes": None if own else len(data),
                      "sha256": None if own else hashlib.sha256(data).hexdigest()})
    inventory.write_text(json.dumps({"baseline": BASE, "note": "Hashes describe local file bytes; Git may normalize line endings. Inventory omits its own recursive hash.", "codeFilesInSnapshot": code, "files": files}, indent=2)+"\n", encoding="utf-8", newline="\n")
    print(f"Snapshot: {len(code)} complete code/config files. Inventory: {len(files)} files.")


if __name__ == "__main__":
    main()
