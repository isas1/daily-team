#!/bin/sh
# Records today's team and asset with your Claude subscription, then commits and pushes.
# Usage: sh daily.sh [run.mjs options, for example --artifacts 2 or --force]
set -eu
cd "$(dirname "$0")"

git pull --ff-only --quiet
status=0
request_file=$(mktemp "${TMPDIR:-/tmp}/daily-team-requests.XXXXXX")
source_file=$(mktemp "${TMPDIR:-/tmp}/daily-team-sources.XXXXXX")
trap 'rm -f "$request_file" "$source_file"' EXIT
GITHUB_TOKEN=$(gh auth token) node github.mjs requests > "$request_file" || echo '{"requests":[]}' > "$request_file"
if [ "${PROVIDER:-claude}" = claude ]; then
  GITHUB_TOKEN=$(gh auth token) node github.mjs component-sources > "$source_file" || echo '{"sources":[]}' > "$source_file"
else
  echo '{"sources":[]}' > "$source_file"
fi
COMPONENT_SOURCES_FILE=$source_file COMPONENT_REQUESTS_FILE=$request_file PROVIDER=${PROVIDER:-claude} node run.mjs "$@" || status=$?
if [ "$status" -eq 0 ]; then
  node comparison-pipeline.mjs "$@" || status=$?
fi
# Cover runs separately: same saved cast and plan, no artifact regeneration.
PROVIDER=${PROVIDER:-claude} node cover.mjs "$@" || status=$?
sh shot.sh days || true
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=$repo node github.mjs suggestions > "${TMPDIR:-/tmp}/daily-team-suggestions.json" \
  || echo '[]' > "${TMPDIR:-/tmp}/daily-team-suggestions.json"
pages=$(gh api "repos/$repo/pages" -q .html_url 2>/dev/null || true)
PAGES_URL=$pages GITHUB_REPOSITORY=$repo node publish.mjs --suggestions "${TMPDIR:-/tmp}/daily-team-suggestions.json"
git add README.md ARCHIVE.md days
if [ -f .cache/feed-backlog.json ]; then git add .cache/feed-backlog.json; fi
if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git commit --quiet -m "Daily team $(date +%Y-%m-%d)"
  git push --quiet
  echo "Pushed $(git rev-parse --short HEAD)."
fi
exit "$status"
