#!/bin/sh
set -e

echo "Database URL: ${DATABASE_URL:-(not set)}"

# Push schema to the database — fail fast if this does not succeed
echo "Running prisma db push ..."
if npx prisma db push --skip-generate; then
  echo "Database schema push completed successfully"
else
  echo "ERROR: prisma db push failed — aborting startup" >&2
  exit 1
fi

# Start the application
exec node server.js
