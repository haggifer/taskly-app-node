#!/usr/bin/env bash
# Runs pull request code (tests, test runners) with no network, a read-only filesystem except the directories given
# before "--", a private /tmp, and none of the runner's command files or tokens, so it can't reach the job's later
# steps through GITHUB_ENV, GITHUB_OUTPUT and the like. A .git folder inside a writable directory stays read-only, so
# the code can't plant hooks or config that a later, unsandboxed git command would run.
# Usage: sandboxed.sh <writable dir>... -- <command> [args...]
set -euo pipefail

binds=()
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
  binds+=(--bind "$1" "$1")
  if [ -e "$1/.git" ]; then binds+=(--ro-bind "$1/.git" "$1/.git"); fi
  shift
done
if [ "$#" -eq 0 ]; then
  echo "usage: sandboxed.sh <writable dir>... -- <command> [args...]" >&2
  exit 2
fi
shift

exec bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp "${binds[@]}" \
  --unshare-all --die-with-parent --new-session \
  env -u GITHUB_ENV -u GITHUB_OUTPUT -u GITHUB_PATH -u GITHUB_STATE -u GITHUB_STEP_SUMMARY \
  -u ACTIONS_RUNTIME_TOKEN -u ACTIONS_ID_TOKEN_REQUEST_TOKEN -u ACTIONS_ID_TOKEN_REQUEST_URL \
  -u ACTIONS_RESULTS_URL -u ACTIONS_CACHE_URL -u CLAUDE_CODE_OAUTH_TOKEN -u GITHUB_TOKEN \
  "$@"
