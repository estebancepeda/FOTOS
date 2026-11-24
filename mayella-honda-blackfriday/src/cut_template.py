"""Recortes PROVISIONALES desde la plantilla (baja resolución, fondo blanco).

Se usan solo para maquetar mientras llegan los PNG originales con transparencia.
Quita el fondo blanco conectado al borde y los huecos blancos encerrados grandes
(entre aro, M y palabra), con borde suavizado y color des-premultiplicado sobre blanco.
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/template/plantilla_black_friday.webp"
OUT = ROOT / "assets/logos"

BOXES = {                                   # (x0, y0, x1, y1) en la plantilla 1121×1403
    "provisional_mayella": (95, 70, 490, 415),
    "provisional_blackfriday": (545, 90, 1050, 400),
    "provisional_redes": (205, 1300, 440, 1390),
}


def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    sizes, touches = [0], [False]
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or lab[y0, x0]:
                continue
            n += 1
            q = deque([(y0, x0)])
            lab[y0, x0] = n
            size, touch = 0, False
            while q:
                y, x = q.popleft()
                size += 1
                touch |= y in (0, h - 1) or x in (0, w - 1)
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        q.append((yy, xx))
            sizes.append(size)
            touches.append(touch)
    return lab, np.array(sizes), np.array(touches)


def cut(name, box, hole_min=400):
    im = np.asarray(Image.open(SRC).convert("RGB").crop(box)).astype(np.float32)
    mn = im.min(-1)
    white = (mn > 236) & (im.max(-1) - mn < 18)
    lab, sizes, touches = components(white)
    bg = touches | (sizes >= hole_min)
    bg[0] = False
    remove = bg[lab] & white
    # borde suave: cerca del fondo quitado, alfa según cuánto se aleja del blanco
    near = remove.copy()
    for _ in range(2):
        near = near | np.roll(near, 1, 0) | np.roll(near, -1, 0) | np.roll(near, 1, 1) | np.roll(near, -1, 1)
    a = np.ones(mn.shape, np.float32)
    a[remove] = 0
    edge = near & ~remove
    a[edge] = np.clip((255 - mn[edge]) / 60.0, 0, 1)
    rgb = np.where(a[..., None] > 0.02, (im - (1 - a[..., None]) * 255) / np.maximum(a[..., None], 0.02), 0)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    ys, xs = np.nonzero(out[..., 3] > 8)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(out, "RGBA").save(OUT / f"{name}.png")
    print(name, out.shape[1], "x", out.shape[0])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, box in BOXES.items():
        cut(name, box, hole_min=10**9 if name == "provisional_blackfriday" else 400)


if __name__ == "__main__":
    sys.exit(main())
