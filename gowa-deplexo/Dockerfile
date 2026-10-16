# GOWA official image, adapted for read-only hosts (e.g. Deplexo free tier):
# - Pre-create the dirs the stock entrypoint would mkdir (read-only FS rejects creation)
# - Pre-seed the official gowa-ui dashboard at build time + disable auto-update,
#   so the UI works with zero runtime writes (air-gap mode per upstream docs)
# - Bypass the stock entrypoint (su-exec is blocked here), run as root from /tmp
#   (chat sqlite is mandatory and relative-pathed; /tmp is writable, ephemeral is
#   fine because the WA session itself lives in Postgres via DB_URI)
# - Text-only sending needs no other local writes.
# Env (dashboard): APP_PORT=3000, DB_URI + DB_KEYS_URI (Neon Postgres),
#   APP_UI_ENABLED=true, APP_UI_AUTO_UPDATE=false,
#   APP_BASIC_AUTH="user:pass", APP_OS="TodoWA"
FROM aldinokemal2104/go-whatsapp-web-multidevice:latest
RUN mkdir -p /app/storages /app/storages/temp /app/statics /app/statics/qrcode /app/statics/senditems /app/statics/temp /app/statics/media /app/temp
ADD https://github.com/aldinokemal/gowa-ui/releases/download/v1.7.0/gowa-ui.html /app/storages/ui/index.html
WORKDIR /tmp
ENTRYPOINT ["/app/whatsapp"]
CMD ["rest"]
