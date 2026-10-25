"""Curvas de animación del bumper (editable).

Cada pista es una lista de (tiempo_s, valor). Se interpola con PCHIP (cúbica
monótona): aceleración y frenado suaves, sin velocidad lineal ni rebotes.
"""
import numpy as np

FPS = 30
DURATION = 4.0
W, H = 1920, 1080

# Tiempos aprobados en el storyboard
STORY = [
    (5, "Lente inicial"), (9, "Expansión"), (18, "Cuadrado redondeado"),
    (30, "Contorno + refracción"), (38, "La luz se retira"), (44, "Concentración"),
    (46, "Cambio oculto en lente"), (53, "Apertura circular"), (60, "Estira el nombre"),
    (68, "Recupera proporción"), (83, "Refracción lateral"), (100, "Reposo limpio"),
]

SWAP_T = 1.505  # centro del fundido Mercedes -> Mayella (máxima distorsión)

TRACKS = {
    # Semitamaño horizontal de la lente (px). Vertical = size * aspect.
    "size": [(0.0, 30), (0.167, 245), (0.300, 355), (0.600, 420), (1.000, 440),
             (1.267, 455), (1.400, 345), (1.467, 265), (1.505, 180), (1.533, 160), (1.767, 330),
             (2.000, 450), (2.267, 485), (2.767, 505), (3.050, 720), (3.333, 1400), (4.0, 1500)],
    "aspect": [(0.0, 1.0), (1.767, 1.0), (2.000, 1.08), (2.267, 1.25), (2.767, 1.5),
               (3.333, 1.6), (4.0, 1.6)],
    # Radio de esquina relativo (1 = círculo, 0.33 = cuadrado redondeado)
    "corner": [(0.0, 1.0), (0.300, 0.97), (0.600, 0.36), (1.000, 0.33), (1.267, 0.35),
               (1.467, 0.62), (1.533, 1.0), (4.0, 1.0)],
    # Ancho del logo en pantalla (px)
    "mb_w": [(0.0, 330), (0.167, 470), (0.300, 570), (0.600, 600), (1.000, 610),
             (1.267, 620), (1.467, 350), (1.533, 300)],
    "may_w": [(1.467, 250), (1.533, 270), (1.767, 470), (2.000, 700), (2.267, 790),
              (2.767, 800), (4.0, 800)],
    # Aumento en el centro de la lente (>1 lupa, <1 concentra)
    "mag": [(0.0, 1.25), (0.167, 1.18), (0.300, 1.10), (0.600, 1.04), (1.000, 1.03),
            (1.267, 1.02), (1.400, 0.99), (1.467, 0.95), (1.505, 0.74), (1.533, 0.76), (1.650, 0.98),
            (1.767, 1.10), (2.000, 1.10), (2.267, 1.04), (2.767, 1.01), (3.000, 1.0), (4.0, 1.0)],
    # Fuerza de refracción del borde (0..1: aumento local 1/(1-k) sobre el borde)
    "rim_k": [(0.0, 0.0), (0.100, 0.7), (0.300, 0.85), (0.600, 0.8), (1.000, 0.85),
              (1.267, 0.55), (1.400, 0.35), (1.467, 0.3), (1.505, 0.85), (1.533, 0.95), (1.767, 0.9),
              (2.000, 0.85), (2.267, 0.65), (2.767, 0.75), (3.050, 0.3), (3.300, 0.0), (4.0, 0.0)],
    # Ancho del borde de cristal (px)
    "rim_w": [(0.0, 30), (0.300, 54), (0.600, 62), (1.267, 58), (1.533, 38), (1.767, 56),
              (2.000, 66), (2.767, 72), (3.300, 90), (4.0, 90)],
    # Onda interior que recorre logo y letras
    "wave_k": [(0.0, 0.0), (0.200, 0.0), (0.450, 0.45), (0.800, 0.38), (1.050, 0.0),
               (1.467, 0.0), (1.505, 0.65), (1.533, 0.7), (1.700, 0.45), (2.000, 0.7), (2.267, 0.45),
               (2.600, 0.0), (4.0, 0.0)],
    # Posición del frente de onda (0 = centro, 1 = contorno)
    "wave_pos": [(0.0, 0.0), (0.200, 0.05), (0.450, 0.35), (0.800, 0.7), (1.050, 0.95),
                 (1.400, 0.9), (1.505, 0.45), (1.600, 0.3), (1.700, 0.35), (2.000, 0.6),
                 (2.267, 0.85), (2.600, 1.0), (4.0, 1.0)],
    # Intensidad de reflejos del contorno
    "light": [(0.0, 0.0), (0.120, 0.85), (0.300, 1.0), (0.600, 0.95), (1.000, 1.0),
              (1.267, 0.28), (1.400, 0.05), (1.467, 0.0), (1.533, 0.6), (1.767, 0.95),
              (2.000, 1.0), (2.267, 0.75), (2.767, 1.0), (3.050, 0.3), (3.300, 0.0), (4.0, 0.0)],
    # Cuerpo visible del cristal (tenue)
    "body": [(0.0, 0.0), (0.150, 0.5), (1.000, 0.45), (1.267, 0.4), (1.467, 0.0),
             (1.533, 0.4), (2.267, 0.35), (2.767, 0.3), (3.200, 0.0), (4.0, 0.0)],
    # Aberración cromática (separación relativa R/B del desplazamiento)
    "ca": [(0.0, 0.25), (0.300, 0.35), (1.000, 0.35), (1.467, 0.2), (1.533, 0.6),
           (2.000, 0.45), (2.767, 0.45), (3.300, 0.0), (4.0, 0.0)],
    # Irregularidad orgánica del contorno (px)
    "wobble": [(0.0, 3), (0.300, 9), (0.600, 7), (1.267, 6), (1.533, 10), (2.000, 12),
               (2.767, 14), (3.300, 20), (4.0, 20)],
    # Peso de los reflejos concentrados en los lados (refracción lateral)
    "side": [(0.0, 0.0), (1.467, 0.0), (1.600, 0.55), (2.267, 0.65), (2.600, 1.0), (4.0, 1.0)],
    # 1 = el contenido solo se ve dentro de la lente; 0 = visible en todo el cuadro
    "clip": [(0.0, 1.0), (3.000, 1.0), (3.300, 0.0), (4.0, 0.0)],
}


def pchip(xs, ys, x):
    xs = np.asarray(xs, float)
    ys = np.asarray(ys, float)
    if x <= xs[0]:
        return float(ys[0])
    if x >= xs[-1]:
        return float(ys[-1])
    h = np.diff(xs)
    delta = np.diff(ys) / h
    n = len(xs)
    d = np.zeros(n)
    for i in range(1, n - 1):
        if delta[i - 1] * delta[i] > 0:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
    # extremos: tangente cero (arranque/llegada suaves)
    i = int(np.searchsorted(xs, x) - 1)
    t = (x - xs[i]) / h[i]
    h00 = 2 * t**3 - 3 * t**2 + 1
    h10 = t**3 - 2 * t**2 + t
    h01 = -2 * t**3 + 3 * t**2
    h11 = t**3 - t**2
    return float(h00 * ys[i] + h10 * h[i] * d[i] + h01 * ys[i + 1] + h11 * h[i] * d[i + 1])


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def params(t):
    p = {k: pchip([a for a, _ in v], [b for _, b in v], t) for k, v in TRACKS.items()}
    # Fundido entre marcas, oculto en la máxima distorsión (≈2.5 cuadros)
    p["mix"] = float(smoothstep(SWAP_T - 0.045, SWAP_T + 0.045, t))
    p["t"] = t
    return p
