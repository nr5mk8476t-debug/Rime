// Shared painting helpers: ramp shading with ordered dither, the room's light field,
// and common surface treatments (grime, rivets, rust streaks, scratches).

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { fbm, hash2 } from '../engine/rng';

/** Pick a colour from a ramp at fractional index v, dithering between neighbours. */
export function shade(ramp: Col[], v: number, x: number, y: number): Col {
  const max = ramp.length - 1;
  if (v <= 0) return ramp[0];
  if (v >= max) return ramp[max];
  const lo = Math.floor(v), f = v - lo;
  // Mostly flat colour clusters; dither only in a narrow band between steps (reads as pixel art, not noise).
  const g = f < 0.38 ? 0 : f > 0.62 ? 1 : (f - 0.38) / 0.24;
  return g > bayer(x, y) ? ramp[lo + 1] : ramp[lo];
}

interface Light { x: number; y: number; r: number; k: number; warm: number; sy?: number }
/** Light sources baked into the room (day / open-hours setup). */
export const DAY_LIGHTS: Light[] = [
  { x: 320, y: 30, r: 230, k: 2.4, warm: 0.15, sy: 0.75 },   // tube over the window
  { x: 320, y: 186, r: 120, k: 1.4, warm: 0.2, sy: 0.6 },    // bounce off the tray
  { x: 128, y: 16, r: 90, k: 1.3, warm: 0.8 },              // bare bulb, left
  { x: 50, y: 330, r: 90, k: 1.4, warm: 0.9 },                // heater glow
  { x: 320, y: 100, r: 260, k: 0.8, warm: -0.6, sy: 0.6 },   // cold spill from the window
  { x: 480, y: 140, r: 70, k: 0.8, warm: -0.3 },             // terminal glow
];

/** Returns brightness (0..~3) and warmth (-1..1) at a point. */
export function lightAt(x: number, y: number, lights = DAY_LIGHTS): { v: number; warm: number } {
  let v = 0, warm = 0;
  for (const L of lights) {
    const dx = x - L.x, dy = (y - L.y) * (L.sy ?? 1);
    const d = Math.sqrt(dx * dx + dy * dy) / L.r;
    if (d >= 1) continue;
    const a = (1 - d) * (1 - d) * L.k;
    v += a; warm += a * L.warm;
  }
  return { v, warm: v > 0 ? Math.max(-1, Math.min(1, warm / v)) : 0 };
}

/** Grimy panel texture: returns -1..1 variation used to darken/lighten a base shade. */
export function grime(x: number, y: number, seed: number) {
  const g = fbm(x * 0.045, y * 0.06, seed, 3);
  const speck = hash2(x, y, seed) > 0.975 ? -0.7 : 0;
  return (g - 0.5) * 2 + speck;
}

export function rivet(s: Surface, x: number, y: number, hi: Col, lo: Col, mid?: Col) {
  s.px(x, y, hi); s.px(x + 1, y, mid ?? lo); s.px(x, y + 1, mid ?? lo); s.px(x + 1, y + 1, lo);
}

/** Rust bleeding down from a point. */
export function rustStreak(s: Surface, x: number, y: number, len: number, seed: number) {
  for (let i = 0; i < len; i++) {
    const w = i < 2 ? 2 : 1;
    const a = 1 - i / len;
    for (let k = 0; k < w; k++) {
      if (bayer(x + k, y + i) < a * 0.9) s.px(x + k + (hash2(i, seed, 2) > 0.85 ? 1 : 0), y + i, a > 0.6 ? P.rust[3] : P.rust[2]);
    }
  }
}

/** Short scratch highlights on metal. */
export function scratches(s: Surface, x0: number, y0: number, w: number, h: number, n: number, c: Col, seed: number) {
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(hash2(i, 1, seed) * w), y = y0 + Math.floor(hash2(i, 2, seed) * h);
    const len = 2 + Math.floor(hash2(i, 3, seed) * 7);
    const dir = hash2(i, 4, seed) > 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) s.px(x + k, y + Math.floor((k * dir) / 3), c);
  }
}

/** Paint a lit, textured rectangle using a ramp + the room light field. */
export function litRect(s: Surface, x: number, y: number, w: number, h: number, ramp: Col[], base: number, seed: number, gscale = 0.9, lights = DAY_LIGHTS) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const L = lightAt(i, j, lights);
    const v = base + L.v * 1.2 + grime(i, j, seed) * gscale;
    s.px(i, j, shade(ramp, v, i, j));
  }
}
