// Surface: a palette-colour pixel buffer that every piece of art is painted into.
// All drawing happens at native resolution with integer coordinates; nothing is anti-aliased.

import type { Col } from './palette';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold for a pixel, 0..1 */
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

export class Surface {
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  buf: Uint32Array;
  /** optional clip rect */
  cx0 = 0; cy0 = 0; cx1: number; cy1: number;

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.cx1 = w; this.cy1 = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
  }

  clip(x: number, y: number, w: number, h: number) { this.cx0 = x; this.cy0 = y; this.cx1 = x + w; this.cy1 = y + h; }
  unclip() { this.cx0 = 0; this.cy0 = 0; this.cx1 = this.w; this.cy1 = this.h; }

  /** Push pixel buffer to the backing canvas. Call after painting, before drawImage. */
  flush(): HTMLCanvasElement { this.ctx.putImageData(this.img, 0, 0); return this.canvas; }
  clear() { this.buf.fill(0); }

  px(x: number, y: number, c: Col) {
    x |= 0; y |= 0;
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1 || !c) return;
    this.buf[y * this.w + x] = c;
  }
  get(x: number, y: number): Col {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.buf[y * this.w + x];
  }
  erase(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.buf[y * this.w + x] = 0;
  }
  /** Paint only where something already exists (for shading inside a silhouette). */
  pxIn(x: number, y: number, c: Col) { if (this.get(x, y)) this.px(x, y, c); }

  rect(x: number, y: number, w: number, h: number, c: Col) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  rectIn(x: number, y: number, w: number, h: number, c: Col) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.pxIn(i, j, c);
  }
  hline(x0: number, x1: number, y: number, c: Col) { for (let i = Math.min(x0, x1); i <= Math.max(x0, x1); i++) this.px(i, y, c); }
  vline(x: number, y0: number, y1: number, c: Col) { for (let j = Math.min(y0, y1); j <= Math.max(y0, y1); j++) this.px(x, j, c); }
  frame(x: number, y: number, w: number, h: number, c: Col) {
    this.hline(x, x + w - 1, y, c); this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c); this.vline(x + w - 1, y, y + h - 1, c);
  }
  /** Bevelled box: light top-left edge, dark bottom-right edge. */
  bevel(x: number, y: number, w: number, h: number, fill: Col, hi: Col, lo: Col) {
    this.rect(x, y, w, h, fill);
    this.hline(x, x + w - 1, y, hi); this.vline(x, y, y + h - 1, hi);
    this.hline(x, x + w - 1, y + h - 1, lo); this.vline(x + w - 1, y, y + h - 1, lo);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Col) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) this.px(cx + x, cy + y, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: Col) { this.ellipse(cx, cy, r, r, c); }
  ring(cx: number, cy: number, r: number, c: Col) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= r + 0.5 && d > r - 0.6) this.px(cx + x, cy + y, c);
    }
  }

  /** Scanline polygon fill. */
  poly(pts: number[][], c: Col) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) {
          xs.push(a[0] + ((y + 0.5 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.px(x, y, c);
      }
    }
  }

  /** Fill with ordered dither: draws c where bayer < amount. */
  dither(x: number, y: number, w: number, h: number, c: Col, amount: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (bayer(i, j) < amount) this.px(i, j, c);
  }
  ditherIn(x: number, y: number, w: number, h: number, c: Col, amount: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (bayer(i, j) < amount) this.pxIn(i, j, c);
  }

  /** Vertical gradient across a ramp with ordered dithering between steps. */
  vgrad(x: number, y: number, w: number, h: number, ramp: Col[], from = 0, to = ramp.length - 1) {
    for (let j = 0; j < h; j++) {
      const t = from + ((to - from) * j) / Math.max(1, h - 1);
      const lo = Math.floor(t), f = t - lo;
      for (let i = 0; i < w; i++) {
        const c = f > bayer(x + i, y + j) ? ramp[Math.min(lo + 1, ramp.length - 1)] : ramp[lo];
        this.px(x + i, y + j, c);
      }
    }
  }

  /** Copy another surface (non-transparent pixels) onto this one. */
  blit(src: Surface, dx: number, dy: number, flipX = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.buf[y * src.w + (flipX ? src.w - 1 - x : x)];
      if (c) this.px(dx + x, dy + y, c);
    }
  }

  /** Draw a 1px outline around every opaque pixel cluster (outside). */
  outline(c: Col) {
    const copy = this.buf.slice();
    const W = this.w, H = this.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (copy[y * W + x]) continue;
      const n = (x > 0 && copy[y * W + x - 1]) || (x < W - 1 && copy[y * W + x + 1]) ||
        (y > 0 && copy[(y - 1) * W + x]) || (y < H - 1 && copy[(y + 1) * W + x]);
      if (n) this.buf[y * W + x] = c;
    }
  }
  /** Replace any pixel of colour a by b in a rect. */
  swap(a: Col, b: Col) { for (let i = 0; i < this.buf.length; i++) if (this.buf[i] === a) this.buf[i] = b; }
}

/** Create a sprite from a string map. '.' or ' ' = transparent. */
export function sprite(rows: string[], key: Record<string, Col>): Surface {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const s = new Surface(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch !== '.' && ch !== ' ' && key[ch] !== undefined) s.px(x, y, key[ch]);
  }
  return s;
}
