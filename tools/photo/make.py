"""Prepares a page image: `make photo SRC=<path to the source image>`.

The source is any image Pillow reads (a JPEG, a PNG). Run on the Mac with Pillow installed; CI never runs it.
The source is never committed (a photo carries the camera model and the date taken). Every output is a greyscale
JPEG with no metadata, and every output gets the contrast step: the darkest point goes to black, the lightest to
white. src/photo-metadata.test.ts checks each committed image.

The About me portrait, with no --out: crops the source to head and shoulders, darkens the background toward the
edges so the face is the brightest part (the vignette, the portrait's only), scales it to 600 px tall and writes
src/assets/adham.jpg at quality 78.

    python3 tools/photo/make.py <source> [--preview <preview.png>]

Any other image, with --out: writes src/assets/<out>, which is a bare file name ending in .jpg. --width and --cap
are then required. No vignette. The image is never scaled up: it is scaled down only if it is wider than --width.
The quality starts at 78 and goes down by one until the file is within --cap; the tool fails, writing nothing, if
that takes it below 50.

    python3 tools/photo/make.py <source> --out <name.jpg> --width <px> --cap <KB> [--crop left,top,right,bottom] [--preview <preview.png>]

--crop is a box in the source's pixels (after its camera rotation is applied), and only that part is kept.
--preview also writes a phosphor-green copy with scanlines, for looking at the result (not committed).
"""
import argparse
import io
import math
import os
import sys
from PIL import Image, ImageChops, ImageOps

CROP = (330, 230, 1110, 1205)  # left, top, right, bottom in source pixels: 780 x 975
HEIGHT = 600
FACE = (0.50, 0.40)  # where the vignette is centred, as fractions of the crop (the face)
ASSETS = os.path.join(os.path.dirname(__file__), "..", "..", "src", "assets")
OUT = os.path.join(ASSETS, "adham.jpg")
QUALITY = 78  # where every image starts
MIN_QUALITY = 50  # below this, an image that is still over its cap fails


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


def prepare_other(src: str, crop, width: int) -> Image.Image:
    """Any other page image: optional crop, greyscale, scaled down to at most `width` wide, contrast stretched."""
    im = ImageOps.exif_transpose(Image.open(src))  # apply the camera's rotation before the tags are dropped
    if crop:
        left, top, right, bottom = crop
        if not (0 <= left < right <= im.width and 0 <= top < bottom <= im.height):
            sys.exit(f"--crop {left},{top},{right},{bottom} is not inside the source, which is {im.width}x{im.height}")
        im = im.crop(crop)
    im = im.convert("L")
    if im.width > width:  # never scaled up
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    return ImageOps.autocontrast(im, cutoff=0)


def encode_within(im: Image.Image, cap: int) -> tuple:
    """The JPEG at the highest quality, from 78 down to 50, that is at most `cap` bytes. Exits if there is none."""
    for quality in range(QUALITY, MIN_QUALITY - 1, -1):
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=quality, optimize=True, progressive=False, subsampling=0)
        if buf.tell() <= cap:
            return buf.getvalue(), quality
    sys.exit(f"cannot get {im.width}x{im.height} within {cap} bytes by quality {MIN_QUALITY}: it is {buf.tell()} bytes there. "
             "Raise the cap, lower --width or crop it smaller. Nothing was written.")


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
    p.add_argument("--out", help="the file name to write in src/assets/; with none, the About me portrait is made")
    p.add_argument("--crop", help="left,top,right,bottom in source pixels (with --out)")
    p.add_argument("--width", type=int, help="the largest width in px (with --out)")
    p.add_argument("--cap", type=float, help="the size cap in KB (with --out)")
    args = p.parse_args()
    if args.out is None:
        if args.crop or args.width or args.cap:
            p.error("--crop, --width and --cap go with --out: the portrait has its own")
        im = prepare(args.source)
        # Pillow writes no EXIF, XMP, IPTC or comment unless given one. It does write a JFIF header (APP0).
        im.save(OUT, "JPEG", quality=QUALITY, optimize=True, progressive=False, subsampling=0)
        if args.preview:
            preview(im).save(args.preview)
        print(f"{os.path.normpath(OUT)}: {im.width}x{im.height}, {os.path.getsize(OUT)} bytes")
        return
    if os.path.basename(args.out) != args.out or not args.out.lower().endswith(".jpg"):
        p.error("--out is a bare file name ending in .jpg: it is written in src/assets/")
    if args.out == "adham.jpg":
        p.error("--out adham.jpg is the portrait's file: leave --out off to make the portrait")
    if not args.width or args.width < 1 or not args.cap or args.cap <= 0:
        p.error("--out needs --width (px) and --cap (KB), both above 0")
    crop = None
    if args.crop:
        try:
            crop = tuple(int(v) for v in args.crop.split(","))
        except ValueError:
            crop = ()
        if len(crop) != 4:
            p.error("--crop is four whole numbers: left,top,right,bottom")
    im = prepare_other(args.source, crop, args.width)
    data, quality = encode_within(im, round(args.cap * 1024))
    path = os.path.join(ASSETS, args.out)
    with open(path, "wb") as f:
        f.write(data)
    if args.preview:
        preview(im).save(args.preview)
    print(f"{os.path.normpath(path)}: {im.width}x{im.height}, {len(data)} bytes, quality {quality}")


main()
