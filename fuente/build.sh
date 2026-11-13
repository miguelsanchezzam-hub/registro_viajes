#!/bin/bash
# Compila la app y deja index.html en la carpeta de arriba (la que publica GitHub Pages).
# Requisitos: bun (https://bun.sh). Uso:  cd fuente && bun install && bash build.sh
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/tailwindcss -i src/theme.css -o dist/theme.css --minify
sed 's#import "./theme.css";##' src/main.tsx > src/main.build.tsx
bun build src/main.build.tsx --outdir dist --target browser --minify --define 'process.env.NODE_ENV="production"'
rm -f src/main.build.tsx
python3 - <<'PY'
js = open('dist/main.build.js').read().replace('</script', '<\\/script')
css = open('dist/theme.css').read()
html = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f4f7ff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Viajes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png" type="image/png">
<title>Registro de viajes</title>
<style>{css}</style>
</head>
<body>
<div id="root"></div>
<script>{js}</script>
<script>if(navigator.serviceWorker){{window.addEventListener('load',function(){{navigator.serviceWorker.register('sw.js').catch(function(){{}})}})}}</script>
</body>
</html>
'''
open('../index.html', 'w').write(html)
print('index.html', len(html) // 1024, 'KB')
PY
