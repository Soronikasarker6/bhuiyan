#!/bin/sh
set -e

# Render assigns the port to listen on via $PORT at *runtime* — it isn't known
# at build time, so this can't just be a Dockerfile ENV. FrankenPHP's bundled
# Caddyfile listens on whatever SERVER_NAME says (":80" if unset).
export SERVER_NAME=":${PORT:-80}"

php artisan config:clear

# All migrations and seeders here are safe to (re)run on every boot — every
# seeder uses firstOrCreate/syncPermissions, so this never duplicates rows.
php artisan migrate --force
php artisan db:seed --force

exec "$@"
