# GOWA official image, adapted for read-only hosts (e.g. Deplexo free tier):
# - Run from /tmp (writable tmpfs): GOWA unconditionally creates sqlite chat
#   storage at the relative path "storages/chatstorage.db" (no env can move or
#   disable it), so the working directory must be writable. /tmp is ephemeral,
#   which is fine: the WhatsApp session itself lives in Postgres (DB_URI), and
#   chat storage is only a message archive (lost on restart, harmless).
# - Bypass the stock entrypoint (su-exec is blocked here), run as root.
# Env (dashboard): APP_PORT=3000, DB_URI + DB_KEYS_URI (Neon Postgres),
#   APP_UI_ENABLED=false, MCP_ENABLED=false,
#   APP_BASIC_AUTH="user:pass", APP_OS="TodoWA"
FROM aldinokemal2104/go-whatsapp-web-multidevice:latest
WORKDIR /tmp
ENTRYPOINT ["/app/whatsapp"]
CMD ["rest"]
