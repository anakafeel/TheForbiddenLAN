#!/bin/sh
set -e

echo "Syncing database schema..."
npx prisma db push

echo "Starting server..."
exec npx tsx src/index.ts
