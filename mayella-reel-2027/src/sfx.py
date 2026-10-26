"""Diseño sonoro del reel (solo efectos, sin voz ni música), sintetizado localmente.

Lee los tiempos reales de la animación (transcript/story_events.json, exportado con
`node render.mjs events story`) y coloca un efecto por cada evento gráfico:

  lente 'sweep'   → soplo de aire + toque de cristal + golpe sub en el cambio oculto
  lente 'reveal'  → apertura de cristal; con el logo de Mayella, impacto + acorde de campanas
  lente 'pass'    → soplo que se desplaza en estéreo siguiendo a la lupa
  ícono           → trayectoria (trazo que se dibuja) + clic al cerrarse
  texto           → tic suave (títulos con un pequeño aire)
  línea           → «zip» que se abre en estéreo
  estrellas       → un punto de cristal por estrella, de izquierda a derecha
  pantallas       → trayectoria del contorno + puntos de interfaz
  contador / anillo → tics mecánicos que siguen el giro (cada 30°) + campanita al fijarse
  cápsulas        → pop por plataforma
  pulso radar     → ping por ciclo
  escaneo         → barrido suave por ciclo

Salida: renders/reel_mercedes_2027_sfx.wav (48 kHz, 24 bit, estéreo, 71 s) y
transcript/sfx_cues.md (lista de efectos con su tiempo).
"""
import json
import math
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
rng = np.random.default_rng(2027)

# Ganancia de los efectos de interfaz (clic, punto, trayectoria, tic) respecto a las transiciones
UI = 1.6          # ≈ +4 dB

# Notas de cristal (La mayor pentatónica, registro alto)
NOTES = [880.0, 987.77, 1108.73, 1318.51, 1479.98, 1760.0, 1975.53, 2217.46]


# ------------------------------------------------------------------ utilidades
def tvec(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, attack, decay, curve=5.0):
    t = np.arange(n) / SR
    e = np.where(t < attack, np.sin(0.5 * np.pi * np.clip(t / max(attack, 1e-4), 0, 1)) ** 2,
                 np.exp(-curve * (t - attack) / max(decay, 1e-4)))
    return e


def svf(x, fc, q=0.8, mode="bp"):
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    f = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR)
    low = band = 0.0
    out = np.empty_like(x)
    damp = 1.0 / q
    for i in range(len(x)):
        high = x[i] - low - damp * band
        band += f[i] * high
        low += f[i] * band
        out[i] = band if mode == "bp" else (low if mode == "lp" else high)
    return out


def pan(mono, p):
    p = np.broadcast_to(np.asarray(p, float), mono.shape)
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], 1)


def noise(n):
    return rng.standard_normal(n)


# ------------------------------------------------------------------ biblioteca de efectos
def glass(f0, gain=0.1, decay=1.2, p=0.0):
    t = tvec(decay * 1.6)
    s = np.zeros_like(t)
    for r, g in zip([1.0, 2.76, 5.40, 8.93], [1.0, 0.45, 0.22, 0.10]):
        s += g * np.sin(2 * np.pi * f0 * r * t + rng.uniform(0, 6.28)) * np.exp(-t * 4.5 / (decay / r ** 0.5))
    s *= np.clip(t / 0.003, 0, 1)
    return pan(gain * s, p)


def sub(f0=62, dur=0.7, gain=0.4, drop=28):
    t = tvec(dur)
    ph = 2 * np.pi * (f0 * t - drop * t ** 2 / 2)
    return pan(gain * np.sin(ph) * env_ad(len(t), 0.006, dur * 0.8, 4.0), 0.0)


def tick(gain=0.12, f=4200, p=0.0):
    gain *= UI
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    burst = svf(noise(n), f, 2.5) * np.exp(-t * 900)
    tone = np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t * 400) * 0.6
    return pan(gain * (burst / (np.abs(burst).max() + 1e-9) + tone), p)


def click(gain=0.22, p=0.0):
    a = tick(gain, 3000, p)
    b = tick(gain * 0.6, 2400, p)
    out = np.zeros((int(0.09 * SR), 2))
    out[: len(a)] += a
    out[int(0.05 * SR): int(0.05 * SR) + len(b)] += b
    return out


def blip(f=1760, gain=0.09, p=0.0, dur=0.09):
    gain *= UI
    t = tvec(dur)
    s = np.sin(2 * np.pi * (f * t + f * 0.6 * t ** 2)) * env_ad(len(t), 0.002, dur * 0.7, 5.0)
    return pan(gain * s, p)


def whoosh(dur, f0, f1, peak=0.5, gain=0.25, p0=0.0, p1=0.0, q=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    fc = f0 * (f1 / f0) ** (t / dur)
    u = t / dur
    e = np.where(u < peak, (u / peak) ** 2.2, np.exp(-(u - peak) / (1 - peak) * 4.0))
    l = svf(noise(n), fc, q) * e
    r = svf(noise(n), fc * 1.04, q) * e
    pp = p0 + (p1 - p0) * (0.5 - 0.5 * np.cos(np.pi * u))
    mono_l = pan(l, pp)[:, 0]
    mono_r = pan(r, pp)[:, 1]
    out = np.stack([mono_l, mono_r], 1)
    return gain * out / (np.abs(out).max() + 1e-9)


def trajectory(dur, f0=520, f1=1500, gain=0.07, p0=-0.2, p1=0.2):
    """Trazo que se dibuja: deslizamiento tonal suave con aire filtrado que lo acompaña."""
    gain *= UI
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    k = 0.5 - 0.5 * np.cos(np.pi * u)
    f = f0 * (f1 / f0) ** k
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    air = svf(noise(n), f * 2.2, 2.0)
    air /= np.abs(air).max() + 1e-9
    e = np.sin(np.pi * np.clip(u, 0, 1)) ** 1.5
    return pan(gain * (0.55 * tone + 0.45 * air) * e, p0 + (p1 - p0) * u)


def zip_spread(gain=0.08, dur=0.45):
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    e = (1 - u) ** 2 * np.clip(u / 0.05, 0, 1)
    l = svf(noise(n), 5200 + 2500 * u, 1.5, "bp") * e
    r = svf(noise(n), 5200 + 2500 * u, 1.5, "bp") * e
    out = np.stack([l, r], 1)
    return gain * out / (np.abs(out).max() + 1e-9)


def ping(f=1250, gain=0.06, decay=1.0, p=0.0):
    t = tvec(decay * 1.4)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 5 / decay) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 9 / decay)
    s *= np.clip(t / 0.004, 0, 1)
    out = pan(gain * s, p)
    echo = np.zeros_like(out)
    d = int(0.18 * SR)
    echo[d:] = out[:-d] * 0.35
    return out + echo[:, ::-1]                         # eco cruzado L/R


def riser(dur, gain=0.18):
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    nz = svf(noise(n), 400 + 5000 * u ** 2, 1.2) * u ** 2.5
    tone = np.sin(2 * np.pi * np.cumsum(330 + 660 * u ** 2) / SR) * u ** 3 * 0.3
    s = nz / (np.abs(nz).max() + 1e-9) + tone
    return pan(gain * s, 0.0)


def chord_bells(fs, gain=0.08, decay=2.4):
    out = None
    for i, f in enumerate(fs):
        g = glass(f, gain * (1 - 0.12 * i), decay, p=(-0.5 + i / max(len(fs) - 1, 1)))
        out = g if out is None else mix_into(out, g, int(0.012 * SR * i))
    return out


def mix_into(a, b, off):
    n = max(len(a), off + len(b))
    o = np.zeros((n, 2))
    o[: len(a)] += a
    o[off: off + len(b)] += b
    return o


# ------------------------------------------------------------------ línea de tiempo
class Track:
    def __init__(self, dur):
        self.buf = np.zeros((int(dur * SR) + SR, 2))
        self.cues = []

    def add(self, t, snd, label=None):
        i = int(round(t * SR))
        if i < 0:
            snd, i = snd[-i:], 0
        j = min(len(self.buf), i + len(snd))
        self.buf[i:j] += snd[: j - i]
        if label:
            self.cues.append((t, label))


def ease_out_quart(u):
    return 1 - (1 - u) ** 4


def ease_in_out_cubic(u):
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2


def inv(fn, y, lo=0.0, hi=1.0):
    """Inversa numérica de una curva monótona en [0,1]."""
    for _ in range(40):
        mid = (lo + hi) / 2
        if fn(mid) < y:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def build(ev):
    dur = ev["duration"]
    tr = Track(dur)
    # ---- lentes de cristal
    for k, L in enumerate(ev["lens"]):
        t0, d = L["t0"], L["dur"]
        if L["type"] == "sweep":
            swap = t0 + 0.38 * d
            tr.add(t0 - 0.05, whoosh(d + 0.25, 500, 6500, peak=0.42, gain=0.22), "transición de cristal")
            tr.add(swap, glass(NOTES[(k * 3) % len(NOTES)], 0.07, 1.1, p=rng.uniform(-0.3, 0.3)))
            tr.add(swap, sub(58, 0.6, 0.22, 20))
        elif L["type"] == "pass":
            p0, p1 = (0.9, -0.9) if L.get("dir") == -1 else (-0.9, 0.9)
            tr.add(t0, whoosh(d, 900, 3200, peak=0.5, gain=0.16, p0=p0, p1=p1, q=0.9), "lupa que cruza")
            tr.add(t0 + d * 0.5, glass(NOTES[5], 0.035, 0.8, p=0.0))
        elif L["type"] == "reveal":
            if t0 < 1:                                    # apertura del video
                tr.add(t0, whoosh(1.4, 300, 5000, peak=0.35, gain=0.2), "apertura de cristal")
                tr.add(t0 + 0.08, chord_bells([NOTES[0], NOTES[3]], 0.05, 1.8))
                tr.add(t0 + 0.05, sub(52, 0.9, 0.25, 14))
            else:                                         # logo de Mayella
                big = t0 > dur - 10
                tr.add(t0 - 0.6, riser(0.62, 0.16 if big else 0.12), "subida al logo")
                tr.add(t0 + 0.02, sub(48, 1.4 if big else 1.0, 0.45 if big else 0.35, 16), "impacto logo Mayella")
                tr.add(t0 + 0.02, chord_bells([440.0, 554.37, 659.25, 880.0, 1318.51] if big else [659.25, 880.0, 1108.73],
                                              0.07 if big else 0.06, 3.2 if big else 2.2))
                tr.add(t0 + 0.05, whoosh(1.6, 4000, 900, peak=0.08, gain=0.12))
    # ---- elementos de cada escena
    for sc in ev["scenes"]:
        t0s, t1s = sc["t0"], sc["t1"]
        last_text = -9
        for e in sc["els"]:
            at = t0s + e.get("at", 0)
            ty = e["type"]
            end = t0s + e["out"] if e.get("out") is not None else t1s
            if ty == "text":
                if at - last_text < 0.08:
                    continue
                last_text = at
                if e.get("size", 0) >= 60:
                    tr.add(at - 0.04, whoosh(0.32, 2500, 7000, peak=0.6, gain=0.05))
                    tr.add(at + 0.02, tick(0.10, 3600), "texto")
                else:
                    tr.add(at + 0.01, tick(0.07, 5200), "texto pequeño")
            elif ty in ("icon", "iconlabel"):
                d = e.get("dur", 1.1 if ty == "icon" else 1.0)
                x = (e.get("x") or 0) / 540
                tr.add(at, trajectory(d * 0.85, p0=x - 0.15, p1=x + 0.15), f"ícono {e.get('name') or e.get('icon')}")
                tr.add(at + d * 0.9, click(0.12, x))
                if (e.get("name") or e.get("icon")) == "mouse-pointer-click":
                    tr.add(at + d * 0.95, click(0.2, 0.1), "clic")
            elif ty == "iconrow":
                n = len(e["items"])
                for i, it in enumerate(e["items"]):
                    a = t0s + it["at"]
                    x = (i - (n - 1) / 2) * e.get("gap", 300) / 540
                    tr.add(a, trajectory(0.85, 480 + 90 * i, 1400 + 120 * i, p0=x - 0.1, p1=x + 0.1), f"ícono {it['icon']}")
                    tr.add(a + 0.9, click(0.12, x))
            elif ty == "rule":
                tr.add(at, zip_spread(0.06), "línea")
            elif ty == "image" and e.get("name") == "star":
                tr.add(at, glass(NOTES[3], 0.06, 1.4), "estrella Mercedes")
            elif ty == "stars":
                cols, rows = e.get("cols", 11), e.get("rows", 3)
                for r in range(rows):
                    for c in range(cols):
                        u = (c - (cols - 1) / 2) / ((cols - 1) / 2)
                        if abs(u) > 1 - 0.18 * abs(r - (rows - 1) / 2):
                            continue
                        a = at + (u + 1) * 0.45 + r * 0.06
                        tr.add(a, glass(NOTES[rng.integers(3, len(NOTES))] * (1 + 0.5 * (r == 0)), 0.022, 0.6, p=u * 0.85))
                tr.cues.append((at, "patrón de estrellas (puntos)"))
            elif ty == "screens":
                tr.add(at, trajectory(1.1, 300, 900, 0.07, -0.6, 0.6), "pantallas: contorno")
                for k in (1, 2):
                    tr.add(at + 0.6 + k * 0.15, blip(1318.5, 0.06, p=-0.33 + 0.66 * (k - 1)))
                for k in range(3):
                    tr.add(at + 0.9 + k * 0.2, blip(1760 + 220 * k, 0.05, p=-0.6 + 0.6 * k, dur=0.07))
            elif ty == "counter":
                steps = ((int(str(e["to"])[0]) - int(str(e.get("from", 0))[0]) + 10) % 10) + 10 * e.get("loops", 1)
                d = e.get("dur", 1.4)
                for s in range(1, steps + 1):
                    tr.add(at + d * inv(ease_out_quart, s / steps), tick(0.09, 2800))
                tr.add(at + d * 0.98, blip(1318.5, 0.08), "contador")
            elif ty == "chips":
                for i, it in enumerate(e["items"]):
                    a = t0s + it["at"]
                    tr.add(a, click(0.12, 0.0), f"cápsula {it['text']}")
                    tr.add(a + 0.01, blip(1108.7 + 220 * i, 0.06))
            elif ty == "ring":
                d = e.get("dur", 1.6)
                value = e.get("value", 360)
                steps = int(value // 30)                    # un tic cada 30° recorridos (560° → 18 tics)
                for k in range(1, steps + 1):
                    tr.add(at + d * inv(ease_in_out_cubic, k * 30 / value), tick(0.07, 3000 + 70 * k, p=math.sin(2 * math.pi * k / 12) * 0.7))
                tr.add(at, trajectory(d, 300, 1300, 0.05, -0.5, 0.5), f"anillo {value}°")
                tr.add(at + d, glass(NOTES[4], 0.07, 1.4))
            elif ty == "pulse":
                period = e.get("period", 1.6)
                a = at
                while a < end - 0.2:
                    tr.add(a, ping(1250, 0.05, 1.0), "radar")
                    a += period
            elif ty == "scan":
                period = e.get("period", 1.4)
                a = at
                while a < end - 0.3:
                    tr.add(a, whoosh(period, 1800, 600, peak=0.5, gain=0.045, q=2.0), "escaneo")
                    a += period
    return tr


def reverb(x, seconds=1.4, mix=0.22):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = x.copy()
    L = 1 << int(np.ceil(np.log2(len(x) + n)))
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * 4.2)
        ir = np.convolve(ir, np.ones(8) / 8, "same")
        ir /= np.sqrt((ir ** 2).sum())
        wet = np.fft.irfft(np.fft.rfft(x[:, ch], L) * np.fft.rfft(ir, L), L)[: len(x)]
        out[:, ch] = x[:, ch] + mix * wet
    return out


def write_wav24(path, x):
    pcm = np.clip(np.round(x * 8388607), -8388608, 8388607).astype("<i4")
    b = pcm.reshape(-1).view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(b)


def main():
    ev = json.load(open(ROOT / "transcript/story_events.json"))
    tr = build(ev)
    mix = reverb(tr.buf)[: int(ev["duration"] * SR)]
    mix[-int(0.05 * SR):] *= np.linspace(1, 0, int(0.05 * SR))[:, None]
    peak = np.abs(mix).max()
    mix *= 10 ** (-1.0 / 20) / peak                     # pico −1 dBFS
    out = ROOT / "renders/reel_mercedes_2027_sfx.wav"
    write_wav24(out, mix)
    cues = sorted(tr.cues)
    lines = ["# Efectos de sonido · cue sheet", "", "Tiempos en el video (s). Generado por `src/sfx.py`.", "",
             "| Tiempo | Efecto |", "|---:|---|"] + [f"| {t:.2f} | {l} |" for t, l in cues]
    (ROOT / "transcript/sfx_cues.md").write_text("\n".join(lines) + "\n")
    print(f"ok {out}  {len(mix) / SR:.2f} s  · {len(cues)} efectos")


if __name__ == "__main__":
    sys.exit(main())
