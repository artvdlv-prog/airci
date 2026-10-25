#!/bin/sh
# Clean local database and files of wrangler dev before `npm test` (stop `wrangler dev` first)
cd "$(dirname "$0")/.." && rm -rf .wrangler/state && npx wrangler d1 migrations apply airchitect --local
