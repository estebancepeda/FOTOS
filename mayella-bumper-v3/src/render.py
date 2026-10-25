"""Renderizador del bumper: refracción óptica real sobre los logos originales.

Por cada píxel de salida se calcula una coordenada de muestreo desplazada por
la lente (campo de alturas del cristal → gradiente → desplazamiento) y se
muestrea el logo original con separación RGB. Los reflejos del contorno se
suman encima, pero la deformación de trazos viene del desplazamiento.

Uso:
  python3 render.py frames            # 120 cuadros PNG en renders/frames
  python3 render.py stills 5 9 18     # cuadros sueltos en contact/frames
  BUMPER_FORMAT=v python3 render.py … # versión vertical 1080×1920 (carpetas *_vertical)
"""
import sys
from functools import lru_cache
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from timeline import FPS, DURATION, SUFFIX, W, H, params, smoothstep

ROOT = Path(__file__).resolve().parent.parent
LOGOS = ROOT / "assets/logos"
SUBFRAMES = 6          # muestras temporales para motion blur
SHUTTER = 0.5          # obturador de 180°
CX, CY = W / 2.0, H / 2.0
MARGIN = 400           # lienzo del logo más grande que el cuadro (muestreo fuera de cuadro)

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
DX, DY = XX - CX, YY - CY
THETA = np.arctan2(DY, DX)


@lru_cache(maxsize=None)
def logo_alpha(name):
    return Image.open(LOGOS / f"{name}.png").getchannel("A")


def logo_canvas(name, width):
    """Logo original escalado (Lanczos) y centrado en un lienzo con margen."""
    src = logo_alpha(name)
    w = max(2, int(round(width)))
    h = max(2, int(round(src.height * w / src.width)))
    img = np.asarray(src.resize((w, h), Image.LANCZOS), np.float32) / 255.0
    canvas = np.zeros((H + 2 * MARGIN, W + 2 * MARGIN), np.float32)
    x0 = int(round(CX - w / 2.0)) + MARGIN
    y0 = int(round(CY - h / 2.0)) + MARGIN
    canvas[y0:y0 + h, x0:x0 + w] = img
    return canvas


def sample(canvas, u, v):
    """Muestreo bilineal en coordenadas de pantalla."""
    u = np.clip(u + MARGIN, 0, canvas.shape[1] - 2.001)
    v = np.clip(v + MARGIN, 0, canvas.shape[0] - 2.001)
    x0 = u.astype(np.int32)
    y0 = v.astype(np.int32)
    fx = u - x0
    fy = v - y0
    cw = canvas.shape[1]
    flat = canvas.ravel()
    i = y0 * cw + x0
    a = flat[i]
    b = flat[i + 1]
    c = flat[i + cw]
    d = flat[i + cw + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


def lobes(theta, spec):
    out = np.zeros_like(theta)
    for center, width, gain in spec:
        out = np.maximum(out, gain * np.exp(-(wrap(theta - center) / width) ** 2))
    return out


def organic(theta, t):
    """Irregularidad del contorno: suma de armónicos con fases que derivan."""
    return (0.55 * np.sin(3 * theta + 1.7 * t + 0.4)
            + 0.30 * np.sin(5 * theta - 2.3 * t + 1.9)
            + 0.20 * np.sin(2 * theta + 1.1 * t + 3.1)
            + 0.12 * np.sin(8 * theta - 3.7 * t + 0.7))


def render_sub(t):
    p = params(t)
    sx = p["size"]
    sy = sx * p["aspect"]
    # Superelipse suave (n=2 círculo … n≈5 cuadrado redondeado): sin aristas internas,
    # así la onda no rasga los trazos en las diagonales.
    n = 2.0 + 3.0 * (1.0 - p["corner"]) / 0.67
    rn = (np.abs(DX / sx) ** n + np.abs(DY / sy) ** n) ** (1.0 / n)
    d = (rn - 1.0) * sx
    d = d + p["wobble"] * organic(THETA, t)
    gy, gx = np.gradient(d)
    gn = np.hypot(gx, gy) + 1e-6
    nx, ny = gx / gn, gy / gn                       # normal hacia fuera
    R = sx
    rho = np.clip(1.0 + d / R, 0.0, 1.0)            # 0 centro, 1 contorno

    # --- Campo de desplazamiento (lupas de agua) -------------------------
    w = p["rim_w"]
    d0 = -0.55 * w
    rim = np.exp(-((d - d0) / w) ** 2)
    disp = -p["rim_k"] * (d - d0) * rim             # aumento local 1/(1-k) en el borde
    dw = -(1.0 - p["wave_pos"]) * R
    ww = 0.22 * R + 30
    wave = np.exp(-((d - dw) / ww) ** 2)
    disp = disp - p["wave_k"] * 0.85 * (d - dw) * wave
    disp = disp * smoothstep(0.02, 0.22, rn)        # la normal no existe en el centro exacto

    # sectores donde la curvatura/refracción es mayor → aberración cromática
    ph = 0.9 * t + 1.6 * float(smoothstep(0.55, 1.25, t))
    ca_sector = 0.15 + 0.85 * lobes(THETA, [(-0.8 + ph, 0.55, 1.0), (2.4 + ph * 0.7, 0.45, 0.9),
                                            (1.1 - ph * 0.5, 0.35, 0.6)])
    side = p["side"]
    if side > 0:
        ca_sector = (1 - side) * ca_sector + side * (0.1 + 0.9 * lobes(THETA, [(0.0, 0.45, 1.0), (np.pi, 0.45, 1.0)]))
    strength = np.clip(np.abs(disp) / (0.25 * w + 1e-3), 0, 1)
    e = p["ca"] * ca_sector * strength

    m = p["mag"]
    f = 1.0 / m + (1.0 - 1.0 / m) * rho ** 2         # domo: lupa central que se relaja hacia el borde

    mb = 1.0 - p["mix"]
    may = p["mix"]
    canv = 0
    if mb > 0:
        canv = canv + mb * logo_canvas("mercedes_140", p["mb_w"])
    if may > 0:
        canv = canv + may * logo_canvas("mayella", p["may_w"])

    rgb = np.empty((H, W, 3), np.float32)
    for ch, ec in enumerate((1.0, 0.0, -1.0)):
        k = 1.0 + ec * e
        fc = 1.0 + (f - 1.0) * (1.0 + 0.12 * ec * e)
        u = CX + DX * fc + nx * disp * k
        v = CY + DY * fc + ny * disp * k
        rgb[..., ch] = sample(canv, u, v) if not np.isscalar(canv) else 0

    clip = p["clip"]
    vis = 1.0 - clip * smoothstep(-3.0, 2.0, d)
    rgb *= vis[..., None]

    # --- Reflejos del contorno (por sectores, con desfase RGB) -----------
    light = p["light"]
    glow = np.zeros_like(rgb)
    if light > 0.002 or p["body"] > 0.002:
        cool = lobes(THETA, [(-0.75 + ph, 0.5, 1.0), (1.35 + ph * 0.8, 0.32, 0.75), (2.9 - ph * 0.4, 0.42, 0.9)])
        warm = lobes(THETA, [(2.45 + ph * 0.7, 0.22, 0.8), (-1.9 + ph, 0.18, 0.6)])
        if side > 0:
            sl = lobes(THETA, [(0.0, 0.38, 1.0), (np.pi, 0.38, 1.0), (0.35, 0.15, 0.7), (np.pi + 0.3, 0.15, 0.7)])
            cool = (1 - side) * cool + side * sl
            warm = (1 - side) * warm + side * 0.6 * sl
        chunk = np.clip(0.55 + 0.65 * np.sin(7 * THETA + 2.5 * t) * np.sin(3 * THETA - 1.3 * t + 0.5), 0.15, 1.2)
        cs = 2.0 + 5.0 * p["ca"]
        tint_c = (0.55, 0.80, 1.0)
        tint_w = (1.0, 0.55, 0.30)
        for ch, ec in enumerate((1.0, 0.0, -1.0)):
            dd = d + ec * cs * (cool + warm)          # canales desplazados solo donde hay reflejo
            band = np.exp(-((dd + 0.25 * w) / (0.28 * w + 1.5)) ** 2)
            inner = np.exp(-((dd + 0.95 * w) / (0.12 * w + 1.0)) ** 2)
            ghost = np.exp(-((dd - 0.6 * w) / (0.07 * w + 1.0)) ** 2)   # segundo contorno exterior tenue
            body = np.exp(-((dd + 0.35 * w) / (0.55 * w)) ** 2)
            fill = np.exp(-((dd + 0.5 * w) / (1.1 * w)) ** 2)           # espesor azulado del cristal
            glow[..., ch] = (light * chunk * (band * (tint_c[ch] * cool * 2.6 + tint_w[ch] * warm * 1.2)
                                              + 0.45 * inner * cool * tint_c[ch]
                                              + 0.22 * ghost * cool * tint_c[ch])
                             + p["body"] * (0.14 * body * (0.75, 0.85, 1.0)[ch]
                                            + 0.10 * fill * (0.30, 0.50, 1.0)[ch]))
    return rgb, glow


def render_frame(fi):
    t0 = fi / FPS
    acc = np.zeros((H, W, 3), np.float32)
    gacc = np.zeros((H, W, 3), np.float32)
    n = SUBFRAMES
    for s in range(n):
        t = t0 + ((s + 0.5) / n - 0.5) * SHUTTER / FPS
        t = min(max(t, 0.0), DURATION)
        rgb, glow = render_sub(t)
        acc += rgb
        gacc += glow
    acc /= n
    gacc /= n
    if gacc.max() > 1e-4:
        g8 = Image.fromarray(np.clip(gacc * 255, 0, 255).astype(np.uint8))
        bloom = np.asarray(g8.resize((W // 4, H // 4), Image.BILINEAR)
                           .filter(ImageFilter.GaussianBlur(4))
                           .resize((W, H), Image.BILINEAR), np.float32) / 255.0
        gacc = gacc + 0.45 * bloom
    out = 1.0 - (1.0 - acc) * (1.0 - np.clip(gacc, 0, 1))   # screen
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))


def _job(args):
    fi, outdir = args
    render_frame(fi).save(outdir / f"f{fi:03d}.png")
    return fi


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "frames"
    if mode == "frames":
        outdir = ROOT / f"renders/frames{SUFFIX}"
        frames = range(int(round(DURATION * FPS)))
    else:
        outdir = ROOT / f"contact/frames{SUFFIX}"
        frames = [int(x) for x in sys.argv[2:]]
    outdir.mkdir(parents=True, exist_ok=True)
    with Pool(4) as pool:
        for fi in pool.imap_unordered(_job, [(f, outdir) for f in frames]):
            print("ok", fi, flush=True)


if __name__ == "__main__":
    main()
