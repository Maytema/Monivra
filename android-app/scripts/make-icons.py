"""Builds the Android launcher, splash and notification icons from the supplied artwork in
../icon-source and ../icon-png (adaptive foreground, monochrome, white-background icon).
Run by hand when the artwork changes; the results are committed under overlay/."""
import os, sys
from PIL import Image

SRC = sys.argv[1]  # folder with the supplied PNGs
OUT = os.path.join(os.path.dirname(__file__), "..", "overlay", "app", "src", "main", "res")

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)

fg = Image.open(os.path.join(SRC, "monivra_adaptive_foreground_432.png")).convert("RGBA")
mono = Image.open(os.path.join(SRC, "monivra_monochrome_432.png")).convert("RGBA")
white = Image.open(os.path.join(SRC, "monivra_icon_white.png")).convert("RGB")
symbol = Image.open(os.path.join(SRC, "monivra_symbol.png")).convert("RGBA")

# Adaptive layers are 108 dp; legacy icons 48 dp.
for name, scale in [("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)]:
    layer = round(108 * scale)
    save(fg.resize((layer, layer), Image.LANCZOS), f"{OUT}/mipmap-{name}/ic_launcher_foreground.png")
    save(mono.resize((layer, layer), Image.LANCZOS), f"{OUT}/mipmap-{name}/ic_launcher_monochrome.png")
    legacy = round(48 * scale)
    icon = white.resize((legacy, legacy), Image.LANCZOS)
    save(icon, f"{OUT}/mipmap-{name}/ic_launcher.png")
    # The round legacy icon: the same picture cut to a circle.
    mask = Image.new("L", (legacy * 4, legacy * 4), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, legacy * 4 - 1, legacy * 4 - 1), fill=255)
    mask = mask.resize((legacy, legacy), Image.LANCZOS)
    round_icon = icon.convert("RGBA")
    round_icon.putalpha(mask)
    save(round_icon, f"{OUT}/mipmap-{name}/ic_launcher_round.png")

# Splash icon of Android 12+: 288 dp canvas, the picture inside the central 192 dp circle.
canvas = Image.new("RGBA", (576, 576), (0, 0, 0, 0))
mark = symbol.resize((300, 300), Image.LANCZOS)
canvas.paste(mark, (138, 138), mark)
save(canvas, f"{OUT}/drawable-nodpi/ic_splash_symbol.png")

# Status bar icon of notifications: white shape on transparent, 24 dp.
alpha = mono.split()[3]
for name, px in [("mdpi", 24), ("hdpi", 36), ("xhdpi", 48), ("xxhdpi", 72), ("xxxhdpi", 96)]:
    small = alpha.resize((px, px), Image.LANCZOS)
    icon = Image.new("RGBA", (px, px), (255, 255, 255, 0))
    icon.putalpha(small)
    save(icon, f"{OUT}/drawable-{name}/ic_stat_monivra.png")
print("icons written")
