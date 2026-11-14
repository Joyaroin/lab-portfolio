"""Prepares the About me photo: `make photo SRC=<path to the source JPEG>`.

Crops the source to head and shoulders, turns it greyscale, darkens the background toward the edges so the
face is the brightest part, scales it to 600 px tall and writes src/assets/adham.jpg with no metadata
(the source carries the camera model and the date taken). Run on the Mac with Pillow installed; CI never runs it.
The source is never committed. src/photo-metadata.test.ts checks the committed JPEG.

    python3 tools/photo/make.py <source.jpg> [--preview <preview.png>]

--preview also writes a phosphor-green copy with scanlines, for looking at the result (not committed).
"""
import argparse
import math
import os
from PIL import Image, ImageChops, ImageOps

CROP = (330, 230, 1110, 1205)  # left, top, right, bottom in source pixels: 780 x 975
HEIGHT = 600
FACE = (0.50, 0.40)  # where the vignette is centred, as fractions of the crop (the face)
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets", "adham.jpg")


def vignette(w: int, h: int) -> Image.Image:
    """A mask: 255 where the face is, falling to 30 (12%) at the edges."""
    data = []
    for yy in range(h):
        for xx in range(w):
            d = math.hypot((xx / w - FACE[0]) / 0.52, (yy / h - FACE[1]) / 0.60)  # 1 at the vignette's edge
            k = min(max((d - 0.45) / 0.75, 0.0), 1.0)
            k = k * k * (3 - 2 * k)  # smoothstep: the face stays untouched
            data.append(round(255 * (1 - 0.88 * k)))
    mask = Image.new("L", (w, h))
    mask.putdata(data)
    return mask


def prepare(src: str) -> Image.Image:
    im = ImageOps.exif_transpose(Image.open(src))  # apply the camera's rotation before the tags are dropped
    im = im.crop(CROP).convert("L")
    im = im.resize((round(im.width * HEIGHT / im.height), HEIGHT), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=0)
    return ImageChops.multiply(im, vignette(im.width, im.height))


def preview(im: Image.Image) -> Image.Image:
    """The photo as the About page will show it: phosphor green, with scanlines."""
    lines = Image.new("L", im.size, 255)
    lines.paste(179, (0, 0, im.width, im.height), Image.frombytes("L", (1, im.height), bytes(0 if y % 3 else 255 for y in range(im.height))).resize(im.size))
    im = ImageChops.multiply(im, lines)
    return Image.merge("RGB", (im.point(lambda v: v * 0.15), im, im.point(lambda v: v * 0.35)))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("source")
    p.add_argument("--preview")
    args = p.parse_args()
    im = prepare(args.source)
    # Pillow writes no EXIF, XMP, IPTC or comment unless given one. It does write a JFIF header (APP0).
    im.save(OUT, "JPEG", quality=78, optimize=True, progressive=False, subsampling=0)
    if args.preview:
        preview(im).save(args.preview)
    print(f"{os.path.normpath(OUT)}: {im.width}x{im.height}, {os.path.getsize(OUT)} bytes")


main()
