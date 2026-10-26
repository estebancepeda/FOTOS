"""Recorta solo la estrella de Mercedes del logo «140 Years» (píxeles originales, sin redibujar)."""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PAD = 16

src = np.array(Image.open(ROOT / "assets/logos/mercedes_140.png"))
a = src[:, :, 3]
rows = np.where(a.max(1) > 0)[0]
gap = rows[np.where(np.diff(rows) > 1)[0][0]]          # última fila de la estrella antes del texto
star = src[: gap + 1]
cols = np.where(star[:, :, 3].max(0) > 0)[0]
r = np.where(star[:, :, 3].max(1) > 0)[0]
out = np.zeros((r.max() - r.min() + 1 + 2 * PAD, cols.max() - cols.min() + 1 + 2 * PAD, 4), np.uint8)
out[PAD:-PAD, PAD:-PAD] = star[r.min(): r.max() + 1, cols.min(): cols.max() + 1]
Image.fromarray(out).save(ROOT / "assets/logos/mercedes_star.png")
print("estrella:", out.shape[1], "x", out.shape[0])
