"""Hoja de contacto del reel: cuadros de preview/story_<t>.png en una cuadrícula.

Uso: python3 contact.py salida.png t1 t2 …   [--guias]
--guias dibuja el centro bajado 10 % (y = 1152) y las zonas que tapa la interfaz de Reels
(franja inferior ~20 % y columna de botones a la derecha), solo como referencia.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    guides = "--guias" in sys.argv
    out, times = args[0], args[1:]
    cw, ch, cols = 270, 480, 7
    rows = (len(times) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cw + 8) + 8, rows * (ch + 36) + 8), (24, 26, 30))
    f = ImageFont.truetype(FONT, 18)
    for k, t in enumerate(times):
        im = Image.open(ROOT / f"preview/story_{float(t):.2f}.png").convert("RGB").resize((cw, ch), Image.LANCZOS)
        d = ImageDraw.Draw(im, "RGBA")
        if guides:
            y = 1152 * ch / 1920
            d.line([(0, y), (cw, y)], fill=(255, 60, 60, 110))
            d.rectangle([0, ch * 0.80, cw, ch], fill=(255, 60, 60, 28))
            d.rectangle([cw * 0.88, ch * 0.55, cw, ch * 0.80], fill=(255, 60, 60, 28))
        x = 8 + (k % cols) * (cw + 8)
        y0 = 8 + (k // cols) * (ch + 36)
        ImageDraw.Draw(sheet).text((x, y0), f"{float(t):.2f} s", fill=(230, 230, 230), font=f)
        sheet.paste(im, (x, y0 + 26))
    sheet.save(out)
    print("ok", out)


if __name__ == "__main__":
    main()
