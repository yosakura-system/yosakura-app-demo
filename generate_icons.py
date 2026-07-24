# -*- coding: utf-8 -*-
"""世桜アプリ ブランドアイコン生成（PWA用）。
世桜の正式ロゴの枝モチーフ(icons/ogp.jpg)から正方形アイコンを生成。
STYLE で 'faithful'(生成り地×墨・元ロゴ忠実) / 'suou'(蘇芳地×白・アプリ統一) を切替。"""
import os
from PIL import Image, ImageDraw, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, 'icons')
SRC  = os.path.join(OUT, 'ogp.jpg')

STYLE = 'suou'   # 'faithful'(生成り地×墨) or 'suou'(蘇芳地×白枝・小サイズでも視認性高)

SUOU=(142,53,74); WHITE=(255,255,255); KINARI=(247,244,239); SUMI=(22,22,22)
BG, FG = (KINARI, SUMI) if STYLE == 'faithful' else (SUOU, WHITE)

# --- 枝モチーフの輪郭を検出して切り出し、アルファ(筆のかすれ込み)を作る ---
src = Image.open(SRC).convert('RGB')
g = src.convert('L')
bbox = g.point(lambda v: 255 if v < 235 else 0).getbbox()
x0, y0, x1, y1 = bbox
pad = int(max(x1 - x0, y1 - y0) * 0.05)
box = (max(0, x0 - pad), max(0, y0 - pad), min(src.width, x1 + pad), min(src.height, y1 + pad))
alpha = g.crop(box).point(lambda v: 255 - v)   # 黒→不透明 / 白→透明

def draw(size, bleed=False, safe=0.90, radius=0.22):
    SS = 2
    S = size * SS
    canvas = Image.new('RGBA', (S, S), BG + (255,))
    aw, ah = alpha.size
    target = int(S * safe)
    sc = min(target / aw, target / ah)
    nw, nh = max(1, int(aw * sc)), max(1, int(ah * sc))
    a = alpha.resize((nw, nh), Image.LANCZOS)
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.paste(Image.new('RGBA', (nw, nh), FG + (255,)), ((S - nw) // 2, (S - nh) // 2), a)
    canvas = Image.alpha_composite(canvas, layer)
    if not bleed:
        m = Image.new('L', (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=255)
        canvas.putalpha(ImageChops.multiply(canvas.split()[3], m))
    return canvas.resize((size, size), Image.LANCZOS)

jobs = [
    ('icon-192.png',          dict(size=192, bleed=False, safe=0.90)),
    ('icon-512.png',          dict(size=512, bleed=False, safe=0.90)),
    ('icon-512-maskable.png', dict(size=512, bleed=True,  safe=0.70)),
    ('apple-touch-icon.png',  dict(size=180, bleed=True,  safe=0.80)),
    ('favicon-32.png',        dict(size=32,  bleed=False, safe=0.92)),
]
for name, kw in jobs:
    draw(**kw).save(os.path.join(OUT, name))
    print('saved', name)
print('done ->', OUT, '(STYLE=%s)' % STYLE)
