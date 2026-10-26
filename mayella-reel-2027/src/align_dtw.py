"""Alineación forzada del guion con el audio real, sin modelos de reconocimiento.

Método (como aeneas): se sintetiza el guion con espeak-ng (voz española, local y
gratuita) marcando cada palabra; se calculan MFCC de la síntesis y del audio
real y se alinean con DTW. Cada marca de palabra se traslada al tiempo real.

Requisitos: pip install espeakng-loader numpy   (todo desde PyPI)
Uso: python align_dtw.py   → transcript/words.json y transcript/phrases.json
"""
import ctypes
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import espeakng_loader

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "assets/audio/AUDIO_MERCEDES_MAYELLA.mp3"
SR = 16000

# Guion del cliente. (texto tal como se dijo, lectura para la síntesis)
# Las partes que el cliente marcó como no claras se leen como «eso» (relleno neutro).
SCRIPT = [
    ("Marcel Hernández, experto de producto de Mercedes-Benz Autozama,",
     "Marcel Hernández, experto de producto de Mercedes Benz Autosama,"),
    ("y para mí es un placer poder presentarles aquí en Auto Mayella",
     "y para mí es un placer poder presentarles aquí en Auto Mayella"),
    ("la nueva GLE 450 AMG Line,", "la nueva ge ele e cuatro cincuenta a eme ge lain,"),
    ("la GLS 450 AMG Line", "la ge ele ese cuatro cincuenta a eme ge lain"),
    ("y la GLE 450 AMG Line Coupé.", "y la ge ele e cuatro cincuenta a eme ge lain cupé."),
    ("Estos modelos cuentan con una nueva iluminación delantera con un patrón de estrellas,",
     "Estos modelos cuentan con una nueva iluminación delantera con un patrón de estrellas,"),
    ("trasera también, calandra iluminada, y no todo es diseño.",
     "trasera también, calandra iluminada, y no todo es diseño."),
    ("Ya pasando al interior, tenemos nuevos materiales con cuero",
     "Ya pasando al interior, tenemos nuevos materiales con cuero"),
    ("y también con nuevos colores como el [color] y nuevas molduras en el interior.",
     "y también con nuevos colores como el eso eso y nuevas molduras en el interior."),
    ("También cuentan con tres pantallas,", "También cuentan con tres pantallas,"),
    ("en la cual el acompañante va a poder ver películas, videos,",
     "en la cual el acompañante va a poder ver películas, videos,"),
    ("va a poder entrar a YouTube, Netflix, Amazon.", "va a poder entrar a yutub, netflix, amazon."),
    ("Es muy interactivo.", "Es muy interactivo."),
    ("También contamos con mejoras en seguridad,", "También contamos con mejoras en seguridad,"),
    ("como el Mercedes-Benz Drive Assistant Plus,", "como el Mercedes Benz draiv asístant plus,"),
    ("en el cual tenemos una interfaz más dinámica para prevención de choques",
     "en el cual tenemos una interfaz más dinámica para prevención de choques"),
    ("con peatones, motocicletas, vehículos, camiones.", "con peatones, motocicletas, vehículos, camiones."),
    ("Y también tenemos un modo de protección para aros", "Y también tenemos un modo de protección para aros"),
    ("y mejoras en el asistente de parque automático,", "y mejoras en el asistente de parque automático,"),
    ("salida de parqueo y también reverse automática.", "salida de parqueo y también rivers automática."),
    ("El vehículo cuenta con toda esta tecnología,", "El vehículo cuenta con toda esta tecnología,"),
    ("tiene una cámara de 560 grados,", "tiene una cámara de quinientos sesenta grados,"),
    ("la cual puede leer el territorio delantero y ya guardarlo,",
     "la cual puede leer el territorio delantero y ya guardarlo,"),
    ("y así se va presentando la parte inferior.", "y así se va presentando la parte inferior."),
    ("Esto funciona con el modo [modo] principalmente.", "Esto funciona con el modo eso principalmente."),
    ("Lo mejor es que lo puedan venir a probar aquí en Auto Mayella",
     "Lo mejor es que lo puedan venir a probar aquí en Auto Mayella"),
    ("y se la puedan llevar.", "y se la puedan llevar."),
]


# ------------------------------------------------------------------ síntesis con marcas
class Event(ctypes.Structure):
    class _Id(ctypes.Union):
        _fields_ = [("number", ctypes.c_int), ("name", ctypes.c_char_p), ("string", ctypes.c_char * 8)]
    _fields_ = [("type", ctypes.c_int), ("unique_identifier", ctypes.c_uint), ("text_position", ctypes.c_int),
                ("length", ctypes.c_int), ("audio_position", ctypes.c_int), ("sample", ctypes.c_int),
                ("user_data", ctypes.c_void_p), ("id", _Id)]


def synthesize(chunks, rate=190, gap=0.12):
    """Sintetiza cada frase SSML por separado y concatena; devuelve audio y tiempos de marcas.

    (espeak pierde las marcas que caen justo después de un punto, por eso cada
    frase va en su propia llamada: su primera palabra empieza en el desplazamiento conocido.)
    """
    lib = ctypes.CDLL(espeakng_loader.get_library_path())
    sr = lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0)   # SYNCHRONOUS
    CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(Event))
    state = {"samples": [], "marks": {}}

    def cb(wav, n, ev):
        if n > 0:
            state["samples"].append(np.ctypeslib.as_array(wav, shape=(n,)).copy())
        i = 0
        while ev[i].type != 0:
            if ev[i].type == 3:                        # espeakEVENT_MARK
                state["marks"][ev[i].id.name.decode()] = ev[i].audio_position / 1000.0
            i += 1
        return 0

    cbf = CB(cb)
    lib.espeak_SetSynthCallback(cbf)
    lib.espeak_SetVoiceByName(b"es")
    lib.espeak_SetParameter(1, rate, 0)                # espeakRATE
    out, marks, offset = [], {}, 0.0
    for first_mark, ssml in chunks:
        state["samples"], state["marks"] = [], {}
        data = ssml.encode("utf-8")
        lib.espeak_Synth(data, len(data) + 1, 0, 1, 0, 1 | 0x10, None, None)   # UTF8 | SSML
        lib.espeak_Synchronize()
        wav = np.concatenate(state["samples"]).astype(np.float32) / 32768
        nz = np.nonzero(np.abs(wav) > 1e-3)[0]
        lead = nz[0] / sr if len(nz) else 0.0
        marks[first_mark] = offset + lead
        for k, v in state["marks"].items():
            marks.setdefault(k, offset + v)
        out.append(wav)
        out.append(np.zeros(int(gap * sr), np.float32))
        offset += (len(wav) + int(gap * sr)) / sr
    marks["end"] = offset - gap
    return np.concatenate(out), sr, marks


def resample(x, sr_in, sr_out):
    t_out = np.arange(int(len(x) * sr_out / sr_in)) / sr_out
    return np.interp(t_out, np.arange(len(x)) / sr_in, x).astype(np.float32)


# ------------------------------------------------------------------ MFCC + DTW
def mfcc(x, sr=SR, hop=0.02, win=0.032, n_mel=32, n_cep=14):
    h, w = int(hop * sr), int(win * sr)
    nfft = 1 << (w - 1).bit_length()
    n = 1 + (len(x) - w) // h
    idx = np.arange(w)[None, :] + h * np.arange(n)[:, None]
    x = np.append(x[0], x[1:] - 0.97 * x[:-1])
    spec = np.abs(np.fft.rfft(x[idx] * np.hamming(w), nfft)) ** 2
    mel = lambda f: 2595 * np.log10(1 + f / 700)
    imel = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = imel(np.linspace(mel(100), mel(5000), n_mel + 2))
    bins = np.floor((nfft + 1) * pts / sr).astype(int)
    fb = np.zeros((n_mel, nfft // 2 + 1))
    for m in range(1, n_mel + 1):
        a, b, c = bins[m - 1], bins[m], bins[m + 1]
        fb[m - 1, a:b] = (np.arange(a, b) - a) / max(b - a, 1)
        fb[m - 1, b:c] = (c - np.arange(b, c)) / max(c - b, 1)
    logmel = np.log(spec @ fb.T + 1e-8)
    k = np.arange(n_mel)
    dct = np.cos(np.pi / n_mel * (k[None, :] + 0.5) * np.arange(n_cep)[:, None])
    c = logmel @ dct.T
    c = c[:, 1:]                                       # sin energía absoluta
    d = np.gradient(c, axis=0)
    f = np.hstack([c, d])
    return (f - f.mean(0)) / (f.std(0) + 1e-6)         # normalización por media y varianza


def dtw(A, B):
    """DTW con pendiente limitada (pasos (1,1), (1,2), (2,1)); vectorizado por filas."""
    na, nb = len(A), len(B)
    an = A / np.linalg.norm(A, axis=1, keepdims=True)
    bn = B / np.linalg.norm(B, axis=1, keepdims=True)
    INF = 1e12
    D = np.full((na, nb), INF, np.float64)
    P = np.zeros((na, nb), np.int8)
    d0 = 1 - an[0] @ bn.T
    D[0, 0] = d0[0]
    dprev = d0
    for i in range(1, na):
        di = 1 - an[i] @ bn.T
        c1 = np.full(nb, INF); c1[1:] = D[i - 1, :-1]
        c2 = np.full(nb, INF); c2[2:] = D[i - 1, :-2] + di[1:-1]
        c3 = np.full(nb, INF)
        if i >= 2:
            c3[1:] = D[i - 2, :-1] + dprev[1:]
        stack = np.vstack([c1, c2, c3])
        k = np.argmin(stack, 0)
        D[i] = di + stack[k, np.arange(nb)]
        P[i] = k
        dprev = di
    # recorrido inverso
    i, j = na - 1, nb - 1
    path = [(i, j)]
    while i > 0 and j > 0:
        k = P[i, j]
        if k == 0: i, j = i - 1, j - 1
        elif k == 1: i, j = i - 1, j - 2
        else: i, j = i - 2, j - 1
        path.append((max(i, 0), max(j, 0)))
    return np.array(path[::-1])


def main():
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(AUDIO), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    real = np.frombuffer(raw, "<i2").astype(np.float32) / 32768

    # Una llamada SSML por frase, con una marca antes de cada palabra
    chunks, words = [], []
    for pi, (shown, spoken) in enumerate(SCRIPT):
        parts = ["<speak>"]
        first = f"w{len(words)}"
        for wi, w in enumerate(spoken.split()):
            parts.append(f'<mark name="w{len(words)}"/>{w} ')
            words.append(dict(phrase=pi, i=wi, spoken=w))
        parts.append("</speak>")
        chunks.append((first, "".join(parts)))
    synth, sr_s, marks = synthesize(chunks)
    synth = resample(synth, sr_s, SR)

    hop = 0.02
    A, B = mfcc(synth), mfcc(real)
    path = dtw(A, B)
    ta, tb = path[:, 0] * hop, path[:, 1] * hop
    # mapeo monótono tiempo síntesis → tiempo real
    to_real = lambda t: float(np.interp(t, ta, tb))

    # marca perdida (poco frecuente): se interpola entre vecinas por número de letras
    missing = [k for k in range(len(words)) if f"w{k}" not in marks]
    for k in missing:
        a = max(j for j in range(k) if f"w{j}" in marks)
        b = min([j for j in range(k + 1, len(words)) if f"w{j}" in marks] or [None]) or None
        tb_ = marks[f"w{b}"] if b is not None else marks["end"]
        la = sum(len(words[j]["spoken"]) for j in range(a, k))
        lt = sum(len(words[j]["spoken"]) for j in range(a, b if b is not None else len(words)))
        marks[f"w{k}"] = marks[f"w{a}"] + (tb_ - marks[f"w{a}"]) * la / max(lt, 1)
    if missing:
        print("marcas interpoladas:", [words[k]["spoken"] for k in missing])
    for k, w in enumerate(words):
        w["start"] = round(to_real(marks[f"w{k}"]), 2)
    for k, w in enumerate(words):
        nxt = words[k + 1]["start"] if k + 1 < len(words) else round(to_real(marks["end"]), 2)
        w["end"] = nxt
    phrases = []
    for pi, (shown, spoken) in enumerate(SCRIPT):
        ws = [w for w in words if w["phrase"] == pi]
        phrases.append(dict(i=pi, text=shown, start=ws[0]["start"], end=ws[-1]["end"]))
    (ROOT / "transcript").mkdir(exist_ok=True)
    json.dump(words, open(ROOT / "transcript/words.json", "w"), ensure_ascii=False, indent=0)
    json.dump(phrases, open(ROOT / "transcript/phrases.json", "w"), ensure_ascii=False, indent=1)
    print(f"síntesis {len(synth) / SR:.1f} s · real {len(real) / SR:.1f} s · camino DTW {len(path)} pasos")
    for p in phrases:
        print(f"{p['start']:6.2f}–{p['end']:6.2f}  {p['text']}")


if __name__ == "__main__":
    sys.exit(main())
