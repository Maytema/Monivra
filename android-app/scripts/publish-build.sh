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
if [ -n "${PUBLISH_DIR:-}" ]; then
  # Results of the emulator test go to a folder of their own; the build's files stay.
  rm -rf "$PUBLISH_DIR"; mkdir -p "$PUBLISH_DIR"
  [ -d "$GITHUB_WORKSPACE/$PUBLISH_FROM" ] && cp -r "$GITHUB_WORKSPACE/$PUBLISH_FROM"/. "$PUBLISH_DIR"/ || true
  {
    echo "emulator test outcome: ${BUILD_OUTCOME:-unknown}"
    echo "run: ${GITHUB_RUN_NUMBER} (${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})"
    echo "commit: ${GITHUB_SHA}"
    echo "date: $(date -u +%FT%TZ)"
  } > "$PUBLISH_DIR/STATUS.txt"
  MESSAGE="Emulator results of run ${GITHUB_RUN_NUMBER}: ${BUILD_OUTCOME:-unknown}"
else
  find . -maxdepth 1 -type f ! -name '.git*' -delete
  DIST="$GITHUB_WORKSPACE/android-app/dist"
  if [ -d "$DIST" ]; then
    if [ -f "$DIST/.owner-signed" ]; then
      cp "$DIST"/* . 2>/dev/null || true
    else
      # Not signed with the owner's key: the reports go out, the APKs do not.
      for f in "$DIST"/*; do case "$f" in *.apk) ;; *) cp "$f" . 2>/dev/null || true ;; esac; done
      # The release APK goes out only under a name that says it is to be re-signed: its one-run key
      # cannot update anything. apksigner.jar (from the runner's SDK) lets the owner's key be applied
      # elsewhere, since the key itself never enters this repository or its secrets.
      for f in "$DIST"/monivra-*.apk; do case "$f" in *-debuggable.apk) ;; *) cp "$f" "RESIGN-ONLY-$(basename "$f")" ;; esac; done
      echo "These APKs are signed with a one-run key and are NOT for installing: re-sign them with the owner key." > NO-APK.txt
    fi
  fi
  # The tail of the log is what matters when a build fails.
  tail -n 600 "$GITHUB_WORKSPACE/build.log" > build-log-tail.txt 2>/dev/null || echo "no log" > build-log-tail.txt
  {
    echo "build outcome: ${BUILD_OUTCOME:-unknown}"
    echo "run: ${GITHUB_RUN_NUMBER} (${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID})"
    echo "commit: ${GITHUB_SHA}"
    echo "date: $(date -u +%FT%TZ)"
  } > STATUS.txt
  MESSAGE="Build ${GITHUB_RUN_NUMBER} of ${GITHUB_SHA:0:7}: ${BUILD_OUTCOME:-unknown}"
fi
git add -A
git commit --quiet -m "$MESSAGE" || exit 0
for attempt in 1 2 3; do
  git push --quiet origin android-builds && exit 0
  git pull --quiet --rebase origin android-builds || true
done
exit 1
