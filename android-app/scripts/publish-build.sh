#!/usr/bin/env bash
# Commits the result of a build (APKs, checksums, report, log) to the branch `android-builds`.
# Older APKs are removed from the branch tip so that it holds only the latest build; they stay in its
# history. Only that branch is written to.
set -euo pipefail
REPO_URL="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
PUB="$(mktemp -d)"
if git ls-remote --exit-code --heads "$REPO_URL" android-builds >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch android-builds "$REPO_URL" "$PUB"
else
  git -C "$PUB" init --quiet -b android-builds
  git -C "$PUB" remote add origin "$REPO_URL"
fi
cd "$PUB"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
find . -maxdepth 1 -type f ! -name '.git*' -delete
DIST="$GITHUB_WORKSPACE/android-app/dist"
[ -d "$DIST" ] && cp "$DIST"/* . 2>/dev/null || true
# The tail of the log is what matters when a build fails.
tail -n 600 "$GITHUB_WORKSPACE/build.log" > build-log-tail.txt 2>/dev/null || echo "no log" > build-log-tail.txt
{
  echo "build outcome: ${BUILD_OUTCOME:-unknown}"
  echo "run: ${GITHUB_RUN_NUMBER} (${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})"
  echo "commit: ${GITHUB_SHA}"
  echo "date: $(date -u +%FT%TZ)"
} > STATUS.txt
git add -A
git commit --quiet -m "Build ${GITHUB_RUN_NUMBER} of ${GITHUB_SHA:0:7}: ${BUILD_OUTCOME:-unknown}" || exit 0
git push --quiet origin android-builds
