"""Kell animation sheet -> aligned, keyed portrait frames (tools/kell_frames.py art-src/kell_sheet.png)."""
import sys
from PIL import Image, ImageFilter
import numpy as np
im = Image.open(sys.argv[1] if len(sys.argv) > 1 else 'art-src/kell_sheet.png').convert('RGBA')
colb = [(9, 418), (431, 823), (837, 1242)]; rowb = [(17, 412), (428, 825), (841, 1237)]
names = [['neutral', 'half', 'closed'], ['talk1', 'talk2', 'talk3'], ['angry', 'worried', 'smirk']]
BG = (46, 46, 47, 255)
# generous crops centred on each cell
frames = {}
for r, (y0, y1) in enumerate(rowb):
    for c, (x0, x1) in enumerate(colb):
        cx = (x0 + x1) // 2
        # paint everything outside this cell flat background so neighbours can't leak in
        cell = Image.new('RGBA', im.size, BG); cell.paste(im.crop((x0, y0, x1 + 1, y1 + 1)), (x0, y0))
        fr = Image.new('RGBA', (460, 440), BG); fr.alpha_composite(cell.crop((cx - 230, y0 - 20, cx + 230, y0 + 420)).convert('RGBA'))
        frames[names[r][c]] = fr
B = np.asarray(frames['neutral'].convert('L')).astype(float)
H, W = B.shape
m = np.zeros_like(B, bool); m[25:110, 140:330] = True; m[330:420, 40:420] = True  # cap + shoulders
def err(F, dx, dy):
    Fs = np.roll(np.roll(F, dy, 0), dx, 1)
    return np.abs(Fs - B)[m].mean()
aligned = {}
for n, f in frames.items():
    F = np.asarray(f.convert('L')).astype(float)
    best = min((err(F, dx, dy), dx, dy) for dx in range(-60, 61, 3) for dy in range(-30, 31, 3))
    _, bx, by = best
    best = min((err(F, dx, dy), dx, dy) for dx in range(bx - 3, bx + 4) for dy in range(by - 3, by + 4))
    _, dx, dy = best
    aligned[n] = f.transform(f.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), fillcolor=BG)
    aligned[n].save(f'art-src/kell_aligned_{n}.png')
    print(f'{n:8s} shift {dx:4d} {dy:4d}  residual {best[0]:.1f}')
A0 = np.asarray(aligned['neutral'].convert('RGB')).astype(int)
mask = np.zeros(A0.shape[:2], bool)
for n, f in aligned.items():
    d = np.abs(np.asarray(f.convert('RGB')).astype(int) - A0).sum(2) > 90
    d[:115] = False; d[300:] = False; d[:, :130] = False; d[:, 330:] = False
    mask |= d
ys, xs = np.where(mask)
fx0, fy0, fx1, fy1 = int(np.percentile(xs, 1)), int(np.percentile(ys, 1)), int(np.percentile(xs, 99)), int(np.percentile(ys, 99))
print('face box', fx0, fy0, fx1, fy1)
def key(img):
    img = img.copy(); px = img.load(); w, h = img.size; bgc = BG[:3]
    seen = np.zeros((h, w), bool)
    st = [(x, 0) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    while st:
        x, y = st.pop()
        if not (0 <= x < w and 0 <= y < h) or seen[y, x]: continue
        seen[y, x] = True
        p = px[x, y]
        if p[3] and sum(abs(p[i] - bgc[i]) for i in range(3)) > 40: continue
        px[x, y] = (0, 0, 0, 0); st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return img
keyed = key(aligned['neutral']); alpha = keyed.split()[3]
bb = keyed.getbbox(); print('bbox', bb)
fm = Image.new('L', keyed.size, 0); fm.paste(255, (fx0 - 4, fy0 - 4, fx1 + 4, fy1 + 4)); fm = fm.filter(ImageFilter.GaussianBlur(5))
TW = 300
k = TW / (bb[2] - bb[0])
sheet = Image.new('RGBA', (TW * 3, 320 * 3), (30, 30, 30, 255))
for i, (n, f) in enumerate(aligned.items()):
    comp = Image.composite(f, aligned['neutral'], fm) if n != 'neutral' else aligned['neutral'].copy()
    comp.putalpha(alpha); comp = comp.crop(bb)
    out = comp.resize((TW, round(comp.size[1] * k)), Image.LANCZOS)
    out.putalpha(out.split()[3].point(lambda v: 255 if v > 120 else 0))
    out.save(f'src/art/portraits/kell_{n}.png')
    sheet.alpha_composite(out, ((i % 3) * TW, (i // 3) * 320))
sheet.save('shots/kell_frames_check.png'); print('size', out.size)
