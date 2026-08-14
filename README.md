# ineoclips Studio

Editor de video vertical 9:16 pensado para GitHub Pages.

## Uso

1. Subir el contenido del repositorio a GitHub.
2. Activar GitHub Pages desde la rama `main`, carpeta `/root`.
3. Abrir la URL HTTPS de GitHub Pages.
4. Cargar un video y editar.

> La exportación FFmpeg WebAssembly debe ejecutarse desde HTTPS/GitHub Pages, no desde `file://`.

El editor guarda periódicamente el estado del proyecto en IndexedDB del navegador para evitar perder el trabajo si una exportación falla.
