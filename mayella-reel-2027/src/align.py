"""Alinea el guion (texto del cliente) con el audio sin modelos de reconocimiento.

1. Envolvente de energía de la banda de voz (250–3500 Hz) → pausas candidatas.
2. Sílabas por frase (grupos vocálicos sobre una transcripción fonética simple).
3. Programación dinámica: cada límite de frase cae en una pausa, minimizando la
   desviación respecto a una velocidad de habla constante; las pausas largas
   se favorecen en finales de oración.
Salida: transcript/alignment.json con inicio/fin estimado por frase.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "assets/audio/AUDIO_MERCEDES_MAYELLA.mp3"

# (texto en pantalla/guion, lectura fonética para contar sílabas, fin de oración)
PHRASES = [
    ("Marcel Hernández,", "marsel ernandes", False),
    ("experto de producto de Mercedes-Benz Autosama,", "experto de produkto de mersedes bens autosama", False),
    ("y para mí es un placer poder presentarles aquí en Auto Mayella", "i para mi es un plaser poder presentarles aki en auto maiella", False),
    ("la nueva GLE 450 AMG Line,", "la nueva je ele e kuatro sinkuenta a eme je lain", False),
    ("la GLS 450 AMG Line", "la je ele ese kuatro sinkuenta a eme je lain", False),
    ("y la GLE 450 AMG Line Coupé.", "i la je ele e kuatro sinkuenta a eme je lain kupe", True),
    ("Estos modelos cuentan con una nueva iluminación delantera con un patrón de estrellas,",
     "estos modelos kuentan kon una nueva iluminasion delantera kon un patron de estreias", False),
    ("trasera también,", "trasera tambien", False),
    ("calandra iluminada,", "kalandra iluminada", False),
    ("y no todo es diseño.", "i no todo es diseño", True),
    ("Ya pasando al interior, tenemos nuevos materiales con cuero", "ia pasando al interior tenemos nuevos materiales kon kuero", False),
    ("y también con nuevos colores como el [color]", "i tambien kon nuevos kolores komo el xxxxx", False),
    ("y nuevas molduras en el interior.", "i nuevas molduras en el interior", True),
    ("También cuentan con tres pantallas,", "tambien kuentan kon tres pantaias", False),
    ("en la cual el acompañante va a poder ver películas, videos,", "en la kual el akompañante va a poder ver pelikulas videos", False),
    ("va a poder entrar a YouTube, Netflix, Amazon.", "va a poder entrar a iutub netflis amason", True),
    ("Es muy interactivo.", "es mui interaktivo", True),
    ("También contamos con mejoras en seguridad,", "tambien kontamos kon mejoras en seguridad", False),
    ("como el Mercedes-Benz Drive Assistant Plus,", "komo el mersedes bens draiv asistant plus", False),
    ("en el cual tenemos una interfaz más dinámica para prevención de choques", "en el kual tenemos una interfas mas dinamika para prevension de choques", False),
    ("con peatones, motocicletas, vehículos, camiones.", "kon peatones motosikletas veikulos kamiones", True),
    ("Y también tenemos un modo de protección para aros", "i tambien tenemos un modo de proteksion para aros", False),
    ("y mejoras en el asistente de parque automático,", "i mejoras en el asistente de parke automatiko", False),
    ("salida de parqueo y también reverse automática.", "salida de parkeo i tambien rivers automatika", True),
    ("El vehículo cuenta con toda esta tecnología,", "el veikulo kuenta kon toda esta teknolojia", False),
    ("tiene una cámara de [360] grados,", "tiene una kamara de tresientos sesenta grados", False),
    ("la cual puede leer el territorio delantero y ya guardarlo,", "la kual puede leer el teritorio delantero i ia guardarlo", False),
    ("y así se va presentando la parte inferior.", "i asi se va presentando la parte inferior", True),
    ("Esto funciona con el modo [modo] principalmente.", "esto funsiona kon el modo xxxxx prinsipalmente", True),
    ("Lo mejor es que lo puedan venir a probar aquí en Auto Mayella", "lo mejor es ke lo puedan venir a probar aki en auto maiella", False),
    ("y se la puedan llevar.", "i se la puedan ievar", True),
]


def syllables(s):
    s = s.replace("xxxxx", "xa xa xa")       # palabra no clara ≈ 3 sílabas
    return len(re.findall(r"[aeiouáéíóú]+", s))


def pauses(audio):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, "<i2").astype(np.float32) / 32768
    hop, win = 160, 512
    n = (len(a) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    sp = np.abs(np.fft.rfft(a[idx] * np.hanning(win), axis=1)) ** 2
    f = np.fft.rfftfreq(win, 1 / 16000)
    v = 10 * np.log10(sp[:, (f > 250) & (f < 3500)].sum(1) + 1e-10)
    v = np.convolve(v, np.ones(5) / 5, "same")
    from numpy.lib.stride_tricks import sliding_window_view as swv
    lm = np.max(swv(np.pad(v, 75, mode="edge"), 151), axis=1)
    q = (v - lm) < -14
    d = np.diff(np.r_[0, q.astype(int), 0])
    st, en = np.where(d == 1)[0], np.where(d == -1)[0]
    gaps = [((s + e) / 2 * 0.01, (e - s) * 0.01) for s, e in zip(st, en) if e - s >= 10]
    speech = np.where(~q)[0]
    return gaps, speech[0] * 0.01, speech[-1] * 0.01, len(a) / 16000


def align(gaps, start, end):
    syl = np.array([syllables(p[1]) for p in PHRASES], float)
    ends_sentence = [p[2] for p in PHRASES]
    cand = [(start, 0.0)] + [g for g in gaps if start + 0.5 < g[0] < end - 0.3] + [(end, 0.0)]
    times = np.array([c[0] for c in cand])
    glen = np.array([c[1] for c in cand])
    N, M = len(PHRASES), len(cand)
    rate = syl.sum() / (end - start)
    for _ in range(4):                         # reestima la velocidad con el propio alineamiento
        INF = 1e18
        cost = np.full((N + 1, M), INF)
        back = np.zeros((N + 1, M), int)
        cost[0, 0] = 0
        for i in range(1, N + 1):
            exp_d = syl[i - 1] / rate
            for j in range(1, M):
                if i == N and j != M - 1:
                    continue
                prev = cost[i - 1, :j]
                dur = times[j] - times[:j] - glen[:j] / 2 - glen[j] / 2
                c = prev + (dur - exp_d) ** 2 / max(exp_d, 0.4)
                # las pausas largas favorecen finales de oración, y penalizan cortes a media frase
                bonus = (-1.2 if ends_sentence[i - 1] else -0.4) * min(glen[j], 0.5) if j < M - 1 else 0
                k = int(np.argmin(c))
                cost[i, j] = c[k] + bonus
                back[i, j] = k
        path = [M - 1]
        for i in range(N, 0, -1):
            path.append(back[i, path[-1]])
        path = path[::-1]
        bounds = times[path]
        rate = syl.sum() / (end - start - sum(glen[path[1:-1]]))
    out = []
    for i, (txt, _, sent) in enumerate(PHRASES):
        out.append(dict(text=txt, start=round(float(bounds[i] + glen[path[i]] / 2), 2),
                        end=round(float(bounds[i + 1] - glen[path[i + 1]] / 2), 2), syllables=int(syl[i]),
                        sentence_end=sent))
    return out, rate


def main():
    gaps, start, end, dur = pauses(AUDIO)
    res, rate = align(gaps, start, end)
    (ROOT / "transcript").mkdir(exist_ok=True)
    json.dump(dict(duration=dur, speech_start=start, speech_end=end, syllables_per_s=round(rate, 2), phrases=res),
              open(ROOT / "transcript/alignment.json", "w"), ensure_ascii=False, indent=1)
    print(f"voz {start:.2f}–{end:.2f} s · {rate:.2f} sílabas/s")
    for r in res:
        print(f"{r['start']:6.2f}–{r['end']:6.2f}  ({r['syllables']:2d} síl, {r['syllables']/max(r['end']-r['start'],.1):4.1f}/s)  {r['text']}")


if __name__ == "__main__":
    sys.exit(main())
