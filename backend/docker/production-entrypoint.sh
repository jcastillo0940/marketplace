#!/bin/sh
set -eu

fail() {
    printf '%s\n' "Configuración de producción incompleta: $1" >&2
    exit 78
}

[ "${APP_ENV:-}" = 'production' ] || fail 'APP_ENV debe ser production.'
[ "${APP_DEBUG:-true}" = 'false' ] || fail 'APP_DEBUG debe ser false.'
[ "${CONTACT_VERIFICATION_DRIVER:-}" = 'twilio' ] || fail 'El proveedor OTP debe ser Twilio.'
[ -n "${TWILIO_ACCOUNT_SID:-}" ] || fail 'Falta la cuenta de Twilio.'
[ -n "${TWILIO_AUTH_TOKEN:-}" ] || fail 'Falta la credencial de Twilio.'
[ -n "${TWILIO_FROM_NUMBER:-}" ] || fail 'Falta el remitente de Twilio.'
case "${APP_URL:-}" in https://*) ;; *) fail 'APP_URL debe usar HTTPS.' ;; esac
case "${FRONTEND_URL:-}" in https://*) ;; *) fail 'FRONTEND_URL debe usar HTTPS.' ;; esac

php -r '
$key = getenv("APP_KEY") ?: "";
if (str_starts_with($key, "base64:")) {
    $key = base64_decode(substr($key, 7), true) ?: "";
}
if (strlen($key) !== 32) {
    fwrite(STDERR, "Configuración de producción incompleta: APP_KEY debe representar 32 bytes.\n");
    exit(78);
}
'

case "${MEDIA_FILESYSTEM_DISK:-}" in
    local) ;;
    s3)
        [ -n "${AWS_ACCESS_KEY_ID:-}" ] || fail 'Falta AWS_ACCESS_KEY_ID para S3.'
        [ -n "${AWS_SECRET_ACCESS_KEY:-}" ] || fail 'Falta AWS_SECRET_ACCESS_KEY para S3.'
        [ -n "${AWS_DEFAULT_REGION:-}" ] || fail 'Falta AWS_DEFAULT_REGION para S3.'
        [ -n "${AWS_BUCKET:-}" ] || fail 'Falta AWS_BUCKET para S3.'
        ;;
    *) fail 'MEDIA_FILESYSTEM_DISK debe ser local o s3.' ;;
esac

exec "$@"
