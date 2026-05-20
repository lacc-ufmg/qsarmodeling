#!/usr/bin/env bash
# =============================================================================
# generate-icons.sh
# Gera todos os ícones necessários para um projeto Tauri a partir de um PNG.
#
# Uso:
#   chmod +x generate-icons.sh
#   ./generate-icons.sh logo.png
#
# Dependências: imagemagick (convert, magick)
# =============================================================================

set -euo pipefail

# --- Verificações iniciais ----------------------------------------------------

if ! command -v convert &>/dev/null; then
  echo "❌  ImageMagick não encontrado. Instale com:"
  echo "    Ubuntu/Debian : sudo apt install imagemagick"
  echo "    Fedora/RHEL   : sudo dnf install imagemagick"
  echo "    macOS (brew)  : brew install imagemagick"
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <caminho-para-logo.png> [pasta-de-saída]"
  exit 1
fi

SRC="$1"
OUT="${2:-icons}"   # pasta de saída; padrão: ./icons

if [[ ! -f "$SRC" ]]; then
  echo "❌  Arquivo não encontrado: $SRC"
  exit 1
fi

mkdir -p "$OUT"

# Helper: resize simples
resize() {
  local size="$1" dest="$2"
  convert "$SRC" -resize "${size}x${size}" -gravity center \
    -background none -extent "${size}x${size}" \
    "$OUT/$dest"
  echo "  ✓  $dest"
}

# Helper: resize com fundo branco (útil para formatos sem transparência)
resize_white() {
  local size="$1" dest="$2"
  convert "$SRC" -resize "${size}x${size}" -gravity center \
    -background white -extent "${size}x${size}" -flatten \
    "$OUT/$dest"
  echo "  ✓  $dest"
}

echo ""
echo "📂  Origem : $SRC"
echo "📂  Saída  : $OUT/"
echo ""

# =============================================================================
# 1. PNGs padrão Tauri
# =============================================================================
echo "▶  PNGs padrão Tauri"
resize  16   "16x16.png"
resize  32   "32x32.png"
resize 128   "128x128.png"
resize 192   "192x192.png"
resize 256   "128x128@2x.png"
resize 256   "256x256.png"
resize 512   "512x512.png"
resize 1024  "1024x1024.png"
cp "$OUT/512x512.png" "$OUT/icon.png"
echo "  ✓  icon.png  (cópia de 512x512)"

# =============================================================================
# 2. Square*Logo.png  — Windows / Microsoft Store
# =============================================================================
echo ""
echo "▶  Square*Logo.png  (Windows Store)"
resize  30   "Square30x30Logo.png"
resize  44   "Square44x44Logo.png"
resize  71   "Square71x71Logo.png"
resize  89   "Square89x89Logo.png"
resize 107   "Square107x107Logo.png"
resize 142   "Square142x142Logo.png"
resize 150   "Square150x150Logo.png"
resize 284   "Square284x284Logo.png"
resize 310   "Square310x310Logo.png"
# StoreLogo: 50x50, fundo branco (requisito da Store)
resize_white  50  "StoreLogo.png"

# =============================================================================
# 3. icon.ico  — Windows (multi-resolução)
# =============================================================================
echo ""
echo "▶  icon.ico  (Windows multi-resolução)"
convert "$SRC" \
  \( -clone 0 -resize 16x16   \) \
  \( -clone 0 -resize 24x24   \) \
  \( -clone 0 -resize 32x32   \) \
  \( -clone 0 -resize 48x48   \) \
  \( -clone 0 -resize 64x64   \) \
  \( -clone 0 -resize 128x128 \) \
  \( -clone 0 -resize 256x256 \) \
  -delete 0 \
  -background none -gravity center \
  "$OUT/icon.ico"
echo "  ✓  icon.ico  (16, 24, 32, 48, 64, 128, 256 px)"

# =============================================================================
# 4. icon.icns  — macOS
#    O formato ICNS exige tamanhos específicos nomeados corretamente antes
#    de serem montados com o comando `iconutil` (macOS) OU via ImageMagick
#    diretamente quando ele foi compilado com suporte a ICNS.
# =============================================================================
echo ""
echo "▶  icon.icns  (macOS)"

# Tenta geração direta (funciona quando IM tem suporte nativo a ICNS)
if convert "$SRC" \
    \( -clone 0 -resize 16x16     \) \
    \( -clone 0 -resize 32x32     \) \
    \( -clone 0 -resize 64x64     \) \
    \( -clone 0 -resize 128x128   \) \
    \( -clone 0 -resize 256x256   \) \
    \( -clone 0 -resize 512x512   \) \
    \( -clone 0 -resize 1024x1024 \) \
    -delete 0 \
    "$OUT/icon.icns" 2>/dev/null; then
  echo "  ✓  icon.icns  (via ImageMagick)"
else
  # Fallback: monta iconset e usa iconutil (somente macOS)
  echo "  ⚠  ImageMagick sem suporte ICNS — tentando iconutil (macOS)..."
  ICONSET="$OUT/icon.iconset"
  mkdir -p "$ICONSET"
  for s in 16 32 64 128 256 512; do
    convert "$SRC" -resize "${s}x${s}"         "$ICONSET/icon_${s}x${s}.png"
    convert "$SRC" -resize "$((s*2))x$((s*2))" "$ICONSET/icon_${s}x${s}@2x.png"
  done
  if command -v iconutil &>/dev/null; then
    iconutil -c icns -o "$OUT/icon.icns" "$ICONSET"
    rm -rf "$ICONSET"
    echo "  ✓  icon.icns  (via iconutil)"
  else
    echo "  ℹ  iconutil não disponível (não é macOS)."
    echo "     O iconset foi salvo em: $ICONSET"
    echo "     Copie essa pasta para um Mac e execute:"
    echo "       iconutil -c icns -o icon.icns icon.iconset"
  fi
fi

# =============================================================================
# Resumo
# =============================================================================
echo ""
echo "✅  Concluído! Arquivos gerados em: $OUT/"
echo ""
ls -1 "$OUT/"
