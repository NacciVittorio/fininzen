#!/usr/bin/env python3
"""Stamp the pending release-notes entry with the version being released.

User-facing release notes live in web/src/content/releaseNotes.ts and have to be
written *before* `just release` runs — but the version number doesn't exist until
commitizen derives it from the commits. So notes are written against the
`UNRELEASED` placeholder and this hook rewrites it in place, giving it the real
number and today's date.

Runs as a commitizen pre_bump_hook (see .cz.toml), after VERSION has been
rewritten and before the bump commit, so the stamped file lands in that commit.

A release with no pending entry is a normal outcome — a dependency-only bump has
nothing to announce — so this is a no-op then, and the app shows no banner for
that version.
"""

import datetime
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
NOTES = ROOT / "web" / "src" / "content" / "releaseNotes.ts"

# `version: UNRELEASED,` followed by the `date: "",` on the next line. Capturing
# the whitespace between them preserves the file's indentation on rewrite.
PENDING = re.compile(r'version:\s*UNRELEASED,(\s*)date:\s*"",')


def main() -> int:
    # cz exports the computed version; the VERSION file is the same value by the
    # time hooks run, and keeps the script usable by hand.
    version = (
        os.environ.get("CZ_PRE_NEW_VERSION") or (ROOT / "VERSION").read_text().strip()
    )
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        print(f"stamp_release_notes: refusing to stamp bogus version {version!r}")
        return 1

    source = NOTES.read_text()
    matches = PENDING.findall(source)
    if not matches:
        print(f"stamp_release_notes: no pending entry, {version} ships without notes.")
        return 0
    if len(matches) > 1:
        print("stamp_release_notes: more than one pending entry, refusing to guess.")
        return 1

    today = datetime.date.today().isoformat()
    stamped = PENDING.sub(
        lambda m: f'version: "{version}",{m.group(1)}date: "{today}",', source
    )
    NOTES.write_text(stamped)
    print(f"stamp_release_notes: stamped release notes as {version} ({today}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
