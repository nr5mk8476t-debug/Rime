// The moon exterior seen through the service window.
// Static paint (sky, gas giant, the Halcyon ship, refinery skyline, street) is baked once;
// animated elements (ship lights, extraction beam, smoke, mining rig, passers-by, barrel fire,
// haze, snow) are painted every frame into separate layers.

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { Rng, fbm, hash2, vnoise } from '../engine/rng';
import { shade } from './paint';
import { WIN } from '../scene/layout';

const EW = WIN.w, EH = WIN.h;
const HORIZON = 100;
export const STREET_Y = 118;

const C = P.cold, V = P.vel, A = P.amber, R = P.rust, M = P.metal;
const BEAM_X = 178;

// ---------------------------------------------------------------------------------------------
// Static
// ---------------------------------------------------------------------------------------------

function paintSky(s: Surface) {
  // dark zenith -> hazy, light-polluted horizon. Flat bands with narrow dither seams.
  for (let y = 0; y < STREET_Y; y++) for (let x = 0; x < EW; x++) {
    const t = 1.5 + Math.pow(y / HORIZON, 0.9) * 2.9;
    const gx = (x - BEAM_X) / 70, gy = (y - HORIZON - 4) / 26;
    const glow = Math.max(0, 1 - gx * gx - gy * gy);
    let c = shade(C, t, x, y);
    if (glow > 0.35) c = shade([C[3], V[1], V[2]], (glow - 0.35) * 4, x, y);
    s.px(x, y, c);
  }
  const r = new Rng(77);
  for (let i = 0; i < 26; i++) {
    const x = r.int(0, EW - 1), y = r.int(0, 40);
    if (i < 3) { s.px(x, y, C[8]); s.px(x + 1, y, C[5]); s.px(x - 1, y, C[5]); s.px(x, y - 1, C[5]); s.px(x, y + 1, C[5]); }
    else s.px(x, y, r.chance(0.4) ? C[6] : C[4]);
  }
}

function paintGasGiant(s: Surface) {
  // huge banded planet low in the upper-left sky; muted so it never competes with the customer
  const cx = 14, cy = 4, rad = 66;
  const bands: Col[] = [R[2], R[3], P.paper[1], R[2], A[1], R[3], R[2], P.paper[0], R[3], R[1]];
  for (let y = 0; y < 80; y++) for (let x = 0; x < 100; x++) {
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 > rad * rad) continue;
    const d = Math.sqrt(d2) / rad;
    const warp = fbm(x * 0.06, y * 0.2, 5) * 7;
    const bi = Math.floor((y + warp + 40) / 7) % bands.length;
    let c = bands[bi];
    const nx = dx / rad, ny = dy / rad, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const lit = nx * 0.6 - ny * 0.3 + nz * 0.5;
    const b = bayer(x, y);
    if (lit < 0.05) c = C[1];
    else if (lit < 0.22) c = b < (0.22 - lit) / 0.17 ? C[1] : C[2];
    else if (lit < 0.34) c = b < (0.34 - lit) / 0.12 ? C[2] : c;
    if (d > 0.96 && lit > 0.3) c = R[4];
    s.px(x, y, c);
  }
}

interface ShipLight { x: number; y: number; c: Col; period: number; phase: number }
const shipLights: ShipLight[] = [];
const shipWindows: { x: number; y: number; c: Col; tw: number }[] = [];

/** Drill columns the parked ship has sunk into the plain. Animated in ExteriorAnim. */
export interface Drill { x: number; top: number; bot: number; w: number }
const drills: Drill[] = [{ x: 46, top: 45, bot: 104, w: 7 }, { x: 176, top: 49, bot: 106, w: 5 }];
const DRILL_KEY = 0xff112233; // sentinel colour for drill-shaft pixels (resolved after the skyline is painted)
let drillMask: Uint8Array | null = null;

function paintShip(s: Surface) {
  // The Halcyon Extraction Combine flagship, parked: a city-sized hull standing on jointed legs,
  // its drill columns bored into the plain.
  const body = C[1], mid = C[2], rim = C[3], rimHi = C[5], seam = C[0];
  const sh = new Surface(EW, EH);
  // hull
  sh.poly([[-12, 34], [10, 26], [40, 20], [80, 17], [EW + 10, 15], [EW + 10, 44], [150, 48], [70, 48], [24, 44]], body);
  sh.poly([[-12, 34], [-4, 31], [6, 38], [-12, 40]], mid);
  // city-like superstructure
  const r = new Rng(9);
  let x = 36;
  while (x < EW + 4) {
    const w = r.int(4, 13), h = Math.round(r.int(3, 16) * (x > 90 && x < 170 ? 1.2 : 0.7));
    sh.rect(x, 18 - h, w, h + 2, r.chance(0.5) ? body : mid);
    if (r.chance(0.3)) {
      const ax = x + r.int(1, Math.max(1, w - 2)), top = 18 - h - r.int(3, 10);
      sh.vline(ax, top, 18 - h, mid);
      if (r.chance(0.6)) shipLights.push({ x: ax, y: top, c: P.neonRed, period: 1.6 + r.next() * 2, phase: r.next() * 6 });
    }
    x += w + r.int(-1, 2);
  }
  sh.poly([[118, 18], [123, -6], [125, -6], [130, 18]], body);
  shipLights.push({ x: 124, y: -4, c: P.neonRed, period: 2.2, phase: 0 });
  // belly machinery and drill housings
  for (const d of drills) {
    sh.poly([[d.x - 9, 46], [d.x + 9, 46], [d.x + 6, d.top + 2], [d.x - 6, d.top + 2]], body);
    sh.rect(d.x - 4, d.top + 2, 9, 3, mid);
  }
  for (const tx of [30, 100, 132, 154]) sh.rect(tx, 46, 3, 4 + (tx % 3), mid);

  // legs: jointed and splayed like a crouching insect; hip -> knee -> foot
  const legs = [
    { hip: [24, 40], knee: [4, 58], foot: [2, 102], w: 6 },
    { hip: [74, 46], knee: [62, 66], foot: [68, 102], w: 5 },
    { hip: [150, 46], knee: [164, 64], foot: [158, 103], w: 5 },
    { hip: [198, 44], knee: [212, 62], foot: [204, 104], w: 6 },
  ];
  const strut = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = i / n, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, hw = (w0 + (w1 - w0) * t) / 2;
      for (let k = -Math.ceil(hw); k <= Math.ceil(hw); k++) sh.px(Math.round(cx + k), Math.round(cy), Math.abs(k) > hw - 0.6 ? (k < 0 ? rimHi : seam) : k < 0 ? rim : mid);
    }
  };
  for (const L of legs) {
    strut(L.hip[0], L.hip[1], L.knee[0], L.knee[1], L.w + 2, L.w);
    strut(L.knee[0], L.knee[1], L.foot[0], L.foot[1], L.w, L.w - 2);
    // piston running alongside the upper strut
    sh.line(L.hip[0] + 3, L.hip[1] + 2, L.knee[0] + 2, L.knee[1] - 2, mid);
    // knee joint + warning light
    sh.circle(L.knee[0], L.knee[1], Math.ceil(L.w / 2) + 1, mid);
    sh.ring(L.knee[0], L.knee[1], Math.ceil(L.w / 2) + 1, seam);
    sh.px(L.knee[0] - 1, L.knee[1] - 1, rimHi);
    shipLights.push({ x: L.knee[0], y: L.knee[1], c: P.neonAmber, period: 2.6 + r.next(), phase: r.next() * 3 });
    // foot pad
    sh.rect(L.foot[0] - L.w - 3, L.foot[1], L.w * 2 + 7, 2, body);
    sh.hline(L.foot[0] - L.w - 3, L.foot[0] + L.w + 3, L.foot[1], rim);
  }
  // rim light on top/left edges of the hull
  const copy = sh.buf.slice();
  for (let yy = 1; yy < sh.h; yy++) for (let xx = 1; xx < sh.w; xx++) {
    const i = yy * sh.w + xx;
    if (copy[i] !== body && copy[i] !== mid) continue;
    if (!copy[i - sh.w]) sh.buf[i] = xx < 90 ? rimHi : rim;
    else if (!copy[i - 1]) sh.buf[i] = rim;
  }
  for (let yy = 22; yy < 46; yy += 4) for (let xx = 0; xx < sh.w; xx++) if (sh.get(xx, yy) === body && hash2(xx >> 3, yy, 3) > 0.3 && yy < 44) sh.px(xx, yy, seam);
  // belly falls into shadow
  for (let yy = 40; yy < 52; yy++) for (let xx = 0; xx < sh.w; xx++) {
    const v = sh.get(xx, yy);
    if ((v === body || v === mid) && bayer(xx, yy) < (yy - 40) / 6) sh.px(xx, yy, C[0]);
  }
  // city lights in rows
  for (let i = 0; i < 700; i++) {
    const wx = r.int(0, sh.w - 1), wy = 2 + r.int(0, 10) * 4 + 1;
    const v = sh.get(wx, wy);
    if (v !== body && v !== mid) continue;
    if (vnoise(wx * 0.12, wy * 0.2, 4) < 0.6) continue;
    shipWindows.push({ x: wx, y: wy, c: r.chance(0.75) ? A[3] : r.chance(0.5) ? A[5] : C[7], tw: r.chance(0.08) ? r.next() * 6 + 1 : 0 });
  }
  for (const [lx, ly] of [[-2, 36], [70, 47], [150, 47]]) shipLights.push({ x: lx, y: ly, c: P.neonRed, period: 1.2 + r.next(), phase: r.next() * 4 });
  s.blit(sh, 0, 0);
  for (const w of shipWindows) s.px(w.x, w.y, w.c);
  // drill shafts: painted with a sentinel so the animator knows which pixels stay visible
  for (const d of drills) for (let y = d.top + 5; y < d.bot; y++) for (let k = 0; k < d.w; k++) s.px(d.x - (d.w >> 1) + k, y, DRILL_KEY);
}

function paintRidge(s: Surface) {
  for (let x = 0; x < EW; x++) {
    const h = Math.round(HORIZON - 4 - fbm(x * 0.03, 0, 2) * 10);
    for (let y = h; y < STREET_Y; y++) s.px(x, y, y === h ? C[3] : C[2]);
  }
  // scoured ground and spoil heaps around the drill sites
  for (const d of drills) {
    s.poly([[d.x - 22, d.bot + 2], [d.x - 8, d.bot - 6], [d.x + 10, d.bot - 5], [d.x + 24, d.bot + 2]], C[2]);
    s.hline(d.x - 14, d.x + 14, d.bot - 5, C[3]);
  }
}

interface Stack { x: number; top: number }
const stacks: Stack[] = [];
const skylineLights: { x: number; y: number; c: Col; blink: number }[] = [];

function paintSkyline(s: Surface) {
  const r = new Rng(31);
  const far = C[2], near = C[1];
  const tower = (x: number, w: number, h: number, col: Col) => {
    const base = HORIZON + 6;
    s.poly([[x, base], [x + 3, base - h], [x + w - 3, base - h], [x + w, base]], col);
    s.hline(x + 3, x + w - 4, base - h, C[3]);
  };
  tower(96, 18, 14, far); tower(118, 12, 10, far);
  for (let i = 0; i < 9; i++) {
    const x = r.int(0, EW - 8), h = r.int(8, 18), w = r.int(2, 3);
    s.rect(x, HORIZON + 6 - h, w, h, near);
    s.px(x, HORIZON + 6 - h, C[3]);
    stacks.push({ x: x + (w >> 1), top: HORIZON + 6 - h });
    if (r.chance(0.6)) skylineLights.push({ x: x + (w >> 1), y: HORIZON + 5 - h, c: P.neonRed, blink: r.next() * 3 });
  }
  for (let i = 0; i < 26; i++) {
    const x = r.int(-4, EW), w = r.int(6, 18), h = r.int(3, 8);
    const y = HORIZON + 8 - h;
    s.rect(x, y, w, h + 12, near);
    s.hline(x, x + w - 1, y, C[3]);
    for (let k = 0; k < w * h * 0.03; k++) {
      const wx = x + r.int(1, w - 2), wy = y + r.int(2, h + 4);
      skylineLights.push({ x: wx, y: wy, c: r.chance(0.8) ? A[3] : C[6], blink: -1 });
    }
  }
  for (const gx of [] as number[]) {
    for (let y = 70; y < HORIZON + 8; y++) { s.px(gx, y, near); s.px(gx + 3, y, near); if (y % 4 === 0) s.line(gx, y, gx + 3, y + 3, near); }
    s.hline(gx - 18, gx + 12, 70, near); s.hline(gx - 18, gx + 12, 71, near);
    s.vline(gx - 16, 71, 80, near);
    skylineLights.push({ x: gx + 1, y: 68, c: P.neonRed, blink: r.next() * 3 });
  }
  for (let y = HORIZON + 8; y < STREET_Y + 4; y++) for (let x = 0; x < EW; x++) {
    const n = fbm(x * 0.05, y * 0.4, 8);
    s.px(x, y, shade(C, 3 + n * 1.6 + (y - HORIZON - 8) * 0.05, x, y));
  }
  for (const L of skylineLights) if (L.blink < 0) s.px(L.x, L.y, L.c);
}

function paintStreet(s: Surface) {
  for (let y = STREET_Y; y < EH; y++) for (let x = 0; x < EW; x++) {
    const d = (y - STREET_Y) / (EH - STREET_Y);
    const n = fbm(x * 0.04, y * 0.12, 21);
    let v = 4.4 + n * 2.2 - d * 1.2;
    const rut = Math.abs(((x + y * 0.8) % 54) - 27);
    if (rut < 3 && d > 0.15) v -= 1.1;
    let c = shade(C, v, x, y);
    if (fbm(x * 0.08, y * 0.25, 33) > 0.68) c = shade(M, 2.6 - d, x, y);
    s.px(x, y, c);
  }
  for (let y = STREET_Y; y < EH; y++) for (let x = 120; x < EW; x++) {
    const dx = (x - 192) / 40, dy = (y - 140) / 16;
    const k = 1 - dx * dx - dy * dy;
    if (k > 0.15) {
      const cur = s.get(x, y);
      const g = k > 0.55 ? 1 : (k - 0.15) / 0.4;
      if (g > bayer(x, y)) s.px(x, y, cur === C[7] || cur === C[6] ? A[5] : cur === C[5] ? A[4] : A[2]);
    }
  }
  for (let y = 58; y < EH; y++) for (let x = 0; x < 34; x++) {
    const rib = x % 4;
    let c = rib === 0 ? R[1] : rib === 1 ? R[3] : R[2];
    if (fbm(x * 0.2, y * 0.08, 41) > 0.62) c = rib === 1 ? M[3] : M[2];
    s.px(x, y, c);
  }
  s.poly([[0, 52], [40, 60], [40, 63], [0, 56]], M[2]);
  s.hline(0, 40, 60, M[4]);
  s.rect(8, 76, 16, 12, A[1]);
  s.rect(9, 77, 14, 10, A[3]);
  s.rect(9, 77, 14, 3, A[4]);
  s.vline(16, 76, 88, R[0]); s.hline(8, 23, 82, R[0]);
  s.rect(10, 80, 4, 7, P.black); s.rect(10, 79, 3, 2, P.black);
  s.frame(7, 75, 18, 14, R[0]);
  for (let x = 0; x < 34; x++) if (hash2(x, 0, 2) > 0.3) s.px(x, 58, C[7]);
  s.poly([[0, 138], [20, 128], [36, 134], [40, EH], [0, EH]], C[6]);
  s.poly([[0, 140], [18, 131], [30, 135], [0, 146]], C[7]);
  s.rect(192, 42, 2, STREET_Y + 20 - 42, M[2]);
  s.vline(192, 42, STREET_Y + 20, M[4]);
  s.rect(184, 40, 12, 2, M[3]);
  s.rect(184, 42, 6, 3, M[2]);
  s.hline(185, 188, 45, A[6]);
  for (let x = 150; x < EW; x++) for (let k = 0; k < 4; k++) s.px(x, STREET_Y + 14 + k, ((x + k) >> 2) % 2 ? A[3] : M[1]);
  for (const px of [152, 178, 204]) s.rect(px, STREET_Y + 18, 2, 10, M[2]);
  const cable = (x0: number, y0: number, x1: number, y1: number, sag: number) => {
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      s.px(x, Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)), P.black);
    }
  };
  cable(0, 64, EW, 40, 16);
  cable(0, 70, 194, 46, 10);
  cable(36, 62, EW, 74, 8);
  s.rect(44, 128, 10, 13, R[2]);
  s.vline(44, 128, 140, R[1]); s.vline(53, 128, 140, R[1]);
  s.hline(44, 53, 132, R[1]); s.hline(44, 53, 137, R[1]);
  s.hline(44, 53, 128, R[4]);
}

export function buildExteriorStatic(): Surface {
  const s = new Surface(EW, EH);
  paintSky(s);
  paintGasGiant(s);
  paintRidge(s);
  paintShip(s);
  paintSkyline(s);
  drillMask = new Uint8Array(EW * EH);
  for (let i = 0; i < s.buf.length; i++) if (s.buf[i] === DRILL_KEY) { drillMask[i] = 1; s.buf[i] = C[1]; }
  paintStreet(s);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Animated
// ---------------------------------------------------------------------------------------------

interface Walker { x: number; y: number; dir: number; speed: number; kind: number; phase: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number }

export class ExteriorAnim {
  layer = new Surface(EW, EH);
  fog = new Surface(EW, EH);
  walkers: Walker[] = [];
  nextWalker = 1.5;
  rigX = -999;
  nextRig = 4;
  smoke: Particle[] = [];
  snow: Particle[] = [];
  embers: Particle[] = [];
  spoil: Particle[] = [];
  rng = new Rng(1234);

  constructor() {
    for (let i = 0; i < 46; i++) this.snow.push(this.newFlake(true));
  }

  newFlake(anywhere = false): Particle {
    const r = this.rng;
    const near = r.chance(0.15);
    return {
      x: anywhere ? r.next() * EW : -4 - r.next() * 20, y: r.next() * EH,
      vx: (near ? 26 : 12) + r.next() * 8, vy: (near ? 9 : 4) + r.next() * 4,
      life: 0, max: 99, size: near ? 2 : 1,
    };
  }

  update(dt: number, t: number) {
    const r = this.rng;
    this.nextWalker -= dt;
    if (this.nextWalker <= 0) {
      const dir = r.chance(0.5) ? 1 : -1;
      this.walkers.push({ x: dir > 0 ? -10 : EW + 10, y: STREET_Y + 10 + Math.round(r.next() * 14), dir, speed: 7 + r.next() * 7, kind: r.int(0, 3), phase: r.next() * 6 });
      this.nextWalker = 6 + r.next() * 12;
    }
    for (const w of this.walkers) w.x += w.dir * w.speed * dt;
    this.walkers = this.walkers.filter((w) => w.x > -20 && w.x < EW + 20);
    this.nextRig -= dt;
    if (this.rigX < -100 && this.nextRig <= 0) { this.rigX = EW + 10; this.nextRig = 80 + r.next() * 40; }
    if (this.rigX > -100) this.rigX -= dt * 4.2;
    for (const st of stacks) if (r.chance(dt * 1.4)) this.smoke.push({ x: st.x, y: st.top - 1, vx: 2.5 + r.next() * 2, vy: -3 - r.next() * 2, life: 0, max: 7 + r.next() * 5, size: 1 });
    for (const p of this.smoke) { p.x += p.vx * dt; p.y += p.vy * dt; p.life += dt; }
    this.smoke = this.smoke.filter((p) => p.life < p.max);
    for (const p of this.snow) {
      p.x += p.vx * dt + Math.sin(t * 2 + p.y * 0.1) * 3 * dt;
      p.y += p.vy * dt;
      if (p.x > EW + 2 || p.y > EH + 2) Object.assign(p, this.newFlake(), { y: r.next() * EH - 20 });
    }
    for (const d of drills) if (r.chance(dt * 9)) this.spoil.push({ x: d.x + (r.next() - 0.5) * 6, y: d.bot - 2, vx: (r.next() - 0.5) * 14, vy: -6 - r.next() * 9, life: 0, max: 0.8 + r.next() * 0.8, size: 1 });
    for (const p of this.spoil) { p.x += p.vx * dt; p.vy += 18 * dt; p.y += p.vy * dt; p.life += dt; }
    this.spoil = this.spoil.filter((p) => p.life < p.max);
    if (r.chance(dt * 6)) this.embers.push({ x: 46 + r.next() * 6, y: 124, vx: 3 + r.next() * 6, vy: -8 - r.next() * 8, life: 0, max: 1 + r.next(), size: 1 });
    for (const p of this.embers) { p.x += p.vx * dt; p.y += p.vy * dt; p.life += dt; }
    this.embers = this.embers.filter((p) => p.life < p.max);
  }

  draw(t: number) {
    const s = this.layer;
    s.clear();
    for (const L of shipLights) {
      if (((t + L.phase) % L.period) < 0.35) { s.px(L.x, L.y, L.c); if (L.c === P.neonRed) { s.px(L.x - 1, L.y, P.blood[3]); s.px(L.x + 1, L.y, P.blood[3]); } }
    }
    for (const w of shipWindows) if (w.tw && Math.sin(t * w.tw + w.x) > 0.6) s.px(w.x, w.y, C[1]);
    for (const L of skylineLights) if (L.blink >= 0 && ((t + L.blink) % 2.4) < 0.5) s.px(L.x, L.y, L.c);

    // drill columns: banded shafts spinning down into the plain, spoil and vel-light at the bore
    for (const d of drills) {
      const x0 = d.x - (d.w >> 1);
      for (let y = d.top + 5; y < d.bot; y++) for (let k = 0; k < d.w; k++) {
        if (!drillMask || !drillMask[y * EW + x0 + k]) continue;
        const nx = (k / (d.w - 1)) * 2 - 1;
        const band = ((y * 2 + k * 2 - Math.floor(t * 26)) % 8 + 8) % 8 < 3;
        const lit = nx < -0.3 ? 3 : nx < 0.4 ? 2 : 1;
        s.px(x0 + k, y, band ? C[lit + 1] : C[lit]);
      }
      // collar clamps sliding down as the column advances
      const cy = d.top + 6 + Math.floor((t * 3 + d.x) % (d.bot - d.top - 10));
      for (let k = -1; k <= d.w; k++) if (drillMask && drillMask[cy * EW + x0 + Math.max(0, Math.min(d.w - 1, k))]) s.px(x0 + k, cy, C[5]);
      // bore glow: vel light pulsing from the hole
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.1 + d.x);
      for (let y = d.bot - 7; y < d.bot + 2; y++) for (let x = d.x - 12; x <= d.x + 12; x++) {
        const dx = (x - d.x) / 12, dy = (y - d.bot + 1) / 6;
        const kk = 1 - dx * dx - dy * dy;
        if (kk > 0.6 - pulse * 0.25 && bayer(x, y + Math.floor(t * 5)) < kk) s.px(x, y, kk > 0.8 ? V[5] : V[3]);
      }
    }
    for (const p of this.spoil) s.px(p.x, p.y, p.life < p.max * 0.4 ? C[5] : p.vx > 0 ? R[2] : C[3]);
    for (const p of this.smoke) {
      const k = p.life / p.max;
      const rr = 1 + Math.floor(k * 3);
      for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
        if (x * x + y * y > rr * rr) continue;
        if (k < 0.65 || bayer(p.x + x, p.y + y) < 0.5) s.px(p.x + x, p.y + y, k < 0.3 ? C[4] : C[3]);
      }
    }

    if (this.rigX > -100) this.drawRig(s, Math.round(this.rigX), HORIZON + 10, t);
    for (const w of this.walkers) this.drawWalker(s, w, t);

    for (let i = 0; i < 9; i++) {
      const fx = 45 + i, h = 2 + Math.round(4 * (0.5 + 0.5 * Math.sin(t * 11 + i * 2.1))) - Math.abs(i - 4) * 0.5;
      for (let k = 0; k < h; k++) s.px(fx, 127 - k, k < 1 ? A[6] : k < 3 ? R[7] : R[5]);
    }
    for (const p of this.embers) s.px(p.x, p.y, p.life < 0.4 ? A[6] : R[6]);

    const f = this.fog; f.clear();
    const drift = t * 5;
    for (let y = 60; y < EH; y++) {
      const band = Math.max(0, 1 - Math.abs(y - 114) / 32);
      if (band <= 0) continue;
      for (let x = 0; x < EW; x++) {
        const n = vnoise((x + drift) * 0.025, y * 0.08 + t * 0.03, 66) * 0.7 + vnoise((x + drift * 1.7) * 0.06, y * 0.2, 67) * 0.3;
        const a = n * band;
        if (a > 0.4) f.px(x, y, a > 0.52 ? C[7] : C[6]);
      }
    }
    f.flush();

    for (const p of this.snow) {
      s.px(p.x, p.y, p.size > 1 ? C[9] : C[8]);
      if (p.size > 1) { s.px(p.x + 1, p.y, C[8]); s.px(p.x, p.y + 1, C[7]); }
    }
    s.flush();
  }

  drawRig(s: Surface, x: number, y: number, t: number) {
    const d = C[1], m = C[2], hi = C[4];
    s.rect(x, y - 6, 46, 6, d);
    for (let i = 0; i < 46; i += 3) s.px(x + i + (Math.floor(t * 8) % 3), y - 6, m);
    s.rect(x + 6, y - 16, 32, 10, d);
    s.hline(x + 6, x + 37, y - 16, hi);
    s.rect(x + 30, y - 22, 8, 6, d);
    s.px(x + 32, y - 20, A[4]); s.px(x + 34, y - 20, A[4]);
    s.line(x + 10, y - 16, x - 14, y - 36, d); s.line(x + 11, y - 16, x - 13, y - 36, d);
    s.line(x + 20, y - 16, x - 12, y - 37, m);
    s.ring(x - 16, y - 36, 5, d);
    const a = t * 1.5;
    for (let k = 0; k < 4; k++) s.line(x - 16, y - 36, x - 16 + Math.round(Math.cos(a + k * 1.57) * 5), y - 36 + Math.round(Math.sin(a + k * 1.57) * 5), d);
    s.vline(x + 24, y - 34, y - 16, d);
    s.line(x + 24, y - 34, x + 36, y - 16, m);
    if (Math.floor(t * 2) % 2) s.px(x + 24, y - 35, P.neonAmber);
    if (Math.floor(t * 2 + 1) % 2) s.px(x + 44, y - 8, P.neonAmber);
    for (let k = 0; k < 10; k++) s.px(x - 2 - k * 2, y - 10 + k, k < 4 ? A[4] : A[2]);
  }

  drawWalker(s: Surface, w: Walker, t: number) {
    const step = Math.floor((t * w.speed * 0.6 + w.phase) % 4);
    const bob = step % 2;
    const x = Math.round(w.x), y = w.y;
    const body = C[1], rim = w.x > 140 ? A[3] : C[4];
    const h = Math.round(15 + (w.y - STREET_Y - 12) / 6);
    const spread = step === 1 || step === 3 ? 0 : 1;
    s.vline(x - spread, y - 5, y, body); s.vline(x + 1 + spread, y - 5, y, body);
    s.rect(x - 2, y - h + 5 + bob, 6, h - 9, body);
    s.rect(x - 1, y - h + 2 + bob, 4, 4, body);
    if (w.kind === 1) s.rect(x - 3, y - h + 7 + bob, 2, 5, body);
    if (w.kind === 2) s.rect(x - 2, y - h + 1 + bob, 6, 1, body);
    const ex = w.dir > 0 ? x + 3 : x - 2;
    s.vline(ex, y - h + 6 + bob, y - 5, rim);
    if (w.kind === 0) s.px(x + (w.dir > 0 ? 2 : -1), y - h + 3 + bob, P.neonCyan);
    if (w.kind === 3 && Math.sin(t * 3 + w.phase) > -0.3) s.px(x + (w.dir > 0 ? 3 : -2), y - h + 4 + bob, P.neonAmber);
    if (w.kind === 1) for (let k = 1; k < 8; k++) s.px(x + w.dir * (3 + k * 2), y - h + 8 + k, k < 3 ? A[4] : A[2]);
    s.hline(x - 2, x + 4, y + 1, C[3]);
  }
}
