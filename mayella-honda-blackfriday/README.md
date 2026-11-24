# Overlay · Reel Honda Black Friday · Auto Mayella

Motion graphics para montar sobre el reel «Mayella Onda CRV Black»: **2160 × 3840, 24 fps, 28,375 s
(681 cuadros)**, desde el primer fotograma del video.

## Estado

- Motor y guion de animación listos; tiempos tomados de la tabla del cliente.
- **Pendiente de archivos del cliente**: el video (para afinar cada entrada al fotograma con la voz,
  revisar la composición sobre el metraje y hacer la vista previa), el logo Mayella corregido y el arte
  Black Friday en PNG con transparencia, y las fuentes Gotham Bold / Regular.
- Provisionales mientras tanto: logos recortados de la plantilla (`src/cut_template.py`) y Montserrat
  (OFL) en lugar de Gotham.

## Entregables previstos

| Archivo | Contenido |
|---|---|
| `renders/overlay_honda_blackfriday_2160x3840_24fps.mov` | ProRes 4444 con canal alfa |
| `renders/sfx_honda_blackfriday.wav` | Efectos sincronizados, estéreo |
| `renders/preview_honda_blackfriday.mp4` | Video + voz + música + efectos |

## Proyecto

```
src/story.js     guion: tiempos de voz (CUE), textos, posiciones y entradas
src/engine.js    plata cepillada, viaje en profundidad, barra de vidrio, logos, render con alfa
src/render.mjs   Chromium sin cabeza → ffmpeg (ProRes 4444, fotogramas de control)
src/contact.py   hojas de contacto con márgenes seguros
```

- Composición: firma arriba (ancho 28 %, centro al 19 %); títulos al 59 %; libres el 15 % superior,
  el 25 % inferior y el 12 % de cada lateral.
- Cambiar fuentes por Gotham: `assets/fonts/fonts.json` con `{"HeadBold": {"url": "../assets/fonts/Gotham-Bold.otf"}, …}`.
- Cambiar logos: `assets/logos/logos.json` con `{"mayella": "archivo_sin_extension", "bf": "…"}`.
- Afinar tiempos: `transcript/cues.json` sobrescribe los valores de `CUE`.
