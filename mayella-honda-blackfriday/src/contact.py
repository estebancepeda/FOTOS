"""Hoja de contacto de preview/comp_<t>.png con guías: márgenes libres (15 % arriba, 25 % abajo,
12 % laterales), centro óptico de títulos (59 %) y altura de la firma (19 %).

Uso: python3 contact.py salida.png t1 t2 … [--sin-guias]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    guides = "--sin-guias" not in sys.argv
    out, times = args[0], args[1:]
    cw, ch, cols = 300, 533, 7
    rows = (len(times) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cw + 8) + 8, rows * (ch + 34) + 8), (24, 26, 30))
    f = ImageFont.truetype(FONT, 18)
    for k, t in enumerate(times):
        im = Image.open(ROOT / f"preview/comp_{float(t):.3f}.png").convert("RGB").resize((cw, ch), Image.LANCZOS)
        if guides:
            d = ImageDraw.Draw(im, "RGBA")
            d.rectangle([0, 0, cw, ch * 0.15], fill=(255, 60, 60, 40))
            d.rectangle([0, ch * 0.75, cw, ch], fill=(255, 60, 60, 40))
            d.rectangle([0, 0, cw * 0.12, ch], fill=(255, 60, 60, 28))
            d.rectangle([cw * 0.88, 0, cw, ch], fill=(255, 60, 60, 28))
            d.line([(0, ch * 0.59), (cw, ch * 0.59)], fill=(80, 255, 120, 120))
        x = 8 + (k % cols) * (cw + 8)
        y = 8 + (k // cols) * (ch + 34)
        ImageDraw.Draw(sheet).text((x, y), f"{float(t):.2f} s  f{round(float(t) * 24)}", fill=(230, 230, 230), font=f)
        sheet.paste(im, (x, y + 26))
    sheet.save(out)
    print("ok", out)


if __name__ == "__main__":
    main()
