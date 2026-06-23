#!/bin/bash
set -e

# Only run npm install if package-lock.json changed in this merge
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -q "package-lock.json\|package.json"; then
  echo "package files changed — running npm install"
  npm install --prefer-offline
else
  echo "no package changes — skipping npm install"
fi

# Only run db:push if schema files changed in this merge
if git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -q "schema.ts\|drizzle/"; then
  echo "schema changed — running db:push"
  npm run db:push -- --force
else
  echo "no schema changes — skipping db:push"
fi
