# GOWA official image, adapted for read-only hosts (e.g. Deplexo free tier):
# - The binary resolves ALL relative paths (storages/, statics/, UI cache)
#   against its working directory, so run from writable /tmp and pre-seed the
#   official gowa-ui dashboard there (air-gap mode + auto-update off = zero
#   runtime writes for the UI).
# - Bypass the stock entrypoint (su-exec is blocked here), run as root.
# - The WA session itself lives in Postgres (DB_URI), chat sqlite in /tmp is
#   ephemeral (message archive only, harmless to lose on restart).
# - Text-only sending needs no other local writes.
# Env (dashboard): APP_PORT=3000, DB_URI + DB_KEYS_URI (Neon Postgres),
#   APP_UI_ENABLED=true, APP_UI_AUTO_UPDATE=false,
#   APP_BASIC_AUTH="user:pass", APP_OS="TodoWA"
FROM aldinokemal2104/go-whatsapp-web-multidevice:latest
RUN mkdir -p /tmp/storages/ui
ADD https://github.com/aldinokemal/gowa-ui/releases/download/v1.7.0/gowa-ui.html /tmp/storages/ui/index.html
WORKDIR /tmp
ENTRYPOINT ["/app/whatsapp"]
CMD ["rest"]
