"""Separa los dos logos del PNG original por recorte exacto (sin redibujar ni reescalar).

Los píxeles RGBA se copian tal cual; solo se añade un margen transparente.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/source/MAYELLA MERCEDES MONOCROMATICO.png"
OUT = ROOT / "assets/logos"
SPLIT_X = 1850  # columna vacía entre ambos logos (alpha = 0 en 1714..1994)
PAD = 16


def crop(arr, x0, x1):
    sub = arr[:, x0:x1]
    a = sub[:, :, 3]
    cols = np.where(a.max(0) > 0)[0]
    rows = np.where(a.max(1) > 0)[0]
    c0, c1 = cols.min() + x0, cols.max() + x0 + 1
    r0, r1 = rows.min(), rows.max() + 1
    out = np.zeros((r1 - r0 + 2 * PAD, c1 - c0 + 2 * PAD, 4), np.uint8)
    out[PAD:-PAD, PAD:-PAD] = arr[r0:r1, c0:c1]
    return out, (c0, r0, c1, r1)


def main():
    arr = np.array(Image.open(SRC).convert("RGBA"))
    assert arr[:, 1714:1995, 3].max() == 0, "el hueco entre logos no está vacío"
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (x0, x1) in {"mayella": (0, SPLIT_X), "mercedes_140": (SPLIT_X, arr.shape[1])}.items():
        img, box = crop(arr, x0, x1)
        Image.fromarray(img).save(OUT / f"{name}.png")
        print(name, "bbox en original:", box, "tamaño:", img.shape[1], "x", img.shape[0])


if __name__ == "__main__":
    sys.exit(main())
