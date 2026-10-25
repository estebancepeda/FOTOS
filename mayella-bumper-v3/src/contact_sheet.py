"""Hoja de contacto con los doce tiempos del storyboard (+ comparación con el aprobado)."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from timeline import FPS, STORY

ROOT = Path(__file__).resolve().parent.parent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def main(frames_dir=ROOT / "contact/frames", out=ROOT / "contact/hoja_de_contacto.png"):
    cw, ch, head = 640, 360, 58
    cols, rows = 4, 3
    sheet = Image.new("RGB", (cols * cw + (cols + 1) * 8, rows * (ch + head) + 70 + rows * 8), (6, 8, 12))
    dr = ImageDraw.Draw(sheet)
    f1 = ImageFont.truetype(FONT, 26)
    f2 = ImageFont.truetype(FONT, 19)
    dr.text((16, 12), "HOJA DE CONTACTO · MERCEDES-BENZ 140 AÑOS → MAYELLA · v3", fill=(235, 235, 235), font=f1)
    dr.text((16, 44), "Render real 1920×1080 · 30 fps · refracción por desplazamiento", fill=(150, 160, 170), font=f2)
    for i, (fi, label) in enumerate(STORY):
        x = 8 + (i % cols) * (cw + 8)
        y = 70 + (i // cols) * (ch + head + 8)
        dr.rectangle([x, y, x + cw, y + head], fill=(16, 19, 26))
        dr.text((x + 10, y + 6), f"f{fi:03d} · {fi / FPS:.3f} s", fill=(235, 235, 235), font=f1)
        dr.text((x + 10, y + 34), label, fill=(120, 200, 240), font=f2)
        im = Image.open(Path(frames_dir) / f"f{fi:03d}.png").convert("RGB").resize((cw, ch), Image.LANCZOS)
        sheet.paste(im, (x, y + head))
    sheet.save(out)
    story = Image.open(ROOT / "assets/source/storyboard_aprobado.png").convert("RGB")
    story = story.resize((sheet.width, int(story.height * sheet.width / story.width)), Image.LANCZOS)
    comp = Image.new("RGB", (sheet.width, story.height + sheet.height), (0, 0, 0))
    comp.paste(story, (0, 0))
    comp.paste(sheet, (0, story.height))
    comp.save(Path(out).with_name("comparacion_storyboard.png"))
    print("ok", out)


if __name__ == "__main__":
    main(*sys.argv[1:])
