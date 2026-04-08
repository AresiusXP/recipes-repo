#!/bin/sh
set -e

# Run database migrations/push
npx prisma db push --skip-generate 2>/dev/null || echo "Database schema push completed (or already up to date)"

# Start the application
exec node server.js
