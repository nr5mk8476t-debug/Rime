// Detailed shop props, painted into the static room layer.
// Screens are painted as dark glass here; their live contents are drawn by the scene each frame.

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { hash2, fbm, Rng } from '../engine/rng';
import { shade, lightAt, grime, rivet, rustStreak, scratches } from './paint';
import { text, TINY } from '../engine/font';
import { cable } from './room';

const T = P.teal, M = P.metal, R = P.rust, A = P.amber, C = P.cold, PA = P.paper, B = P.blood;

/** Painted metal box with light field, bevel and grime. */
function box(s: Surface, x: number, y: number, w: number, h: number, ramp: Col[], base: number, seed: number) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const L = lightAt(i, j);
    let v = base + L.v * 1.1 + grime(i, j, seed) * 0.5;
    if (j === y) v += 1.6; else if (i === x) v += 0.9;
    if (j === y + h - 1) v -= 1.5; else if (i === x + w - 1) v -= 0.9;
    s.px(i, j, shade(ramp, v, i, j));
  }
}

/** Screen recess: dark glass with a faint reflection streak. */
export const SCREENS = {
  day: { x: 114, y: 36, w: 76, h: 30 },
  register: { x: 146, y: 136, w: 46, h: 11 },
  terminal: { x: 452, y: 112, w: 58, h: 42 },
  scanner: { x: 544, y: 146, w: 34, h: 18 },
};

function glass(s: Surface, r: { x: number; y: number; w: number; h: number }, tint: Col[]) {
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) {
    const cx = (i - r.x) / r.w - 0.5, cy = (j - r.y) / r.h - 0.5;
    const v = 1.1 - (cx * cx + cy * cy) * 2.2;
    s.px(i, j, shade(tint, v, i, j));
  }
  // reflection streak
  for (let k = 0; k < Math.min(r.w, r.h) - 4; k++) if (bayer(r.x + 3 + k, r.y + 2 + k) < 0.5) s.px(r.x + r.w - 6 - k, r.y + 2 + Math.floor(k / 2), tint[2]);
}

function dayDisplay(s: Surface) {
  const r = SCREENS.day;
  // bolted housing with conduit
  box(s, r.x - 6, r.y - 6, r.w + 12, r.h + 14, M, 2.2, 201);
  s.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, M[0]);
  glass(s, r, [A[0], hex2('#1e1408'), A[1], A[2]]);
  for (const [x, y] of [[r.x - 4, r.y - 4], [r.x + r.w + 2, r.y - 4], [r.x - 4, r.y + r.h + 4], [r.x + r.w + 2, r.y + r.h + 4]]) rivet(s, x, y, M[7], M[1]);
  text(s, 'TENANCY 4C', r.x, r.y + r.h + 3, M[1], TINY);
  rustStreak(s, r.x + r.w - 6, r.y + r.h + 8, 16, 3);
  cable(s, r.x + r.w + 6, r.y + 4, r.x + r.w + 30, 2, 6, M[1]);
}

function hex2(h: string): Col { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0; }

function register(s: Surface) {
  // battered cash register sitting on the counter's left end
  const x = 138, y = 126;
  // body (sloped front)
  const L0 = (i: number, j: number) => lightAt(i, j).v;
  for (let j = y; j < 178; j++) for (let i = x; i < x + 64; i++) {
    const slope = j > 152 ? 0 : Math.max(0, 6 - Math.floor((j - y) / 4));
    if (i < x + slope || i > x + 63 - slope * 0.4) continue;
    let v = 2.4 + L0(i, j) * 1.1 + grime(i, j, 211) * 0.6;
    if (j === y || i === x + slope) v += 1.4;
    if (i === x + 63) v -= 1.4;
    if (j >= 152 && j < 155) v -= 1.6; // drawer split
    let c = shade(T, v, i, j);
    if (fbm(i * 0.12, j * 0.12, 212) > 0.65) c = shade(R, v - 0.2, i, j);
    s.px(i, j, c);
  }
  // display recess
  const d = SCREENS.register;
  s.rect(d.x - 2, d.y - 2, d.w + 4, d.h + 4, M[0]);
  s.frame(d.x - 3, d.y - 3, d.w + 6, d.h + 6, T[6]);
  glass(s, d, [hex2('#140707'), hex2('#1d0909'), B[1], B[2]]);
  // keypad
  for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 6; kx++) {
    const bx = x + 10 + kx * 8, by = 155 - 0 + ky * 0, yy = 128 + 0;
    void by; void yy;
  }
  for (let ky = 0; ky < 2; ky++) for (let kx = 0; kx < 7; kx++) {
    const bx = x + 8 + kx * 7, by = 156 + ky * 6;
    const worn = hash2(kx, ky, 5) > 0.7;
    s.bevel(bx, by, 6, 5, worn ? PA[2] : PA[3], PA[5], M[1]);
    s.px(bx + 2, by + 2, M[2]);
  }
  // big no-sale key
  s.bevel(x + 50, by2(), 8, 11, B[2], B[4], B[0]);
  // drawer face
  s.hline(x + 2, x + 62, 170, T[1]);
  s.rect(x + 26, 172, 12, 2, M[2]);
  s.hline(x + 26, x + 37, 172, M[6]);
  // crank handle on the side
  s.rect(x + 63, 150, 3, 2, M[4]); s.vline(x + 66, 146, 154, M[5]); s.rect(x + 65, 144, 3, 3, B[3]);
  // receipt paper curling out of the top
  s.rect(x + 8, y - 2, 12, 3, M[2]);
  for (let j = 0; j < 12; j++) { s.hline(x + 9 - Math.floor(j / 4), x + 18 - Math.floor(j / 4), y - 3 - j, j % 4 === 0 ? PA[3] : PA[4]); }
  for (let j = 0; j < 12; j += 2) s.hline(x + 10 - Math.floor(j / 4), x + 15 - Math.floor(j / 4), y - 3 - j, PA[2]);
  // taped note on the front
  s.rect(x + 2, 140, 0, 0, 0);
  s.rect(x + 3, 128 + 0, 0, 0, 0);
  dent(s, x + 44, 132); dent(s, x + 12, 166); dent(s, x + 56, 160);
  scratches(s, x, y, 64, 50, 20, T[7], 21);
  // label plate
  text(s, 'TALLYMASTER', x + 9, y + 4, T[1], TINY);
  function by2() { return 155; }
}

function dent(s: Surface, x: number, y: number) {
  s.px(x, y, M[1]); s.px(x + 1, y, M[2]); s.px(x - 1, y + 1, M[2]); s.px(x, y + 1, M[6]); s.px(x + 1, y + 1, M[7]);
}

function mug(s: Surface) {
  const x = 112, y = 162;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 9; i++) {
    const v = 2.6 + (i < 3 ? 1 : i > 6 ? -0.8 : 0) + lightAt(x + i, y + j).v * 0.6;
    s.px(x + i, y + j, shade(R, v, x + i, y + j));
  }
  s.hline(x, x + 8, y, M[0]); s.hline(x + 1, x + 7, y + 1, hex2('#24140c'));
  s.ring(x + 10, y + 5, 2, R[3]);
  text(s, '#1', x + 2, y + 5, PA[4], TINY);
  s.hline(x - 1, x + 10, y + 12, M[1]);
}

function noticeBoard(s: Surface) {
  const x = 10, y = 30, w = 92, h = 98;
  // frame
  box(s, x, y, w, h, M, 1.6, 301);
  // cork
  for (let j = y + 4; j < y + h - 4; j++) for (let i = x + 4; i < x + w - 4; i++) {
    const L = lightAt(i, j);
    const v = 1.6 + L.v * 1.2 + (hash2(i, j, 7) - 0.5) * 1.6;
    s.px(i, j, L.warm > 0.4 && bayer(i, j) < 0.4 ? shade(R, v + 0.4, i, j) : shade(A, v - 0.2, i, j));
  }
  const pin = (px: number, py: number, c: Col) => { s.px(px, py, c); s.px(px + 1, py, c); s.px(px, py - 1, c); s.px(px + 1, py + 1, M[0]); };

  // 1. corporate curfew order (top-left), clean paper, red bar
  paper(s, x + 6, y + 6, 38, 34, PA, 0.4, 1);
  s.rect(x + 7, y + 7, 36, 6, B[3]);
  text(s, 'HALCYON', x + 10, y + 8, PA[5], TINY);
  text(s, 'CURFEW', x + 9, y + 15, B[2], TINY);
  text(s, '22:00', x + 9, y + 21, M[2], TINY);
  for (let k = 0; k < 4; k++) s.hline(x + 9, x + 38 - (k % 2) * 6, y + 28 + k * 2, PA[2]);
  pin(x + 24, y + 7, P.neonRed);

  // 2. WANTED sheet with two mugshots (top-right)
  paper(s, x + 48, y + 5, 38, 44, PA, 0.2, 2);
  text(s, 'WANTED', x + 53, y + 8, M[1], TINY);
  mugshot(s, x + 51, y + 15, 0); mugshot(s, x + 68, y + 15, 1);
  text(s, '400', x + 52, y + 35, B[3], TINY); text(s, '1500', x + 68, y + 35, B[3], TINY);
  for (let k = 0; k < 3; k++) s.hline(x + 52, x + 82, y + 42 + k * 2, PA[2]);
  pin(x + 66, y + 6, P.neonCyan);

  // 3. union flyer (bottom-left), amber, torn and re-pinned
  paper(s, x + 5, y + 46, 34, 40, [A[1], A[2], A[3], A[4], A[5], A[6]], 0.9, 3);
  text(s, 'LOCAL 7', x + 8, y + 50, R[1], TINY);
  // raised fist (union mark)
  const fx = x + 16, fy = y + 58;
  s.rect(fx, fy + 3, 9, 7, R[1]); s.rect(fx + 2, fy + 10, 5, 6, R[1]);
  for (let k = 0; k < 4; k++) s.rect(fx + k * 2 + 1, fy + 1, 2, 3, R[1]);
  s.hline(fx + 1, fx + 8, fy + 6, A[3]);
  text(s, 'WE DIG', x + 9, y + 76, R[1], TINY);
  // torn diagonal corner
  for (let k = 0; k < 8; k++) for (let j = 0; j <= k; j++) s.px(x + 38 - j, y + 46 + (7 - k), shade(A, 1.8, x, y));
  pin(x + 21, y + 47, P.neonAmber);

  // 4. polaroid of a family (personal, crooked)
  const px = x + 44, py = y + 54;
  for (let j = 0; j < 26; j++) for (let i = 0; i < 22; i++) {
    const xx = px + i + Math.floor(j / 9), yy = py + j;
    const inPic = i > 1 && i < 20 && j > 1 && j < 19;
    s.px(xx, yy, inPic ? (j < 9 ? shade(C, 2.5 + j * 0.1, xx, yy) : shade(C, 1.5, xx, yy)) : PA[4]);
  }
  // three figures in the photo
  for (const [fxo, fh] of [[6, 11], [11, 13], [15, 7]]) {
    const xx = px + fxo + 1, top = py + 19 - fh;
    s.rect(xx, top + 3, 3, fh - 3, R[2]); s.rect(xx, top, 3, 3, P.skin[4]);
  }
  text(s, 'M+J', px + 6, py + 20, M[2], TINY);
  pin(px + 10, py + 1, P.neonRed);

  // 5. receipt strips & a business card
  s.rect(x + 70, y + 52, 14, 8, PA[1]); s.hline(x + 71, x + 82, y + 54, PA[3]); text(s, 'BOOT', x + 71, y + 55, T[1], TINY);
  for (let j = 0; j < 30; j++) s.hline(x + 82, x + 86, y + 62 + j, j % 3 === 0 ? PA[2] : PA[4]);
  pin(x + 84, y + 62, P.neonCyan);
}

function paper(s: Surface, x: number, y: number, w: number, h: number, ramp: Col[], age: number, seed: number) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const L = lightAt(i, j);
    let v = 3.2 + L.v * 0.7 - age * fbm(i * 0.15, j * 0.15, seed) * 2.2 + (hash2(i, j, seed) - 0.5) * 0.5;
    s.px(i, j, shade(ramp, v, i, j));
  }
  // curled bottom edge shadow + stain
  s.hline(x + 1, x + w, y + h, M[0]);
  s.vline(x + w, y + 1, y + h, M[0]);
}

function mugshot(s: Surface, x: number, y: number, kind: number) {
  s.rect(x, y, 14, 18, kind ? C[4] : M[5]);
  const sk = kind ? P.skin : P.pale;
  // shoulders
  s.rect(x + 1, y + 14, 12, 4, M[1]);
  // head
  s.ellipse(x + 7, y + 8, 4, 5, sk[3]);
  for (let j = 0; j < 10; j++) s.px(x + 10, y + 4 + j, sk[2]);
  s.px(x + 5, y + 8, M[0]); s.px(x + 9, y + 8, M[0]);
  s.hline(x + 6, x + 8, y + 11, sk[1]);
  if (kind === 0) { s.rect(x + 3, y + 2, 9, 3, M[0]); s.px(x + 9, y + 8, B[4]); } // cap, cyber eye
  else { s.hline(x + 3, x + 11, y + 3, sk[1]); s.line(x + 4, y + 6, x + 7, y + 12, B[2]); } // scar
}

function fan(s: Surface) {
  const cx = 470, cy = 52, r = 22;
  box(s, cx - r - 4, cy - r - 4, r * 2 + 9, r * 2 + 9, M, 2, 401);
  s.circle(cx, cy, r, M[0]);
  s.ring(cx, cy, r, M[5]); s.ring(cx, cy, r - 1, M[1]);
  for (const [x, y] of [[cx - r - 2, cy - r - 2], [cx + r + 2, cy - r - 2], [cx - r - 2, cy + r + 2], [cx + r + 2, cy + r + 2]]) rivet(s, x, y, M[7], M[1]);
  rustStreak(s, cx - 4, cy + r + 5, 14, 9);
  rustStreak(s, cx + 9, cy + r + 5, 8, 10);
}
/** Fan grille drawn over the animated blades. */
export function fanGrille(s: Surface) {
  const cx = 470, cy = 52, r = 22;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d > r - 1) continue;
    if (Math.abs(d - 8) < 0.6 || Math.abs(d - 15) < 0.6 || Math.abs(d - 20) < 0.6 || x === 0 || y === 0) s.px(cx + x, cy + y, y < 0 ? M[6] : M[5]);
  }
  s.circle(cx, cy, 3, M[4]); s.px(cx - 1, cy - 1, M[7]);
}

function junction(s: Surface) {
  const x = 504, y = 34;
  box(s, x, y, 30, 40, T, 2.4, 501);
  s.hline(x + 2, x + 27, y + 20, T[1]);
  text(s, '440V', x + 6, y + 6, A[4], TINY);
  // hazard triangle
  s.poly([[x + 15, y + 24], [x + 22, y + 36], [x + 8, y + 36]], A[4]);
  s.vline(x + 15, y + 28, y + 32, M[0]); s.px(x + 15, y + 34, M[0]);
  // cables down to terminal and scanner, one up into the ceiling
  cable(s, x + 6, y + 40, 478, 106, 6, M[0], M[2]);
  cable(s, x + 20, y + 40, 590, 122, 10, M[0], T[2]);
  cable(s, x + 26, y + 40, 640, 96, 18, R[1]);
  cable(s, x + 12, y, x + 6, 14, 2, M[0]);
  cable(s, x + 24, y, x + 40, 12, 3, B[1]);
  // patch of electrical tape
  s.rect(x + 10, y + 54, 4, 2, A[2]);
}

function poster(s: Surface) {
  const x = 548, y = 22, w = 80, h = 100;
  // propaganda: HALCYON - WORK IS WARMTH
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const L = lightAt(i, j);
    const t = (j - y) / h;
    let v = 1.6 + (1 - t) * 1.6 + L.v * 0.6 + (fbm(i * 0.1, j * 0.1, 601) - 0.5) * 1.4;
    s.px(i, j, shade(R, v, i, j));
  }
  // rays behind the ship
  for (let j = y + 8; j < y + 64; j++) for (let i = x + 2; i < x + w - 2; i++) {
    const a = Math.atan2(j - (y + 52), i - (x + 40));
    if (Math.floor((a + 3.2) * 4) % 2 === 0 && bayer(i, j) < 0.5) s.px(i, j, A[3]);
  }
  // sun disc
  s.circle(x + 40, y + 52, 15, A[5]);
  s.dither(x + 25, y + 37, 31, 31, A[4], 0.4);
  for (let j = y + 37; j < y + 68; j++) for (let i = x + 25; i < x + 56; i++) if (s.get(i, j) === A[4] && ((i - x - 40) ** 2 + (j - y - 52) ** 2) > 225) s.px(i, j, shade(R, 2.5, i, j));
  // ship silhouette over the sun
  s.poly([[x + 8, y + 54], [x + 20, y + 48], [x + 70, y + 47], [x + 74, y + 54], [x + 64, y + 58], [x + 16, y + 58]], R[0]);
  for (let k = 0; k < 8; k++) s.rect(x + 22 + k * 6, y + 44 - (k % 3) * 3, 4, 6 + (k % 3) * 3, R[0]);
  s.vline(x + 44, y + 32, y + 46, R[0]);
  // stylised workers below
  for (let k = 0; k < 5; k++) { const wx = x + 10 + k * 14; s.rect(wx, y + 66, 6, 10, R[1]); s.rect(wx + 1, y + 63, 4, 4, R[1]); s.line(wx + 6, y + 66, wx + 9, y + 60, R[1]); }
  // text panel
  s.rect(x + 3, y + 78, w - 6, 19, PA[4]);
  s.dither(x + 3, y + 78, w - 6, 19, PA[3], 0.3);
  text(s, 'WORK IS', x + 21, y + 80, R[1], TINY);
  text(s, 'WARMTH', x + 23, y + 87, B[3], TINY);
  text(s, 'HALCYON EXTRACTION', x + 5, y + 94, M[2], TINY);
  // graffiti over it: LIARS, sprayed in dried red
  const g = (gx: number, gy: number) => { s.px(gx, gy, B[3]); if (hash2(gx, gy, 3) > 0.4) s.px(gx + 1, gy, B[2]); if (hash2(gx, gy, 4) > 0.8) for (let k = 1; k < 5; k++) s.px(gx, gy + k, B[2]); };
  const L = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 5]];
  const I = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]];
  const Ar = [[1, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [1, 3], [2, 3], [0, 4], [2, 4], [0, 5], [2, 5]];
  const Rr = [[0, 0], [1, 0], [0, 1], [2, 1], [0, 2], [1, 2], [0, 3], [2, 3], [0, 4], [2, 4], [0, 5], [2, 5]];
  const S = [[1, 0], [2, 0], [0, 1], [1, 2], [2, 3], [2, 4], [0, 5], [1, 5]];
  let ox = x + 14;
  for (const glyph of [L, I, Ar, Rr, S]) {
    for (const [gx, gy] of glyph) g(ox + gx * 2, y + 14 + gy * 2 + Math.floor((ox - x) / 12));
    ox += glyph === I ? 5 : 9;
  }
  // torn corner, tape
  for (let k = 0; k < 10; k++) for (let j = 0; j < 10 - k; j++) s.px(x + w - 1 - j, y + h - 1 - k, shade(T, 2 + lightAt(x + w, y + h).v, x + w - j, y + h - k));
  s.rect(x - 2, y - 1, 8, 3, PA[3]); s.rect(x + w - 6, y - 1, 8, 3, PA[3]);
}

function cctv(s: Surface) {
  const x = 606, y = 12;
  s.rect(x + 10, 6, 3, 8, M[2]);
  s.poly([[x, y + 4], [x + 22, y], [x + 26, y + 6], [x + 4, y + 11]], M[3]);
  s.line(x, y + 4, x + 22, y, M[6]);
  s.poly([[x - 3, y + 5], [x + 2, y + 4], [x + 4, y + 10], [x - 1, y + 11]], M[1]);
  s.px(x - 1, y + 7, M[7]);
  text(s, 'SEC', x + 9, y + 4, M[1], TINY);
}

function terminal(s: Surface) {
  const r = SCREENS.terminal;
  const x = r.x - 8, y = r.y - 8, w = r.w + 16, h = r.h + 18;
  // CRT case: sun-yellowed plastic gone grey
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const L = lightAt(i, j);
    const edge = j === y ? 1.4 : i === x ? 0.8 : i === x + w - 1 ? -1 : j === y + h - 1 ? -1.4 : 0;
    s.px(i, j, shade(PA, 1.4 + L.v * 0.9 + edge + grime(i, j, 701) * 0.6, i, j));
  }
  s.rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, M[0]);
  s.frame(r.x - 4, r.y - 4, r.w + 8, r.h + 8, PA[1]);
  glass(s, r, [hex2('#050d0b'), T[0], T[1], T[2]]);
  // badge, vents, power LED
  text(s, 'K-NET', x + 4, y + h - 7, PA[1], TINY);
  for (let k = 0; k < 5; k++) s.hline(x + w - 22, x + w - 6, y + h - 8 + (k % 2), PA[1]);
  // stand
  box(s, x + 20, y + h, 30, 6, PA, 1.4, 702);
  // sticker
  s.rect(x + w - 14, y + 2, 9, 5, B[3]); text(s, '!', x + w - 10, y + 2, PA[5], TINY);
  // keyboard on the counter
  const kx = 446, ky = 176;
  s.poly([[kx + 2, ky], [kx + 70, ky], [kx + 74, ky + 14], [kx - 2, ky + 14]], PA[1]);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 13; k++) {
    const bx = kx + 1 + k * 5 + row, by = ky + 2 + row * 4;
    s.rect(bx, by, 4, 3, hash2(k, row, 3) > 0.85 ? PA[1] : PA[3]);
    s.hline(bx, bx + 3, by, PA[4]);
  }
  s.rect(kx + 18, ky + 14 - 2, 34, 0, 0);
  cable(s, kx + 36, ky, kx + 34, y + h + 2, 3, M[0]);
}

function scanner(s: Surface) {
  // SPECTRA bench scanner: inspection results appear on its readout
  const x = 534, y = 136, w = 92, h = 40;
  box(s, x, y, w, h, T, 2.2, 801);
  s.hline(x, x + w - 1, y + h, M[0]);
  // readout
  const r = SCREENS.scanner;
  s.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, M[0]);
  glass(s, r, [hex2('#04100c'), T[0], T[1], T[2]]);
  // analog gauge
  const gx = x + 60, gy = y + 18;
  s.circle(gx, gy, 9, M[0]); s.circle(gx, gy, 8, PA[4]);
  s.dither(gx - 8, gy - 8, 17, 17, PA[3], 0.3);
  for (let a = 0; a < 7; a++) { const ang = Math.PI * (0.8 + a * 0.23); s.px(gx + Math.round(Math.cos(ang) * 7), gy + Math.round(Math.sin(ang) * 7), M[1]); }
  s.px(gx + 6, gy - 4, B[3]); s.px(gx + 7, gy - 3, B[3]);
  // toggle switches
  for (let k = 0; k < 3; k++) { s.rect(x + 74 + k * 5, y + 28, 3, 6, M[1]); s.rect(x + 74 + k * 5, y + 27 - (k === 1 ? 0 : -3), 3, 3, M[6]); }
  text(s, 'SPECTRA II', x + 6, y + 4, T[1], TINY);
  // articulated magnifier folded down on top of the unit
  s.line(x + 84, y - 1, x + 74, y - 9, M[2]); s.line(x + 85, y - 1, x + 75, y - 9, M[5]);
  s.rect(x + 82, y - 3, 4, 3, M[3]);
  s.ellipse(x + 66, y - 10, 10, 3, M[1]);
  s.ellipse(x + 66, y - 10, 9, 2, C[4]);
  s.hline(x + 60, x + 70, y - 11, C[7]); s.px(x + 62, y - 10, C[8]);
  s.ring(x + 66, y - 10, 10, M[4]);
  scratches(s, x, y, w, h, 16, T[7], 802);
}

function heater(s: Surface) {
  const x = 22, y = 290, w = 56, h = 54;
  box(s, x, y, w, h, M, 1.8, 901);
  s.rect(x + 4, y + 6, w - 8, h - 14, M[0]);
  // feet
  s.rect(x + 4, y + h, 6, 4, M[1]); s.rect(x + w - 10, y + h, 6, 4, M[1]);
  text(s, 'THERMA', x + 4, y + h - 7, M[1], TINY);
  // kettle on top
  const kx = x + 18, ky = y - 14;
  s.ellipse(kx + 8, ky + 9, 9, 6, M[3]);
  s.rect(kx, ky + 9, 17, 5, M[3]);
  s.hline(kx + 1, kx + 15, ky + 4, M[6]);
  s.line(kx + 16, ky + 8, kx + 22, ky + 3, M[4]);
  s.ring(kx + 8, ky + 2, 3, M[1]);
}

function crates(s: Surface) {
  const crate = (x: number, y: number, w: number, h: number, seed: number, label: string) => {
    box(s, x, y, w, h, R, 2, seed);
    for (let k = 4; k < h - 2; k += 6) s.hline(x + 2, x + w - 3, y + k, R[1]);
    s.line(x + 2, y + 2, x + w - 3, y + h - 3, R[2]);
    text(s, label, x + 4, y + 4, P.paper[3], TINY);
  };
  crate(80, 296, 26, 46, 911, 'HX');
  crate(84, 270, 22, 26, 912, '07');
}

function locker(s: Surface) {
  const x = 106, y = 222, w = 70, h = 110;
  box(s, x, y, w, h, T, 1.4, 1001);
  s.vline(x + 35, y + 2, y + h - 2, T[0]); s.vline(x + 36, y + 2, y + h - 2, T[3]);
  for (let k = 0; k < 6; k++) { s.hline(x + 8, x + 26, y + 10 + k * 3, T[0]); s.hline(x + 44, x + 62, y + 10 + k * 3, T[0]); }
  // padlock
  s.ring(x + 37, y + 52, 2, M[5]); s.rect(x + 34, y + 53, 7, 6, A[2]); s.px(x + 37, y + 56, M[0]);
  // first aid cross sticker (peeling)
  s.rect(x + 48, y + 40, 12, 12, PA[4]); s.rect(x + 52, y + 42, 4, 8, B[3]); s.rect(x + 50, y + 44, 8, 4, B[3]);
  for (let k = 0; k < 4; k++) s.px(x + 59 - k, y + 40 + k, T[2]);
  // lead pipe leaning against it (security)
  s.line(x + 66, y + h - 2, x + 82, y + 30, M[2]); s.line(x + 67, y + h - 2, x + 83, y + 30, M[5]);
  s.rect(x + 80, y + 27, 4, 4, A[1]); // tape grip
  dent(s, x + 20, y + 70); dent(s, x + 54, y + 88);
}

function ventTower(s: Surface) {
  const x = 472, y = 228, w = 64, h = 122;
  box(s, x, y, w, h, M, 1.8, 1101);
  s.circle(x + 32, y + 34, 20, M[0]);
  s.ring(x + 32, y + 34, 20, M[5]);
  for (let k = 0; k < 9; k++) s.hline(x + 8, x + w - 9, y + 64 + k * 5, M[1]);
  for (let k = 0; k < 9; k++) s.hline(x + 8, x + w - 9, y + 65 + k * 5, M[4]);
  text(s, 'AIR', x + 26, y + 112, M[1], TINY);
  rustStreak(s, x + 12, y + 56, 30, 5); rustStreak(s, x + 50, y + 56, 20, 6);
}
export function ventGrille(s: Surface) {
  const cx = 504, cy = 262;
  for (let y = -19; y <= 19; y++) for (let x = -19; x <= 19; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d > 19) continue;
    if (Math.abs(x) % 4 === 0) s.px(cx + x, cy + y, M[4]);
  }
  s.circle(cx, cy, 4, M[3]);
}

function bedroll(s: Surface) {
  // rolled sleeping bag and a flattened mat - the shopkeeper lives here
  const x = 548, y = 288;
  for (let j = y + 30; j < 360; j++) for (let i = x - 6; i < 640; i++) {
    const v = 1.4 + lightAt(i, j).v * 0.7 + (hash2(i >> 2, j >> 2, 3) - 0.5) * 0.6;
    s.px(i, j, shade(T, v, i, j));
  }
  // roll: spiral end facing us
  const cx = 600, cy = 320, r = 32;
  for (let j = -r; j <= r; j++) for (let i = -r - 30; i <= r; i++) {
    let c: Col | null = null;
    if (i < 0 && Math.abs(j) <= r * 0.92) {
      // the barrel of the roll extends left
      const prof = j / r;
      c = shade(R, 3.2 - prof * 2.2 + Math.sin(i * 0.4) * 0.3, cx + i, cy + j);
      if ((i + 200) % 14 === 0) c = R[2];
    }
    const d = Math.sqrt(i * i + j * j);
    if (i >= 0 || d <= r) {
      if (d <= r) {
        const a = Math.atan2(j, i);
        const spiral = (d - (a + Math.PI) * 2.2) % 8;
        const s2 = ((spiral % 8) + 8) % 8;
        c = s2 < 1.4 ? R[1] : shade(R, 3.6 - d / r * 1.8 + (j < 0 ? 0.5 : 0), cx + i, cy + j);
      }
    }
    if (c) s.px(cx + i, cy + j, c);
  }
  s.ring(cx, cy, r, R[1]);
  // strap
  for (let j = -r; j <= r; j++) if (Math.abs(j) <= r * 0.92) { s.px(cx - 18, cy + j, M[1]); s.px(cx - 17, cy + j, M[3]); }
  // tin cup and empty ration tins
  s.rect(556, 338, 8, 9, M[5]); s.vline(556, 338, 346, M[7]); s.ring(565, 341, 2, M[4]);
  s.rect(570, 346, 10, 7, R[3]); s.hline(570, 579, 346, R[5]); s.rect(572, 348, 6, 3, A[3]);
}

function bulb(s: Surface) {
  // bare bulb hanging from the ceiling pipe (left)
  s.vline(128, 10, 18, M[0]);
  s.rect(126, 18, 5, 3, M[3]);
  s.ellipse(128, 24, 3, 4, A[6]);
  s.px(127, 22, P.white);
}

function wallClutter(s: Surface) {
  // pipe column at the far left with a pressure gauge
  for (let y = 14; y < 290; y++) for (let x = 0; x < 8; x++) {
    const prof = 1 - Math.abs(x - 2.5) / 4;
    s.px(x, y, shade(M, 1 + prof * 3 + lightAt(x, y).v * 0.6 + grime(x, y, 1201) * 0.4, x, y));
  }
  s.circle(5, 150, 6, M[1]); s.circle(5, 150, 5, PA[4]); s.line(5, 150, 8, 147, B[3]); s.ring(5, 150, 6, M[5]);
  // hanging cable bundles over the window posts
  cable(s, 140, 12, 206, 20, 10, M[0]);
  cable(s, 150, 13, 204, 24, 16, R[1]);
  cable(s, 436, 22, 520, 13, 9, M[0]);
  cable(s, 436, 26, 560, 14, 18, T[1]);
  // tally marks scratched into the wall (days survived by the previous tenant)
  for (let k = 0; k < 4; k++) { const bx = 112 + (k % 4) * 3 + Math.floor(k / 4) * 18; s.vline(bx, 92, 100, T[1]); s.vline(bx + 1, 93, 101, T[4]); }
  s.line(110, 99, 123, 92, T[1]);
  for (let k = 0; k < 3; k++) { s.vline(130 + k * 3, 92, 100, T[1]); s.vline(131 + k * 3, 93, 101, T[4]); }
  // a shelf with spare parts above the terminal
  const sx = 440, sy = 90;
  s.rect(sx, sy, 92, 3, M[5]); s.hline(sx, sx + 91, sy, M[7]); s.hline(sx, sx + 91, sy + 3, M[0]);
  for (const bx of [sx + 4, sx + 84]) { s.vline(bx, sy + 3, sy + 8, M[3]); s.line(bx, sy + 8, bx + 4, sy + 3, M[3]); }
  // jars and boxes on the shelf
  s.rect(sx + 10, sy - 10, 8, 10, C[4]); s.rect(sx + 10, sy - 11, 8, 2, M[2]); s.dither(sx + 11, sy - 8, 6, 7, C[6], 0.3);
  for (let k = 0; k < 3; k++) s.px(sx + 12 + k * 2, sy - 3, P.metal[7]);
  s.rect(sx + 22, sy - 7, 14, 7, PA[2]); s.hline(sx + 22, sx + 35, sy - 7, PA[4]); text(s, 'FUSE', sx + 23, sy - 5, M[2], TINY);
  s.rect(sx + 40, sy - 12, 6, 12, R[3]); s.rect(sx + 41, sy - 14, 4, 2, M[3]);
  s.rect(sx + 50, sy - 5, 10, 5, M[3]); s.ring(sx + 66, sy - 4, 3, M[5]); s.ring(sx + 74, sy - 4, 3, M[5]);
}

export function buildProps(s: Surface) {
  wallClutter(s);
  noticeBoard(s);
  dayDisplay(s);
  bulb(s);
  register(s);
  mug(s);
  fan(s);
  junction(s);
  poster(s);
  cctv(s);
  terminal(s);
  scanner(s);
  heater(s);
  crates(s);
  locker(s);
  ventTower(s);
  bedroll(s);
  void Rng;
}
