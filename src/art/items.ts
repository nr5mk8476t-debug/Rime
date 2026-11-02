// Item sprites, painted at the inventory cell scale (20px per cell).
// Each item is lit from the upper-left, has a 1px dark outline, and uses the master palette.

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { hash2 } from '../engine/rng';
import { ITEMS } from '../data/items';
import { CELL } from '../scene/layout';
import { text, TINY } from '../engine/font';

const M = P.metal, R = P.rust, A = P.amber, T = P.teal, C = P.cold, PA = P.paper, B = P.blood, V = P.vel, SK = P.skin;

type Painter = (s: Surface, w: number, h: number) => void;

/** cylinder shading across a rect (vertical axis) */
function cylV(s: Surface, x: number, y: number, w: number, h: number, ramp: Col[], amb = 1, dif = 4) {
  for (let i = 0; i < w; i++) {
    const nx = (i / Math.max(1, w - 1)) * 2 - 1;
    const v = amb + Math.max(0, -nx * 0.6 + Math.sqrt(Math.max(0, 1 - nx * nx)) * 0.7) * dif;
    for (let j = 0; j < h; j++) {
      const f = v - Math.floor(v);
      const k = Math.floor(v) + (f > 0.55 || (f > 0.4 && bayer(x + i, y + j) < 0.5) ? 1 : 0);
      s.px(x + i, y + j, ramp[Math.max(0, Math.min(ramp.length - 1, k))]);
    }
  }
}
function cylH(s: Surface, x: number, y: number, w: number, h: number, ramp: Col[], amb = 1, dif = 4) {
  for (let j = 0; j < h; j++) {
    const ny = (j / Math.max(1, h - 1)) * 2 - 1;
    const v = amb + Math.max(0, -ny * 0.7 + Math.sqrt(Math.max(0, 1 - ny * ny)) * 0.6) * dif;
    for (let i = 0; i < w; i++) {
      const f = v - Math.floor(v);
      const k = Math.floor(v) + (f > 0.55 || (f > 0.4 && bayer(x + i, y + j) < 0.5) ? 1 : 0);
      s.px(x + i, y + j, ramp[Math.max(0, Math.min(ramp.length - 1, k))]);
    }
  }
}
function ball(s: Surface, cx: number, cy: number, r: number, ramp: Col[], amb = 1, dif = 5, spec?: Col) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = (x * x + y * y) / (r * r + 0.5);
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    const l = Math.max(0, (-x / r) * 0.45 + (-y / r) * 0.55 + nz * 0.7);
    const v = amb + l * dif;
    s.px(cx + x, cy + y, ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(v)))]);
    if (spec && l > 1.02) s.px(cx + x, cy + y, spec);
  }
}

const painters: Record<string, Painter> = {
  ration(s) {
    cylV(s, 3, 5, 14, 13, M, 2, 5);
    s.hline(3, 16, 5, M[8]); s.hline(3, 16, 17, M[2]);
    s.rect(3, 8, 14, 7, R[4]); s.hline(3, 16, 8, R[6]); s.hline(3, 16, 14, R[2]);
    text(s, 'HX', 5, 9, PA[5], TINY);
    s.rect(13, 10, 2, 2, PA[4]);
    s.ellipse(9, 4, 7, 1, M[6]); s.hline(4, 15, 4, M[7]);
    s.px(14, 6, M[2]); s.px(13, 7, M[4]); s.px(14, 7, M[3]); // dent
  },
  noodles(s) {
    s.poly([[2, 4], [18, 4], [16, 19], [4, 19]], A[5]);
    for (let y = 4; y < 19; y++) for (let x = 2; x < 19; x++) if (s.get(x, y) === A[5] && x > 12) s.px(x, y, A[4]);
    s.rect(3, 8, 14, 6, B[3]); s.hline(3, 16, 8, B[4]);
    text(s, 'HOT', 5, 9, A[6], TINY);
    s.ellipse(10, 4, 7, 2, PA[4]); s.hline(5, 15, 3, PA[5]);
    s.line(14, 3, 17, 1, PA[3]); // pull tab
    s.hline(6, 13, 16, A[3]);
  },
  stim(s) {
    // auto-injector pen, diagonal
    for (let k = 0; k < 14; k++) {
      const x = 3 + k, y = 16 - k;
      s.px(x, y, T[6]); s.px(x + 1, y, T[4]); s.px(x, y - 1, T[7]); s.px(x + 1, y + 1, T[2]);
    }
    for (let k = 4; k < 9; k++) { const x = 3 + k, y = 16 - k; s.px(x, y, A[5]); s.px(x + 1, y, A[4]); s.px(x, y - 1, A[6]); }
    s.px(4, 17, B[4]); s.px(3, 18, B[4]); // red cap
    s.line(17, 2, 18, 1, M[7]); // needle
    s.px(10, 10, P.neonCyan);
  },
  o2(s, _w, h) {
    cylV(s, 5, 6, 10, h - 9, C, 2.4, 5);
    s.hline(5, 14, 6, C[8]);
    s.rect(5, 14, 10, 6, A[3]); s.hline(5, 14, 14, A[5]); s.hline(5, 14, 19, A[1]);
    text(s, 'O2', 7, 15, M[1], TINY);
    s.rect(8, 2, 4, 4, M[4]); s.hline(8, 11, 2, M[7]); s.rect(6, 3, 8, 1, M[5]); // valve
    s.circle(10, 27, 3, M[1]); s.circle(10, 27, 2, PA[4]); s.px(11, 26, B[4]); // gauge
    s.hline(6, 13, h - 4, M[2]);
    for (let y = 22; y < 34; y += 5) s.px(6, y, C[3]);
  },
  filters(s) {
    for (let k = 0; k < 3; k++) {
      const cx = 6 + k * 4, cy = 14 - k * 4;
      ball(s, cx, cy, 5, M, 1, 4);
      s.circle(cx, cy, 2, M[2]);
      s.px(cx, cy, k === 2 ? M[1] : M[5]);
      s.px(cx - 1, cy - 1, M[6]);
    }
    s.px(15, 6, R[3]); s.px(14, 7, R[3]); // grime on the used one
  },
  pistol(s) {
    // slide + barrel
    s.rect(4, 4, 30, 7, M[3]);
    s.hline(4, 33, 4, M[6]); s.hline(4, 33, 5, M[5]); s.hline(4, 33, 10, M[1]);
    for (let x = 22; x < 31; x += 2) s.vline(x, 5, 8, M[2]); // serrations
    s.rect(33, 5, 3, 4, M[2]); s.px(35, 6, M[0]);
    // frame and trigger guard
    s.rect(8, 11, 20, 3, M[2]); s.hline(8, 27, 11, M[4]);
    s.ring(22, 14, 3, M[2]); s.px(21, 14, M[4]);
    // grip, taped
    s.poly([[8, 11], [16, 11], [15, 19], [7, 19]], M[1]);
    for (let y = 12; y < 19; y += 2) s.hline(8, 15, y, A[1]);
    s.hline(8, 15, 13, A[2]);
    s.px(5, 3, M[4]); s.px(32, 3, M[4]); // sights
    s.px(14, 7, M[2]); s.px(15, 7, M[2]); s.px(16, 7, M[2]); // ground serial
  },
  drill(s) {
    // core drill bit: long tube with a toothed crown, lying diagonal
    for (let k = 0; k < 28; k++) {
      const x = 4 + k, y = 32 - k;
      for (let t = -3; t <= 3; t++) {
        const c = t < -1 ? M[6] : t < 1 ? M[4] : t < 3 ? M[2] : M[1];
        s.px(x + t, y + t, c);
      }
    }
    for (let k = 4; k < 24; k += 5) { const x = 4 + k, y = 32 - k; s.line(x - 3, y - 3, x + 3, y + 3, M[1]); }
    // crown teeth
    for (let t = -4; t <= 4; t += 2) { s.px(32 + t, 3 + t, A[5]); s.px(33 + t, 2 + t, A[6]); }
    s.px(30, 1, M[0]); s.px(36, 7, M[0]); // sheared teeth
    // shank
    s.rect(2, 32, 6, 6, M[3]); s.hline(2, 7, 32, M[6]);
    // mud
    for (let k = 0; k < 18; k++) if (hash2(k, 1, 4) > 0.5) s.px(14 + k, 22 - k + (k % 3), R[2]);
  },
  eye(s) {
    // optic implant: eyeball with a ribbed rear housing and a torn optic lead
    ball(s, 10, 9, 7, [PA[1], PA[2], PA[3], PA[4], PA[5], P.white], 1, 5);
    s.circle(8, 8, 4, B[4]); s.circle(8, 8, 2, B[2]); s.px(8, 8, P.black); s.px(8, 9, P.black); s.px(7, 7, P.white); s.px(6, 6, PA[5]);
    s.ring(8, 8, 4, B[1]);
    s.px(13, 6, B[3]); s.px(14, 8, B[3]); s.px(13, 12, B[2]); // veins
    s.rect(13, 10, 5, 5, M[3]); s.hline(13, 17, 10, M[6]); s.vline(15, 10, 14, M[1]);
    s.line(17, 14, 18, 18, M[1]); s.line(16, 15, 15, 18, B[3]); // leads
    s.px(15, 18, B[2]); s.px(12, 15, SK[3]); s.px(13, 16, B[2]); // tissue
  },
  arm(s) {
    // salvage forearm lying across, hand curled at the right
    cylH(s, 4, 10, 30, 12, M, 1.4, 5);
    s.hline(4, 33, 10, M[7]);
    for (let x = 8; x < 32; x += 6) { s.vline(x, 11, 20, M[1]); s.vline(x + 1, 11, 20, M[5]); }
    s.rect(14, 22, 16, 3, M[2]); s.hline(14, 29, 22, M[5]); // piston underneath
    s.rect(14, 12, 10, 6, M[2]); s.frame(14, 12, 10, 6, M[1]); s.rect(16, 14, 6, 2, M[5]); // blank registration plate
    // elbow joint
    ball(s, 5, 16, 6, M, 1, 5, M[9]); s.ring(5, 16, 3, M[1]); s.circle(5, 16, 1, M[2]);
    // wrist + hand
    s.rect(34, 12, 4, 9, M[2]);
    s.rect(38, 9, 12, 13, M[4]); s.hline(38, 49, 9, M[7]); s.vline(49, 9, 21, M[2]);
    for (let f = 0; f < 4; f++) {
      const fy = 10 + f * 3;
      for (let k = 0; k < 8; k++) s.px(50 + k, fy + (k > 4 ? 1 : 0), k % 3 === 2 ? M[2] : M[5]);
      s.px(57, fy + 2, M[1]);
    }
    s.line(40, 22, 44, 27, M[3]); s.px(44, 27, M[5]); // thumb
    // cables from the stump
    s.line(0, 18, 4, 22, B[3]); s.line(1, 21, 5, 24, T[4]); s.px(0, 25, A[5]);
    s.px(26, 18, R[3]); s.px(27, 19, R[3]); s.px(11, 20, R[2]);
  },
  hand(s) {
    // dead prosthetic hand, open, palm up, cover cracked and wires showing
    s.rect(4, 26, 12, 12, M[2]); s.hline(4, 15, 26, M[5]); // wrist cuff
    for (let y = 30; y < 38; y += 3) s.hline(5, 14, y, M[1]);
    // palm
    for (let y = 14; y < 28; y++) for (let x = 3; x < 19; x++) {
      const nx = (x - 11) / 8, ny = (y - 21) / 7;
      if (nx * nx + ny * ny > 1.1) continue;
      s.px(x, y, nx < -0.2 && ny < 0 ? M[6] : nx < 0.4 ? M[4] : M[3]);
    }
    // cracked open cover showing burnt wiring
    s.rect(8, 18, 7, 6, M[0]);
    s.line(8, 19, 14, 22, B[3]); s.line(8, 21, 13, 19, A[3]); s.line(9, 23, 14, 20, T[4]);
    s.px(11, 20, P.black); s.px(12, 21, M[1]); s.px(10, 22, R[1]); // scorch
    s.line(15, 17, 18, 13, M[1]);
    // fingers
    const fing = (x: number, len: number, bend: number) => {
      for (let k = 0; k < len; k++) {
        const fx = x + (k > len - 4 ? bend : 0), fy = 13 - k;
        s.px(fx, fy, k % 4 === 3 ? M[1] : M[5]); s.px(fx + 1, fy, M[3]); s.px(fx + 2, fy, M[2]);
      }
    };
    fing(3, 9, -1); fing(7, 11, 0); fing(11, 10, 0); fing(15, 8, 1);
    s.line(19, 22, 25, 16, M[4]); s.line(20, 23, 26, 17, M[2]); // thumb
    s.px(31, 30, R[3]); // loose screw
    s.rect(28, 28, 2, 2, M[5]); s.px(28, 28, M[7]);
    s.line(16, 30, 22, 34, B[2]); s.line(16, 32, 24, 36, T[3]); // dangling wires
  },
  locket(s) {
    // chain coil + oval locket
    for (let k = 0; k < 18; k++) { const a = k * 0.55; s.px(5 + Math.round(Math.cos(a) * (2 + k * 0.15)), 6 + Math.round(Math.sin(a) * (2 + k * 0.12)), k % 2 ? M[7] : M[5]); }
    ball(s, 12, 12, 6, [M[2], M[4], M[6], M[7], M[8], M[9]], 1, 4.5, P.white);
    s.ring(12, 12, 6, M[3]);
    s.ring(12, 12, 4, M[6]); s.px(11, 11, M[4]); s.px(13, 13, M[4]);
    s.px(12, 6, M[8]); s.px(12, 5, M[6]);
  },
  spike(s) {
    // corporate data spike: black chassis, red light, halcyon tag
    s.poly([[3, 14], [13, 4], [17, 8], [7, 18]], M[1]);
    s.line(3, 14, 13, 4, M[4]); s.line(4, 14, 13, 5, M[3]);
    s.line(13, 4, 17, 8, M[5]);
    s.poly([[14, 3], [17, 1], [19, 3], [17, 6]], A[4]); s.px(17, 2, A[6]); // gold contacts
    s.px(9, 11, P.neonRed); s.px(10, 10, B[4]);
    s.rect(5, 15, 4, 3, B[3]); s.px(6, 16, PA[5]); // property tag
    s.line(2, 16, 1, 19, B[2]);
  },
  vel(s) {
    // raw vel shard: violet crystal cluster, inner light
    const shard = (pts: number[][], c0: Col, c1: Col, c2: Col) => {
      s.poly(pts, c0);
      s.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], c2);
      s.line(pts[1][0], pts[1][1], pts[2][0], pts[2][1], c1);
    };
    shard([[6, 17], [8, 3], [12, 16]], V[3], V[4], V[6]);
    shard([[10, 18], [15, 6], [17, 17]], V[2], V[3], V[5]);
    shard([[3, 18], [4, 10], [8, 18]], V[2], V[3], V[5]);
    s.vline(8, 6, 14, V[6]); s.px(9, 9, P.white); s.px(14, 10, V[6]);
    s.hline(2, 17, 18, P.rust[1]); s.hline(4, 15, 19, M[1]); // rock matrix
  },
  bundle(s) {
    // rag-wrapped bundle tied with wire, violet light leaking through the weave
    for (let y = 1; y < 20; y++) for (let x = 1; x < 39; x++) {
      const lump = Math.sin(x * 0.35) * 2 + Math.cos(x * 0.9) * 1;
      const nx = (x - 20) / 19, ny = (y - 11 - lump * 0.3) / (8 + lump * 0.4);
      if (nx * nx + ny * ny > 1) continue;
      const fold = Math.sin(x * 0.6 + y * 0.45) > 0.55 ? -1 : 0;
      const v = 2.2 + (ny < -0.3 ? 1.6 : ny > 0.45 ? -1.2 : 0) + (nx < -0.5 ? 0.4 : nx > 0.6 ? -0.6 : 0) + fold;
      s.px(x, y, PA[Math.max(0, Math.min(5, Math.round(v)))]);
    }
    for (let x = 4; x < 37; x++) if (hash2(x, 3, 1) > 0.55) s.px(x, 11 + Math.round(Math.sin(x * 0.5)), PA[1]);
    for (const wx of [12, 27]) { for (let y = 2; y < 20; y++) if (s.get(wx, y)) { s.px(wx, y, M[6]); s.px(wx + 1, y, M[2]); } }
    s.px(13, 1, M[5]); s.px(14, 0, M[6]); s.px(28, 1, M[5]); // twisted ends
    // the glow seeping through a tear
    s.rect(18, 8, 5, 4, P.vel[3]); s.rect(19, 9, 3, 2, P.vel[5]); s.px(20, 9, P.vel[6]);
    s.px(17, 10, PA[1]); s.px(23, 9, PA[1]); s.px(24, 12, P.vel[4]); s.px(16, 13, P.vel[3]);
    s.px(7, 15, B[2]); s.px(8, 16, B[1]); s.px(6, 16, B[1]); // a stain
  },
};

const cache = new Map<string, Surface>();
/** Sprite for an item at grid scale (w*CELL x h*CELL), outlined. */
export function itemSprite(id: string): Surface {
  let s = cache.get(id);
  if (s) return s;
  const def = ITEMS[id];
  s = new Surface(def.w * CELL, def.h * CELL);
  painters[id]?.(s, def.w * CELL, def.h * CELL);
  s.outline(P.black);
  s.flush();
  cache.set(id, s);
  return s;
}
