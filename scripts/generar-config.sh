
set -eu

: "${WEBHOOK_URL:?Falta la variable de entorno WEBHOOK_URL en Vercel}"
: "${CITAS_CSV_URL:?Falta la variable de entorno CITAS_CSV_URL en Vercel}"

cat > config.js <<JS
const CONFIG = {
  WEBHOOK_URL: "${WEBHOOK_URL}",
  CITAS_CSV_URL: "${CITAS_CSV_URL}",
};
JS

echo "config.js generado."
