"""Builds the Android launcher, splash and notification icons from the approved artwork
(icon-source/monivra_symbol_approved.png: the mark on transparent, taken from the approved
MONIVRA_APP_ICON_1024.png in icon-source/approved/). Run by hand when the artwork changes; the results
are committed under overlay/. The mark is a raster, not a vector."""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "..", "icon-source")
OUT = os.path.join(HERE, "..", "overlay", "app", "src", "main", "res")
symbol = Image.open(os.path.join(SRC, "monivra_symbol_approved.png")).convert("RGBA")  # 1024 px, mark centred
RADIUS = 352  # the farthest point of the mark from the centre, in pixels of that 1024 px picture


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


def mark(size, reach):
    """The mark on a transparent square `size` px, its farthest point at `reach` of the half size."""
    scale = reach * size / 2 / RADIUS
    side = round(1024 * scale)
    return symbol.resize((side, side), Image.LANCZOS), side


def centred(size, reach, background=(0, 0, 0, 0)):
    canvas = Image.new("RGBA", (size, size), background)
    m, side = mark(size, reach)
    canvas.alpha_composite(m, ((size - side) // 2, (size - side) // 2))
    return canvas


def silhouette(img):
    """Same shape in one colour (black): what themed icons and status bars use."""
    flat = Image.new("RGBA", img.size, (0, 0, 0, 0))
    flat.putalpha(img.split()[3])
    return flat


# Adaptive layers are 108 dp and the system shows a circle of 66 dp in the middle at the least:
# the whole mark stays inside it (reach 66/108).
SAFE = 66 / 108
for name, scale in [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)]:
    layer = round(108 * scale)
    fg = centred(layer, SAFE)
    save(fg, f"{OUT}/mipmap-{name}/ic_launcher_foreground.png")
    save(silhouette(fg), f"{OUT}/mipmap-{name}/ic_launcher_monochrome.png")
    # Legacy icons (before Android 8): the white tile with the mark, 48 dp; the round one is cut to a circle.
    legacy = round(48 * scale)
    tile = centred(legacy * 4, 0.72, (255, 255, 255, 255)).resize((legacy, legacy), Image.LANCZOS)
    save(tile.convert("RGB"), f"{OUT}/mipmap-{name}/ic_launcher.png")
    mask = Image.new("L", (legacy * 4, legacy * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, legacy * 4 - 1, legacy * 4 - 1), fill=255)
    round_icon = tile.copy()
    round_icon.putalpha(mask.resize((legacy, legacy), Image.LANCZOS))
    save(round_icon, f"{OUT}/mipmap-{name}/ic_launcher_round.png")

# Splash icon of Android 12+: 288 dp canvas (x2), the mark inside the central 192 dp circle.
save(centred(576, 192 / 288 * 0.96), f"{OUT}/drawable-nodpi/ic_splash_symbol.png")

# Status bar icon of notifications: one colour, transparent, 24 dp, the mark filling the 20 dp area.
for name, px in [("mdpi", 24), ("hdpi", 36), ("xhdpi", 48), ("xxhdpi", 72), ("xxxhdpi", 96)]:
    big = centred(px * 8, 1.0)
    box = big.getbbox()
    shape = silhouette(big.crop(box))
    side = round(px * 20 / 24)
    shape.thumbnail((side, side), Image.LANCZOS)
    icon = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    icon.alpha_composite(shape, ((px - shape.width) // 2, (px - shape.height) // 2))
    # White: the system tints it (the colour of the file is ignored by many versions, white is safe).
    white = Image.new("RGBA", icon.size, (255, 255, 255, 0))
    white.putalpha(icon.split()[3])
    save(white, f"{OUT}/drawable-{name}/ic_stat_monivra.png")

# Large icon of notifications (full colour, where the system shows one): the launcher tile.
save(centred(192, 0.72, (255, 255, 255, 255)).convert("RGB"), f"{OUT}/drawable-nodpi/ic_notification_large.png")
print("icons written")
