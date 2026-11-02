"""Convert a generated 'pixel-art style' portrait into a true pixel sprite.
usage: python3 tools/convert_portrait.py in.png out.png target_width [colours]
- keys out the flat background by flood fill from the borders
- downsamples to the target width (box filter, then sharpened)
- quantises to a limited palette with no dithering
- adds a 1px dark outline"""
import sys
from PIL import Image, ImageFilter, ImageDraw
src, out, tw = sys.argv[1], sys.argv[2], int(sys.argv[3])
ncol = int(sys.argv[4]) if len(sys.argv) > 4 else 40
im = Image.open(src).convert('RGBA')
W, H = im.size
bg = im.getpixel((4, 4))[:3]
px = im.load()
# flood-fill background from the top and side borders only (bottom is cropped by the counter)
seen = set(); stack = [(x, 0) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)]
def near(c): return sum(abs(c[i] - bg[i]) for i in range(3)) < 22
while stack:
    x, y = stack.pop()
    if (x, y) in seen or not (0 <= x < W and 0 <= y < H): continue
    seen.add((x, y))
    if not near(px[x, y]): continue
    px[x, y] = (0, 0, 0, 0)
    stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
th = round(H * tw / W)
small = im.resize((tw, th), Image.BOX)
# harden alpha, sharpen colour a touch
a = small.split()[3].point(lambda v: 255 if v > 140 else 0)
rgb = small.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
q = rgb.quantize(colors=ncol, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
res = Image.merge('RGBA', (*q.split(), a))
# 1px dark outline
p = res.load(); o = res.copy(); po = o.load()
for y in range(th):
    for x in range(tw):
        if p[x, y][3]: continue
        if any(0 <= x + dx < tw and 0 <= y + dy < th and p[x + dx, y + dy][3] for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))):
            po[x, y] = (5, 6, 6, 255)
o.save(out)
print(out, o.size)
