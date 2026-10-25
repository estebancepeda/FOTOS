"""Diseño sonoro sintetizado localmente (sin muestras externas).

Sincronía con la imagen:
  0.00–0.30  aire + campana de cristal que se abre (expansión)
  0.60       asentamiento grave suave (cuadrado redondeado)
  0.90–1.20  destellos que recorren el contorno (paneo L→R)
  1.30–1.505 inspiración inversa que se corta en el cambio oculto
  1.505      golpe sub + «ting» de cristal (cambio de marca)
  1.77       soplo de apertura de la lente
  2.77       destellos laterales L / R (refracción lateral)
  3.30–4.00  acorde de asentamiento + campana final, cola limpia
"""
from pathlib import Path
import wave

import numpy as np

SR = 48000
DUR = 4.0
N = int(SR * DUR)
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(140)
T = np.arange(N) / SR


def env(t0, attack, decay, curve=4.0):
    """Envolvente exponencial: subida suave (seno) y caída exponencial."""
    x = T - t0
    e = np.zeros(N)
    a = (x >= 0) & (x < attack)
    e[a] = np.sin(0.5 * np.pi * x[a] / attack) ** 2
    d = x >= attack
    e[d] = np.exp(-curve * (x[d] - attack) / decay)
    return e


def swell(t0, t1, power=2.5):
    """Subida que termina en seco en t1 (efecto inverso)."""
    x = (T - t0) / (t1 - t0)
    e = np.where((x >= 0) & (x < 1), np.clip(x, 0, 1) ** power, 0.0)
    return e


def svf(x, fc, q=0.7, mode="bp"):
    """Filtro de variables de estado con frecuencia variable en el tiempo."""
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


def glass_bell(t0, f0, amp, decay=1.2):
    ratios = [1.0, 2.76, 5.40, 8.93]
    gains = [1.0, 0.45, 0.22, 0.10]
    s = np.zeros(N)
    for r, g in zip(ratios, gains):
        s += g * np.sin(2 * np.pi * f0 * r * (T - t0)) * env(t0, 0.004, decay / r ** 0.5)
    return amp * s


def pan(mono, p):
    """p: -1 izquierda … 1 derecha (constante o array). Ley de potencia constante."""
    p = np.broadcast_to(np.asarray(p, float), mono.shape)
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], 1)


def build():
    out = np.zeros((N, 2))
    noise = rng.standard_normal(N)

    # 1) Expansión: aire filtrado que sube + campana de cristal
    fc = 400 + 5000 * np.clip(T / 0.32, 0, 1) ** 1.5
    air = svf(noise, fc, 1.2) * (swell(0.0, 0.30, 1.6) + env(0.30, 0.001, 0.35) * 0.9) * 0.22
    out += pan(air, 0.0)
    out += pan(glass_bell(0.12, 1318.5, 0.10, 1.0), -0.25)
    out += pan(glass_bell(0.20, 1975.5, 0.06, 0.9), 0.3)

    # 2) Asentamiento grave al formarse el cuadrado
    thump = np.sin(2 * np.pi * (70 * (T - 0.58) - 8 * (T - 0.58) ** 2)) * env(0.58, 0.02, 0.45)
    out += pan(thump * 0.22, 0.0)

    # 3) Destellos que recorren el contorno (L → R)
    for i, tt in enumerate(np.linspace(0.88, 1.18, 6)):
        out += pan(glass_bell(tt, 2637.0 * (1 + 0.06 * (i % 3)), 0.035, 0.5), -0.8 + 0.32 * i)

    # 4) Inspiración inversa que se corta en el cambio oculto
    fc2 = 300 + 3500 * np.clip((T - 1.25) / 0.255, 0, 1) ** 2
    inhale = svf(noise[::-1].copy(), fc2, 1.5) * swell(1.25, 1.505, 3.0) * 0.30
    out += pan(inhale, 0.0)
    rise = np.sin(2 * np.pi * np.cumsum(220 + 440 * np.clip((T - 1.3) / 0.205, 0, 1) ** 2) / SR)
    out += pan(rise * swell(1.30, 1.505, 3.0) * 0.05, 0.0)

    # 5) Cambio: sub + «ting»
    x = T - 1.505
    sub = np.sin(2 * np.pi * (58 * x - 30 * x ** 2)) * env(1.505, 0.006, 0.7)
    out += pan(sub * 0.42, 0.0)
    out += pan(glass_bell(1.510, 1760.0, 0.12, 1.4), 0.0)

    # 6) Apertura de la lente: soplo descendente, abierto en estéreo
    fc3 = 4500 - 3600 * np.clip((T - 1.55) / 0.5, 0, 1) ** 0.7
    whoosh = svf(rng.standard_normal(N), fc3, 0.9) * env(1.60, 0.17, 0.45) * 0.20
    out += pan(whoosh, -0.45) + pan(svf(rng.standard_normal(N), fc3, 0.9) * env(1.60, 0.17, 0.45) * 0.20, 0.45)

    # 7) Refracción lateral
    out += pan(glass_bell(2.70, 2349.3, 0.05, 0.8), -0.9)
    out += pan(glass_bell(2.76, 2793.8, 0.05, 0.8), 0.9)

    # 8) Asentamiento final: acorde cálido + campana limpia
    chord = np.zeros(N)
    for f, g in [(110.0, 0.5), (164.81, 0.35), (220.0, 0.35), (277.18, 0.22), (329.63, 0.18)]:
        chord += g * (np.sin(2 * np.pi * f * T) + 0.15 * np.sin(2 * np.pi * 2 * f * T))
    chord *= env(3.22, 0.10, 1.6, 3.0)
    out += pan(chord * 0.20, 0.0)
    out += pan(glass_bell(3.30, 880.0, 0.10, 1.8), 0.0)

    # Reverberación sintética (cola estéreo decorrelacionada)
    ir_n = int(1.1 * SR)
    ti = np.arange(ir_n) / SR
    wet = np.zeros_like(out)
    for ch in range(2):
        ir = rng.standard_normal(ir_n) * np.exp(-ti * 5.5)
        ir = np.convolve(ir, np.ones(6) / 6, "same")  # suaviza agudos
        ir /= np.sqrt((ir ** 2).sum())
        L = 1 << int(np.ceil(np.log2(N + ir_n)))
        wet[:, ch] = np.fft.irfft(np.fft.rfft(out[:, ch], L) * np.fft.rfft(ir, L), L)[:N]
    mix = out * 0.8 + wet * 0.35

    # Fundido final suave y normalización a -3 dBFS de pico
    fade = np.clip((DUR - T) / 0.30, 0, 1) ** 2
    mix *= fade[:, None]
    mix *= 10 ** (-3 / 20) / np.abs(mix).max()
    return mix


def main():
    mix = build()
    pcm = np.clip(mix * 32767, -32768, 32767).astype("<i2")
    path = ROOT / "renders/bumper_audio.wav"
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    peak = 20 * np.log10(np.abs(mix).max())
    rms = 20 * np.log10(np.sqrt((mix ** 2).mean()))
    print(f"ok {path}  pico {peak:.2f} dBFS  RMS {rms:.1f} dBFS")


if __name__ == "__main__":
    main()
