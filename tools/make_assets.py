# -*- coding: utf-8 -*-
"""Generate tab bar icons and the share cover for the mini program.

Run with Pillow installed:
    python tools/make_assets.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TAB = ROOT / "miniprogram" / "images" / "tab"
IMG = ROOT / "miniprogram" / "images"
TAB.mkdir(parents=True, exist_ok=True)
IMG.mkdir(parents=True, exist_ok=True)

GREY = (128, 138, 153, 255)
BLUE = (47, 111, 221, 255)
S = 4          # supersampling
SIZE = 81      # final tab icon size
W = SIZE * S


def canvas():
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def save(im, name):
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(TAB / name)


def overview(color):
    im, d = canvas()
    lw = 5 * S
    pad = 17 * S
    gap = 7 * S
    cell = (W - pad * 2 - gap) // 2
    for x, y in [(pad, pad), (pad + cell + gap, pad), (pad, pad + cell + gap), (pad + cell + gap, pad + cell + gap)]:
        d.rounded_rectangle([x, y, x + cell, y + cell], radius=6 * S, outline=color, width=lw)
    return im


def flow(color):
    im, d = canvas()
    lw = 6 * S
    d.line([(16 * S, 20 * S), (16 * S, 64 * S), (66 * S, 64 * S)], fill=color, width=lw, joint="curve")
    d.line([(23 * S, 51 * S), (37 * S, 37 * S), (48 * S, 45 * S), (64 * S, 23 * S)], fill=color, width=lw, joint="curve")
    d.ellipse([60 * S, 19 * S, 68 * S, 27 * S], fill=color)
    return im


def futures(color):
    im, d = canvas()
    lw = 6 * S
    for y in (22, 40, 58):
        d.line([(15 * S, y * S), (66 * S, y * S)], fill=color, width=lw)
    for x, y in [(28, 22), (50, 40), (36, 58)]:
        d.ellipse([(x - 4) * S, (y - 4) * S, (x + 4) * S, (y + 4) * S], fill=color)
    return im


def profile(color):
    im, d = canvas()
    lw = 6 * S
    d.ellipse([30 * S, 15 * S, 51 * S, 36 * S], outline=color, width=lw)
    d.arc([17 * S, 40 * S, 64 * S, 78 * S], start=195, end=345, fill=color, width=lw)
    return im


ICONS = {"overview": overview, "flow": flow, "futures": futures, "profile": profile}
for name, fn in ICONS.items():
    save(fn(GREY), f"{name}.png")
    save(fn(BLUE), f"{name}-active.png")

# ---- share cover 5:4 ----
cover = Image.new("RGB", (1000, 800), (11, 17, 28))
d = ImageDraw.Draw(cover)
for y in range(800):
    t = y / 800
    c = (int(11 + 15 * t), int(17 + 27 * t), int(28 + 46 * t))
    d.line([(0, y), (1000, y)], fill=c)
# soft radial brand glow
glow = Image.new("RGBA", (1000, 800), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for r in range(420, 0, -8):
    a = int(46 * (1 - r / 420) ** 2)
    gd.ellipse([820 - r, 90 - r, 820 + r, 90 + r], fill=(47, 111, 221, a))
cover = Image.alpha_composite(cover.convert("RGBA"), glow)
d = ImageDraw.Draw(cover)
d.line([(72, 700), (928, 700)], fill=(255, 255, 255, 26), width=2)
d.line([(72, 92), (176, 92)], fill=(90, 145, 240), width=6)
d.ellipse([64, 84, 80, 100], fill=(90, 145, 240))

font_paths = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
]
font_big = font_small = None
for fp in font_paths:
    try:
        font_big = ImageFont.truetype(fp, 64)
        font_small = ImageFont.truetype(fp, 30)
        font_tiny = ImageFont.truetype(fp, 24)
        break
    except Exception:
        continue
if font_big is None:
    font_big = ImageFont.load_default()
    font_small = font_big
    font_tiny = font_big

d.text((72, 128), "国家队 ETF", font=font_big, fill=(238, 245, 255))
d.text((72, 216), "动向追踪", font=font_big, fill=(238, 245, 255))
d.text((74, 324), "16 只宽基 ETF · 份额 / 净申赎 / 期指净空头", font=font_small, fill=(150, 172, 203))
d.text((74, 382), "每日 23:00 更新 · 仅供研究参考", font=font_tiny, fill=(112, 132, 160))

# mini bar sparkline
bars = [38, 62, 44, 88, 70, 120, 96, 140, 110, 74, 92, 58]
x = 74
for i, h in enumerate(bars):
    color = (211, 74, 69) if i % 4 != 3 else (24, 138, 98)
    d.rounded_rectangle([x, 610 - h, x + 34, 610], radius=6, fill=color)
    x += 50
d.text((74, 636), "资金流 · 组合规模 · 期货对冲", font=font_tiny, fill=(120, 142, 170))
cover.convert("RGB").save(IMG / "share-cover.png", quality=92)
print("assets written to", IMG)
