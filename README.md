# ineoclips Studio — GitHub Pages

Subí estos archivos a la raíz del repositorio:

- `index.html`
- `.nojekyll`
- `README.md`

La exportación MP4 usa FFmpeg WebAssembly. El cargador adapta el Worker de `@ffmpeg/ffmpeg@0.12.10` para evitar el error de Chrome al crear directamente `814.ffmpeg.js` desde otro origen.

**Abrir desde GitHub Pages (`https://...github.io/...`)**, no desde `file://`.

El editor conserva el estado del proyecto y no debe destruir la edición si la exportación falla.


Exportación: MP4 vertical 720×1280 (9:16), con suavizado de imagen y codificación H.264. No requiere `.nojekyll`.


Exportación: WebCodecs frame-accurate H.264, 720x1280, con empaquetado MP4 mediante FFmpeg.wasm. Requiere Chrome/Edge actualizado.
