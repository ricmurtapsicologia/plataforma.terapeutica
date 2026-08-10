#!/usr/bin/env python3
"""P0 guardrail for a public code-only repository.

Fails CI when tracked files look like clinical data stores, private keys, local
secrets, or accidentally committed credential material. It intentionally does
not inspect or infer patient identities.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FORBIDDEN_PATH_PATTERNS = [
    re.compile(r"(^|/)\.clinic-sync(/|$)", re.I),
    re.compile(r"(^|/)\.env(?:\.|$)", re.I),
    re.compile(r"(^|/)(?:clinical|clinic|patient|patients)[-_ ]?(?:export|backup)", re.I),
    re.compile(r"(^|/).*vault(?:[-_ ]?backup)?\.json$", re.I),
    re.compile(r"\.(?:rmvault|sqlite|sqlite3|db|p12|pfx|pem|key)$", re.I),
]

SECRET_PATTERNS = [
    ("GitHub token", re.compile(r"\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b")),
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("OAuth client secret", re.compile(r"(?i)client_secret\s*[:=]\s*['\"][^'\"]{12,}['\"]")),
    ("embedded bearer token", re.compile(r"(?i)authorization\s*[:=]\s*['\"]Bearer\s+[A-Za-z0-9._~+/-]{20,}['\"]")),
]

TEXT_EXTENSIONS = {
    ".html", ".js", ".mjs", ".cjs", ".css", ".json", ".md", ".txt",
    ".py", ".yml", ".yaml", ".toml", ".ini", ".xml", ".webmanifest",
}

MAX_SCAN_BYTES = 2_000_000


def tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    return [p.decode("utf-8", "surrogateescape") for p in result.stdout.split(b"\0") if p]


def main() -> int:
    errors: list[str] = []
    files = tracked_files()

    for rel in files:
        normalized = rel.replace("\\", "/")
        for pattern in FORBIDDEN_PATH_PATTERNS:
            if pattern.search(normalized):
                errors.append(f"forbidden tracked path: {normalized}")
                break

        path = ROOT / rel
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > MAX_SCAN_BYTES:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for label, pattern in SECRET_PATTERNS:
            if pattern.search(text):
                errors.append(f"possible {label} in: {normalized}")

    if errors:
        print("P0 PUBLIC REPO GUARD: BLOCKED", file=sys.stderr)
        for item in sorted(set(errors)):
            print(f" - {item}", file=sys.stderr)
        print("Use synthetic data only and keep clinical stores/secrets outside this public repository.", file=sys.stderr)
        return 1

    print(f"P0 PUBLIC REPO GUARD: OK ({len(files)} tracked files checked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
