# -*- coding: utf-8 -*-
"""正式ロゴ(icons/logo_01.png)を、白い面で墨だけが浮かび上がる透過PNG(icons/logo-full.png)に変換。
元画像が「白地」でも「透過地」でも正しく処理：
  最終アルファ = 墨の濃さ(255-輝度) × 元のアルファ
これで白＝透明・透過＝透明・墨＝不透明 になる。"""
import os
from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.join(HERE, 'icons')
SRC = os.path.join(ICONS, 'logo_01.png')
DST = os.path.join(ICONS, 'logo-full.png')

INK = (26, 24, 23)   # 濃い墨

im = Image.open(SRC).convert('RGBA')
dark = im.convert('L').point(lambda v: 255 - v)      # 墨の濃さ（白=0, 黒=255）
existing = im.getchannel('A')                        # 元の透明度
alpha = ImageChops.multiply(dark, existing)          # どちらも不透明な墨部分だけ残る

bbox = alpha.point(lambda v: 255 if v > 18 else 0).getbbox()
x0, y0, x1, y1 = bbox
pad = int(max(x1 - x0, y1 - y0) * 0.03)
box = (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))
a = alpha.crop(box)

out = Image.new('RGBA', a.size, (0, 0, 0, 0))
out.paste(Image.new('RGBA', a.size, INK + (255,)), (0, 0), a)
out.save(DST)
print('saved', DST, out.size)
