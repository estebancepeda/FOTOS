# Reel · Lanzamiento Mercedes-Benz 2027 en Auto Mayella

Motion graphics vertical **1080 × 1920, 30 fps, 71 s**, fondo negro y gráficos blancos, sincronizado con
`assets/audio/AUDIO_MERCEDES_MAYELLA.mp3` (Marcel Hernández, Mercedes-Benz Autosama). Pensado para montarse
después dentro de otra edición.

## Entregables

| Archivo | Contenido |
|---|---|
| `renders/reel_mercedes_2027_mayella_1080x1920.mp4` | Video final H.264 (CRF 12) + audio original AAC 320 kbps |
| `preview/hoja_de_contacto_reel.png` | Cuadros clave del video final |
| `transcript/guion_sincronizado.md` | Frases con su tiempo en el audio |
| `renders/reel_mercedes_2027_sfx.wav` | **Solo efectos de sonido** (sin voz ni música), 48 kHz / 24 bit, 71 s, empieza en el cuadro 0 del video |
| `transcript/sfx_cues.md` | Lista de efectos con su tiempo |

## Composición

- Centro de composición bajado un 10 %: **y = 1152** (constante `CY` en `src/engine.js`).
- Tipografía Inter / Inter Display (instalada en el sistema); íconos de línea **Lucide** (licencia ISC,
  `assets/icons/LICENSE-lucide.txt`).
- Misma línea visual del bumper: transiciones con la **lente de cristal** (refracción real del contenido,
  aberración cromática solo por sectores, reflejos del contorno) portada a WebGL. El logo de Mayella aparece
  dentro de la lente cuando se menciona «Auto Mayella» (≈5.4 s y ≈67.5 s).
- Logos tomados del PNG original (recorte exacto): `assets/logos/`.

## Proyecto editable

```
src/story.js        guion visual: escenas, textos, íconos y lentes (tiempos ligados a las palabras)
src/engine.js       motor: primitivas 2D animadas + shader de lente (WebGL2)
src/index.html      página que carga recursos y expone renderFrame(t)
src/render.mjs      render cuadro a cuadro en Chromium sin cabeza → ffmpeg
src/build.sh        render completo en bloques paralelos + audio → MP4
src/align_dtw.py    alineación del guion con el audio (espeak-ng + MFCC + DTW)
src/contact.py      hojas de contacto
src/sfx.py          efectos de sonido sintetizados a partir de los tiempos reales de la animación
transcript/words.json   tiempo de cada palabra (lo usa story.js)
```

- Cambiar un texto o un ícono: editar `src/story.js` y volver a renderizar.
- Vista previa de cuadros sueltos: `cd src && node render.mjs stills story 12.5 30.2`
- Render completo: `cd src && bash build.sh 4 3` (4 procesos, 3 submuestras de motion blur; ~20–30 min).
- Rehacer los efectos de sonido: `cd src && node render.mjs events story && python3 sfx.py`
  (si cambias `story.js`, los efectos se resincronizan solos).
- Rehacer la alineación: `pip install espeakng-loader numpy` y `python3 src/align_dtw.py`.

Requisitos: Node 22 + Playwright con Chromium (ya instalados en el entorno), ffmpeg, Python 3 + numpy.
