"""Validación automática del render completo.

- Saltos: diferencia media entre cuadros consecutivos (busca picos aislados).
- Cortes: contenido tocando el borde del cuadro.
- Residuos: los cuadros finales deben ser idénticos al logo Mayella limpio.
"""
from pathlib import Path

import numpy as np
from PIL import Image

from render import CX, CY, H, W, logo_canvas, MARGIN
from timeline import SUFFIX, params

ROOT = Path(__file__).resolve().parent.parent
FR = ROOT / f"renders/frames{SUFFIX}"


def load(i):
    return np.asarray(Image.open(FR / f"f{i:03d}.png"), np.float32) / 255.0


def main():
    files = sorted(FR.glob("f*.png"))
    n = len(files)
    assert n == 120, f"se esperaban 120 cuadros, hay {n}"
    diffs = []
    prev = load(0)
    border = []
    logo_edge = []
    for i in range(n):
        cur = load(i)
        if i:
            diffs.append(np.abs(cur - prev).mean())
        edge = np.concatenate([cur[:4].ravel(), cur[-4:].ravel(), cur[:, :4].ravel(), cur[:, -4:].ravel()])
        border.append(edge.max())
        strips = [cur[:4], cur[-4:], cur[:, :4], cur[:, -4:]]
        # blanco neutro (logo) tocando el borde, distinto del reflejo azulado del cristal
        logo_edge.append(max(((s.min(-1) > 0.5) & (s.max(-1) - s.min(-1) < 0.08)).sum() for s in strips))
        prev = cur
    diffs = np.array(diffs)
    med = np.median(diffs[diffs > 1e-5]) if (diffs > 1e-5).any() else 0
    print("diferencia media entre cuadros (x1000):")
    print(" ".join(f"{d * 1000:.1f}" for d in diffs))
    spikes = [i + 1 for i in range(1, len(diffs) - 1)
              if diffs[i] > 3 * max(diffs[i - 1], diffs[i + 1], 1e-4) and diffs[i] > 4 * med]
    print("picos aislados (posibles saltos):", spikes or "ninguno")
    print("máximo en bordes del cuadro:", f"{max(border):.3f}", "en f%03d" % int(np.argmax(border)))
    print("píxeles de logo blanco tocando el borde (máx. por cuadro):", max(logo_edge))

    p = params(4.0)
    ref = logo_canvas("mayella", p["may_w"])[MARGIN:MARGIN + H, MARGIN:MARGIN + W]
    ref8 = np.clip(ref * 255 + 0.5, 0, 255).astype(np.uint8)
    worst = 0
    first_clean = None
    for i in range(n):
        im = np.asarray(Image.open(FR / f"f{i:03d}.png"))
        err = np.abs(im.astype(int) - ref8[..., None].astype(int)).max()
        if i >= 100:
            worst = max(worst, err)
        if err <= 1 and first_clean is None:
            first_clean = i
        elif err > 1:
            first_clean = None
    print("error máx. f100–f119 vs logo Mayella limpio (0–255):", worst)
    print("limpio y estable desde:", f"f{first_clean:03d} ({first_clean / 30:.3f} s)" if first_clean is not None else "nunca")


if __name__ == "__main__":
    main()
