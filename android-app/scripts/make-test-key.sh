#!/usr/bin/env bash
# Makes a NEW signing key for the TEST builds (application id app.monivra.finance.dev) and writes
# everything needed to keep it, into a folder OUTSIDE the repository. Nothing is printed to the
# screen: the passwords are in the files. Run it on a computer you control, then:
#   1. keep the whole folder in an offline, owner-controlled place (a second copy elsewhere);
#   2. put the four values of github-secrets.txt into the repository secrets;
#   3. delete the folder from any shared or temporary place.
# Usage: bash android-app/scripts/make-test-key.sh /path/to/folder-outside-the-repo
set -euo pipefail
DIR="${1:?give a folder outside the repository}"
case "$(cd "$(dirname "$DIR")" 2>/dev/null && pwd)/$(basename "$DIR")" in
  "$(git rev-parse --show-toplevel 2>/dev/null || echo /nonexistent)"/*) echo "The folder must be outside the repository." >&2; exit 1;;
esac
mkdir -p "$DIR"; chmod 700 "$DIR"
[ -e "$DIR/monivra-test.jks" ] && { echo "A key already exists there; not overwriting." >&2; exit 1; }
PASS="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
keytool -genkeypair -keystore "$DIR/monivra-test.jks" -alias monivra-test-key -keyalg RSA -keysize 3072 \
  -validity 9125 -storepass "$PASS" -keypass "$PASS" -dname "CN=Monivra test builds" >/dev/null 2>&1
umask 077
{
  echo "MONIVRA_KEYSTORE_B64 (one line):"; base64 -w0 "$DIR/monivra-test.jks"; echo
  echo "MONIVRA_KEYSTORE_PASSWORD: $PASS"
  echo "MONIVRA_KEY_ALIAS: monivra-test-key"
  echo "MONIVRA_KEY_PASSWORD: $PASS"
} > "$DIR/github-secrets.txt"
sha=$(keytool -list -v -keystore "$DIR/monivra-test.jks" -storepass "$PASS" 2>/dev/null | grep -m1 "SHA256:" | sed 's/^ *//')
echo "$sha" > "$DIR/fingerprint.txt"
chmod 600 "$DIR"/*
echo "Done. Files are in $DIR (key, github-secrets.txt, fingerprint.txt). Fingerprint: $sha"
