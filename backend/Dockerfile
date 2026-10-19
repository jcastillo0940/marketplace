FROM php:8.4-fpm AS development

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git unzip libicu-dev libzip-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev libsqlite3-dev libwebp-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" bcmath exif gd intl pdo_mysql pdo_sqlite zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY docker/php.ini /usr/local/etc/php/conf.d/marketplace.ini
COPY docker/php-fpm.conf /usr/local/etc/php-fpm.d/www.conf

WORKDIR /var/www/html
EXPOSE 8000

FROM development AS production

ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr

COPY docker/production-entrypoint.sh /usr/local/bin/marketplace-production-entrypoint
RUN chmod 0555 /usr/local/bin/marketplace-production-entrypoint

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --no-progress --optimize-autoloader --no-scripts

COPY . .

RUN composer dump-autoload --no-dev --classmap-authoritative \
    && php artisan package:discover --ansi \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

USER www-data
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/marketplace-production-entrypoint"]
CMD ["php-fpm"]
