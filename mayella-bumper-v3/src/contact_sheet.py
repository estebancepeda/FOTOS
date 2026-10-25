"""Hoja de contacto con los doce tiempos del storyboard (+ comparación con el aprobado).

Horizontal: 4 × 3 viñetas 16:9. Vertical: 6 × 2 viñetas 9:16.
La comparación usa siempre la escala de las viñetas del storyboard (recorte
central 1350 × 1080 px); en vertical, las franjas fuera del cuadro 1080 de
ancho se marcan en gris oscuro.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from timeline import FPS, FORMAT, H, STORY, SUFFIX, W

ROOT = Path(__file__).resolve().parent.parent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
OUT_NAME = "hoja_de_contacto" + SUFFIX + ".png"
COMP_NAME = "comparacion_storyboard" + SUFFIX + ".png"


def labels(dr, x, y, cw, head, fi, label, f1, f2):
    dr.rectangle([x, y, x + cw, y + head], fill=(16, 19, 26))
    dr.text((x + 10, y + 6), f"f{fi:03d} · {fi / FPS:.3f} s", fill=(235, 235, 235), font=f1)
    dr.text((x + 10, y + 34), label, fill=(120, 200, 240), font=f2)


def storyboard_scale_crop(frame):
    """Recorte central 1350×1080 (escala de las viñetas del storyboard)."""
    cx, cy = W // 2, H // 2
    box = (cx - 675, cy - 540, cx + 675, cy + 540)
    crop = frame.crop(box)                       # fuera del cuadro queda negro
    if box[0] < 0:                               # marca lo que queda fuera del cuadro vertical
        dr = ImageDraw.Draw(crop)
        pad = -box[0]
        dr.rectangle([0, 0, pad - 1, 1080], fill=(28, 30, 36))
        dr.rectangle([1350 - pad, 0, 1350, 1080], fill=(28, 30, 36))
    return crop


def main(frames_dir=ROOT / f"contact/frames{SUFFIX}", out=ROOT / "contact" / OUT_NAME):
    f1 = ImageFont.truetype(FONT, 26)
    f2 = ImageFont.truetype(FONT, 19)
    head = 58
    if FORMAT == "h":
        cw, ch, cols = 640, 360, 4
    else:
        cw, ch, cols = 304, 540, 6
    rows = (len(STORY) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw + (cols + 1) * 8, rows * (ch + head) + 70 + rows * 8), (6, 8, 12))
    dr = ImageDraw.Draw(sheet)
    dr.text((16, 12), "HOJA DE CONTACTO · MERCEDES-BENZ 140 AÑOS → MAYELLA · v3", fill=(235, 235, 235), font=f1)
    dr.text((16, 44), f"Render real {W}×{H} · 30 fps · refracción por desplazamiento",
            fill=(150, 160, 170), font=f2)
    for i, (fi, label) in enumerate(STORY):
        x = 8 + (i % cols) * (cw + 8)
        y = 70 + (i // cols) * (ch + head + 8)
        labels(dr, x, y, cw, head, fi, label, ImageFont.truetype(FONT, 24 if cw < 400 else 26), f2)
        im = Image.open(Path(frames_dir) / f"f{fi:03d}.png").convert("RGB").resize((cw, ch), Image.LANCZOS)
        sheet.paste(im, (x, y + head))
    sheet.save(out)

    # Comparación con el storyboard a la misma escala y disposición (4 × 3)
    cw, ch, cols = 640, 360, 4
    comp_sheet = Image.new("RGB", (cols * cw + (cols + 1) * 8, 3 * (ch + head) + 70 + 3 * 8), (6, 8, 12))
    dr = ImageDraw.Draw(comp_sheet)
    dr.text((16, 12), f"RENDER {W}×{H} · mismo encuadre que el storyboard (recorte central 1350×1080)",
            fill=(235, 235, 235), font=f1)
    if FORMAT == "v":
        dr.text((16, 44), "gris oscuro = fuera del cuadro vertical", fill=(150, 160, 170), font=f2)
    iw = ch * 1350 // 1080
    for i, (fi, label) in enumerate(STORY):
        x = 8 + (i % cols) * (cw + 8)
        y = 70 + (i // cols) * (ch + head + 8)
        labels(dr, x, y, cw, head, fi, label, f1, f2)
        im = storyboard_scale_crop(Image.open(Path(frames_dir) / f"f{fi:03d}.png").convert("RGB"))
        comp_sheet.paste(im.resize((iw, ch), Image.LANCZOS), (x + (cw - iw) // 2, y + head))
    story = Image.open(ROOT / "assets/source/storyboard_aprobado.png").convert("RGB")
    story = story.resize((comp_sheet.width, int(story.height * comp_sheet.width / story.width)), Image.LANCZOS)
    comp = Image.new("RGB", (comp_sheet.width, story.height + comp_sheet.height), (0, 0, 0))
    comp.paste(story, (0, 0))
    comp.paste(comp_sheet, (0, story.height))
    comp.save(Path(out).with_name(COMP_NAME))
    print("ok", out)


if __name__ == "__main__":
    main(*sys.argv[1:])
