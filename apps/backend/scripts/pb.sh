#!/bin/sh
# Laedt apps/backend/.env (falls vorhanden) und startet das PocketBase-Binary.
# Noetig, weil PocketBase ein Go-Binary ist und keine .env liest - die Hooks
# brauchen aber DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET (siehe pb_hooks/auth.pb.js).
set -a
[ -f .env ] && . ./.env
set +a
exec ./pocketbase "$@"
