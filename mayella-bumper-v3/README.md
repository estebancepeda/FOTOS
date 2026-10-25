# Bumper v3 · Mercedes-Benz 140 Years of Innovation → Auto Mayella

Horizontal 1920 × 1080 y vertical 1080 × 1920, 30 fps, 4.0 s (120 cuadros), con sonido.
Referencia aprobada: `assets/source/storyboard_aprobado.png`.

## Entregables

| Archivo | Contenido |
|---|---|
| `renders/bumper_mercedes_mayella_1920x1080.mp4` | Video horizontal H.264 + AAC |
| `renders/bumper_mercedes_mayella_1080x1920.mp4` | Video vertical H.264 + AAC |
| `contact/hoja_de_contacto.png` · `contact/hoja_de_contacto_vertical.png` | Los 12 tiempos del storyboard, cuadro completo |
| `contact/comparacion_storyboard.png` · `contact/comparacion_storyboard_vertical.png` | Storyboard arriba, render abajo con el mismo encuadre (recorte central 1350 × 1080) |
| `renders/bumper_audio.wav` | Mezcla de audio 48 kHz estéreo |

## Proyecto editable

```
assets/source/   PNG original monocromático + storyboard
assets/logos/    logos separados del PNG original (recorte exacto, sin redibujar)
src/extract_logos.py   separa ambos logos del PNG original
src/timeline.py        TODAS las curvas de animación (tiempos y valores editables)
src/render.py          shader óptico (numpy) → cuadros PNG
src/contact_sheet.py   hoja de contacto + comparación
src/audio.py           diseño sonoro sintetizado
src/build.sh           pipeline completo → MP4
```

Reconstruir todo: `bash src/build.sh` (horizontal) o `bash src/build.sh v` (vertical)
(Python 3 + numpy + Pillow + ffmpeg; ~10 min en 4 núcleos).
Solo la hoja de contacto: `cd src && python3 render.py stills 5 9 18 30 38 44 46 53 60 68 83 100 && python3 contact_sheet.py`
(anteponer `BUMPER_FORMAT=v` a cada comando para la vertical).

### Vertical 1080 × 1920

Misma secuencia, curvas, efecto y audio que la horizontal. Diferencias (en `timeline.py`):
- Lente y logos al 92 % (`V_SCALE`) para dejar aire lateral en un cuadro de 1080 de ancho.
- En la fase final la lente se mantiene redonda hasta 2.267 s y luego se alarga
  (`aspect` hasta 2.3) para que el contorno superior/inferior salga del cuadro y la
  refracción de 2.767 s quede solo en los lados, como en el storyboard.

## Cómo funciona el efecto

Por cada píxel se calcula **dónde mirar** dentro del logo original, como haría una lupa de agua:

1. **Forma de la lente**: superelipse (círculo → cuadrado redondeado → círculo) con
   irregularidad orgánica que deriva en el tiempo (`organic()` en `render.py`).
2. **Campo de desplazamiento**: el borde de cristal y una onda interior son
   protuberancias del campo de alturas; su gradiente desplaza la coordenada de
   muestreo y produce aumento local real (1/(1−k)), así que los trazos del logo,
   las letras y el «140» se agrandan, curvan y desplazan por donde pasa la onda.
3. **Domo**: aumento central (`mag`) que se relaja hacia el borde. Con valores < 1
   concentra el logo en la gota central; ahí se esconde el cambio de marca.
4. **Aberración cromática**: R y B se muestrean con desplazamiento ligeramente
   distinto, solo en sectores angulares y proporcional a la refracción.
5. **Reflejos del contorno**: bandas por sectores (frías y algunas cálidas) con
   desfase RGB; se suman en modo *screen* con un brillo muy leve solo sobre ellos.
6. **Motion blur**: 6 submuestras por cuadro (obturador 180°). Cuando nada se mueve,
   las submuestras son idénticas y el logo queda exactamente nítido.

Fuera de la lente el desplazamiento es cero y, desde 3.30 s, todas las fuerzas
valen 0: el cuadro final es el logo Mayella original escalado con Lanczos, sin residuos.
