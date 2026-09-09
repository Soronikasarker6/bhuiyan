# Render only runs Docker services for PHP (there's no native PHP runtime like
# there is for Node/Python) — this builds one container for the whole API.
#
# FrankenPHP (Caddy + PHP in a single binary) is Laravel's own recommended
# setup for exactly this "one simple container" case — see
# https://laravel.com/docs/12.x/deployment#frankenphp — so there's no separate
# nginx/php-fpm/supervisor stack to hand-wire.
#
# Build context is this `backend/` directory (Render's dockerContext), not the
# repo root — see render.yaml.

# ---- vendor: composer install happens in its own stage, so the final image
# never needs composer or a full PHP dev toolchain at runtime ----
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --ignore-platform-reqs --prefer-dist
COPY . .
RUN composer dump-autoload --optimize --no-dev

# ---- runtime ----
FROM dunglas/frankenphp:php8.3

# pdo_mysql: the app's actual DB driver (works against TiDB/PlanetScale/etc.
# too — they all speak the MySQL wire protocol). The rest are what a stock
# Laravel app + spatie/laravel-permission expects to find.
RUN install-php-extensions pdo_mysql intl zip bcmath gd opcache

WORKDIR /app
COPY --from=vendor /app /app

# FrankenPHP's bundled Caddyfile serves /app/public by default — the same
# document root Laravel itself expects — so nothing else to configure there.
RUN chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

# Declaring an ENTRYPOINT resets the base image's CMD to null, so FrankenPHP's
# own default server command has to be restated here — without it entrypoint.sh
# reaches `exec "$@"` with no arguments, the container exits as soon as the
# migrations finish, and Render reports "Application exited early". Handing off
# to the base image's docker-entrypoint.sh (rather than calling frankenphp
# directly) keeps its /data and /config permission setup.
CMD ["docker-entrypoint.sh", "--config", "/etc/frankenphp/Caddyfile", "--adapter", "caddyfile"]
