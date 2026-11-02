// Character painting toolkit.
// Volumes are shaded from a consistent rig: key light from the shop's tube (above, front, slightly left),
// a cold rim from the exterior behind the customer, and a faint warm bounce from the lit tray below.
// Colour is always quantised to a ramp with flat clusters, then features are hand-placed on top.

import { Surface, bayer } from '../../engine/surface';
import type { Col } from '../../engine/palette';
import { P } from '../../engine/palette';

export const LIGHT = { x: -0.35, y: -0.75, z: 0.56 };

export interface ShadeOpts {
  ambient?: number;   // base ramp index
  diffuse?: number;   // how many ramp steps the key light spans
  rim?: Col | null;   // cold rim colour on silhouette-facing-away edges
  rimSide?: number;   // -1 left, 1 right, 0 both
  bounce?: number;    // warm bounce from below
  spec?: Col | null;  // specular pixel colour for shiny materials
  specPow?: number;
}

export function lambert(nx: number, ny: number, nz: number) {
  return Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
}

function quant(ramp: Col[], v: number, x: number, y: number): Col {
  const max = ramp.length - 1;
  if (v <= 0) return ramp[0];
  if (v >= max) return ramp[max];
  const lo = Math.floor(v), f = v - lo;
  const g = f < 0.4 ? 0 : f > 0.6 ? 1 : (f - 0.4) / 0.2;
  return g > bayer(x, y) ? ramp[lo + 1] : ramp[lo];
}

/** Shade an ellipsoid-ish volume inside mask(x,y). Normal derived from the ellipse (cx,cy,rx,ry). */
export function ellipsoid(s: Surface, cx: number, cy: number, rx: number, ry: number, ramp: Col[], o: ShadeOpts = {}, mask?: (x: number, y: number) => boolean) {
  const amb = o.ambient ?? 1, dif = o.diffuse ?? (ramp.length - 2);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    if (mask && !mask(x, y)) continue;
    const nz = Math.sqrt(Math.max(0, 1 - d));
    let v = amb + lambert(nx, ny, nz) * dif + (o.bounce ? Math.max(0, ny) * o.bounce : 0);
    let c = quant(ramp, v, x, y);
    if (o.spec) {
      const h = Math.pow(lambert(nx, ny, nz), o.specPow ?? 12);
      if (h > 0.55) c = o.spec;
    }
    if (o.rim && d > 0.72 && nz < 0.55) {
      const side = Math.sign(nx);
      if ((o.rimSide ?? 0) === 0 || side === o.rimSide) if (ny > -0.6) c = o.rim;
    }
    s.px(x, y, c);
  }
}

/** Shade an arbitrary filled shape using a horizontal cylinder profile across [x0,x1] (for torsos, limbs). */
export function cylinderFill(s: Surface, x0: number, x1: number, ramp: Col[], o: ShadeOpts & { vfall?: number; y0?: number } = {}, region?: (x: number, y: number) => boolean, ys?: [number, number]) {
  const amb = o.ambient ?? 1, dif = o.diffuse ?? ramp.length - 2;
  const [ya, yb] = ys ?? [0, s.h - 1];
  for (let y = ya; y <= yb; y++) for (let x = x0; x <= x1; x++) {
    if (region && !region(x, y)) continue;
    const nx = ((x - x0) / Math.max(1, x1 - x0)) * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx));
    let v = amb + lambert(nx, -0.35, nz) * dif - (o.vfall ? (y - (o.y0 ?? ya)) * o.vfall : 0);
    s.px(x, y, quant(ramp, v, x, y));
  }
}

/** Outline every opaque pixel's empty neighbours with a dark line (selective: skips where rim is lit). */
export function inkOutline(s: Surface, ink: Col) {
  s.outline(ink);
}

/** Apply a cold rim along the silhouette edge facing the exterior. */
export function silhouetteRim(s: Surface, c: Col, minY: number, maxY: number, side: 'left' | 'right' | 'both' = 'both', depth = 1, skip?: (x: number, y: number) => boolean) {
  const copy = s.buf.slice();
  const W = s.w;
  for (let y = minY; y < Math.min(maxY, s.h); y++) for (let x = 0; x < W; x++) {
    if (!copy[y * W + x]) continue;
    if (skip && skip(x, y)) continue;
    for (let k = 1; k <= depth; k++) {
      const leftEmpty = x - k < 0 || !copy[y * W + x - k];
      const rightEmpty = x + k >= W || !copy[y * W + x + k];
      if ((side !== 'right' && leftEmpty) || (side !== 'left' && rightEmpty)) { s.px(x, y, c); break; }
    }
  }
}

/** Fabric folds: darker creases following a list of line segments. */
export function creases(s: Surface, lines: number[][], dark: Col, light?: Col) {
  for (const [x0, y0, x1, y1] of lines) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      s.pxIn(x, y, dark);
      if (light) s.pxIn(x - 1, y, light);
    }
  }
}

/** Composite helper for layered characters. */
export function layer(w: number, h: number) { return new Surface(w, h); }
export { P };
