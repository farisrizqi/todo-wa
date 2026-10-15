# GOWA official image, adapted for read-only hosts (e.g. Deplexo free tier):
# - Pre-create the dirs GOWA mkdirs at startup (read-only FS would reject creation)
# - All state lives in Postgres via DB_URI/DB_KEYS_URI (Neon), chat file storage off,
#   so the container never needs local writes (text-only sending needs none).
# Env (dashboard): APP_PORT=3000, DB_URI, DB_KEYS_URI (same Postgres),
#   WHATSAPP_CHAT_STORAGE=false, APP_BASIC_AUTH="user:pass", APP_OS="TodoWA"
FROM aldinokemal2104/go-whatsapp-web-multidevice:latest
RUN mkdir -p /app/storages /app/statics
