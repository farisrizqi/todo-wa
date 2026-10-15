# GOWA official image, adapted for restricted hosts (e.g. Deplexo free tier):
# - Pre-create the dirs the stock entrypoint would mkdir (read-only FS rejects creation)
# - Bypass the stock entrypoint (it calls su-exec to drop privileges, which is
#   blocked here) and run the binary directly as root: /app/whatsapp rest
# - All state lives in Postgres via DB_URI/DB_KEYS_URI (Neon), chat file storage off,
#   so the container never needs local writes (text-only sending needs none).
# Env (dashboard): APP_PORT=3000, DB_URI, DB_KEYS_URI (same Postgres),
#   WHATSAPP_CHAT_STORAGE=false, APP_BASIC_AUTH="user:pass", APP_OS="TodoWA"
FROM aldinokemal2104/go-whatsapp-web-multidevice:latest
RUN mkdir -p /app/storages /app/storages/temp /app/statics /app/statics/qrcode /app/statics/senditems /app/statics/temp /app/statics/media /app/temp
ENTRYPOINT ["/app/whatsapp"]
CMD ["rest"]
