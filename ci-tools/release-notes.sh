#!/usr/bin/env bash
# Extract this tag's CHANGELOG section into RELEASE_NOTES.md, for the `release`
# job to use as the GitLab Release description. Reads $CI_COMMIT_TAG (vX.Y.Z).
set -euo pipefail

tag="${CI_COMMIT_TAG:-}"
if [ -z "$tag" ]; then
    echo "ERROR: CI_COMMIT_TAG is not set; run this from a tag pipeline." >&2
    exit 1
fi

version="${tag#v}"

echo "==> Extract changelog section for $version"
# Print the lines under the `## <version>` heading up to the next `## `.
awk -v ver="$version" '
  /^## / { if (capture) exit; if (index($0, ver)) { capture=1; next } }
  capture { print }
' CHANGELOG.md > RELEASE_NOTES.md

if [ ! -s RELEASE_NOTES.md ]; then
    echo "No changelog entry found for $version; falling back to tag name." >&2
    echo "Release $tag" > RELEASE_NOTES.md
fi

cat RELEASE_NOTES.md
