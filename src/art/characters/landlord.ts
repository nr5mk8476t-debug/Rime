// MR. ORLAN VOSS - the landlord.
// Immaculate pinstripe suit, fedora pulled low so his eyes are only two red pinpoints in shadow.
// Waxy grey skin stretched over a narrow skull. His grin is too wide: the corners were cut and
// stitched open years ago and he keeps them that way. Silver teeth. Black kid gloves. A ledger.

import { Surface, bayer } from '../../engine/surface';
import { P, hex, type Col } from '../../engine/palette';
import { hash2 } from '../../engine/rng';
import { ellipsoid, cylinderFill, silhouetteRim, lambert } from './sculpt';
import type { CharacterArt, Expression, Lids } from './types';

const M = P.metal, B = P.blood, PA = P.paper, A = P.amber, C = P.cold, R = P.rust;
const W = 132, H = 124, HX = 66;
const PL: Col[] = ['#1a1514', '#2f2623', '#4b3e38', '#6d5f54', '#938372', '#b8a892', '#dbd0bb'].map((h) => hex(h));
const SUIT: Col[] = ['#07060a', '#0f0c14', '#18131f', '#221b2b', '#2e2539', '#3d3249', '#51445f'].map((h) => hex(h));
const INK = P.black;

function inFace(x: number, y: number) {
  const dx = x - HX, dy = y - 49;
  if (dy > 6) { const half = 13.2 - (dy - 6) * 0.62; return half > 0 && Math.abs(dx) <= half; }
  return (dx * dx) / (13.4 * 13.4) + (dy * dy) / (21 * 21) <= 1;
}
function darkenIn(s: Surface, x: number, y: number, ramp: Col[], n = 1) {
  const i = ramp.indexOf(s.get(x, y));
  if (i > 0) s.px(x, y, ramp[Math.max(0, i - n)]);
}

function buildHead(): Surface {
  const s = new Surface(W, H);
  // face
  for (let y = 26; y < 72; y++) for (let x = 50; x < 83; x++) {
    if (!inFace(x, y)) continue;
    const nx = (x - HX) / 13.5, ny = (y - 49) / 22;
    const d = nx * nx + ny * ny;
    const nz = Math.sqrt(Math.max(0.05, 1 - Math.min(0.97, d)));
    let v = 1.5 + lambert(nx * 1.15, ny, nz) * 4.4;
    if (Math.abs(nx) > 0.42 && ny > 0.05 && ny < 0.45) v -= 1.3; // deep hollow cheeks
    if (ny > 0.62) v -= 0.4;
    const f = v - Math.floor(v);
    const step = f < 0.42 ? 0 : f > 0.58 ? 1 : (f - 0.42) / 0.16 > bayer(x, y) ? 1 : 0;
    s.px(x, y, PL[Math.max(0, Math.min(6, Math.floor(v) + step))]);
  }
  // brim shadow: the upper face drowns in dark, fading down to the nose
  for (let y = 26; y < 50; y++) for (let x = 48; x < 85; x++) {
    if (!inFace(x, y)) continue;
    const k = (y - 26) / 24; // 0 at brim -> 1 at nose
    const tilt = (x - HX) * 0.04; // brim lower on the right
    const dark = k + tilt < 0.45 ? 3 : k + tilt < 0.7 ? 2 : k + tilt < 0.88 ? (bayer(x, y) < 0.5 ? 1 : 2) : 0;
    if (dark) darkenIn(s, x, y, PL, dark);
  }
  // eye pits
  for (const ex of [60, 72]) for (let y = 37; y < 46; y++) for (let x = ex - 5; x <= ex + 5; x++) {
    const d = ((x - ex) / 4.6) ** 2 + ((y - 41) / 3.6) ** 2;
    if (d < 1) s.px(x, y, d < 0.35 ? P.black : d < 0.7 ? PL[0] : (s.get(x, y) ? PL[1] : 0));
  }
  // slicked black hair at the temples, ears
  for (let y = 31; y < 42; y++) { s.px(52 - Math.floor((y - 31) / 5), y, M[0]); s.px(53 - Math.floor((y - 31) / 5), y, M[1]); s.px(80 + Math.floor((y - 31) / 5), y, M[0]); s.px(79 + Math.floor((y - 31) / 5), y, M[1]); }
  ellipsoid(s, 52, 46, 2, 4, PL, { ambient: 0.8, diffuse: 3 }); ellipsoid(s, 80, 46, 2, 4, PL, { ambient: 0.4, diffuse: 3 });
  // long thin nose
  for (let y = 43; y < 56; y++) { s.px(66, y, y < 47 ? PL[2] : PL[4]); s.px(67, y, PL[2]); s.px(68, y, PL[1]); }
  s.px(65, 55, PL[5]); s.px(66, 56, PL[5]); s.hline(64, 69, 57, PL[1]); s.px(64, 56, PL[2]); s.px(69, 56, PL[0]);
  // knife-edge cheekbones
  s.line(53, 51, 59, 49, PL[5]); s.line(54, 52, 59, 50, PL[4]);
  s.line(79, 51, 74, 49, PL[3]);
  // stitched grin scars running from the mouth corners up toward the ears
  const stitchLine = (x0: number, y0: number, x1: number, y1: number) => {
    s.line(x0, y0, x1, y1, PL[1]);
    s.line(x0, y0 + 1, x1, y1 + 1, PL[3]);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 1; i < n; i += 2) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      s.px(x, y - 1, B[1]); s.px(x, y + 1, B[1]);
    }
  };
  stitchLine(52, 59, 46, 52);
  stitchLine(80, 59, 86, 52);
  // gaunt temple veins
  s.line(53, 46, 51, 50, C[3]);
  // hat ------------------------------------------------------------------
  const HAT = [M[0], M[1], M[2], M[3], M[4], M[5]];
  // crown with a centre pinch
  for (let y = 4; y < 30; y++) for (let x = 44; x < 89; x++) {
    const t = (y - 4) / 26;
    const half = 15 + t * 6;
    if (Math.abs(x - HX) > half) continue;
    if (y < 7 && Math.abs(x - HX) > 12) continue;
    const nx = (x - HX) / half;
    let v = 1 + lambert(nx, -0.5 + t * 0.4, Math.sqrt(Math.max(0, 1 - nx * nx))) * 4;
    if (Math.abs(x - HX) < 2 && y < 18) v -= 1.4; // pinch
    if (Math.abs(Math.abs(x - HX) - 9) < 1 && y < 12) v -= 0.8; // side dents
    s.px(x, y, HAT[Math.max(0, Math.min(5, Math.round(v)))]);
  }
  // blood-red band
  for (let y = 24; y < 29; y++) for (let x = 44; x < 89; x++) {
    if (!s.get(x, y)) continue;
    const nx = (x - HX) / 21;
    s.px(x, y, B[Math.max(1, Math.min(5, Math.round(1.6 + lambert(nx, 0, Math.sqrt(Math.max(0, 1 - nx * nx))) * 3.6)))]);
  }
  s.hline(44, 88, 24, B[1]);
  // brim: a wide ellipse seen almost edge-on, tilted down on his left
  for (let y = 22; y < 40; y++) for (let x = 24; x < 110; x++) {
    const tilt = (x - HX) * 0.05;
    const nx = (x - HX) / 40, ny = (y - 30 - tilt) / 5;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const crownHere = Math.abs(x - HX) <= 20 && y < 30 + tilt;
    if (crownHere) continue;
    let c: Col;
    if (ny < -0.15) c = d > 0.8 ? HAT[5] : HAT[3];        // top surface catching the tube light
    else if (ny < 0.35) c = d > 0.85 ? HAT[4] : HAT[2];   // the edge
    else c = HAT[0];                                       // underside
    s.px(x, y, c);
  }
  // brim edge binding
  for (let x = 26; x < 108; x++) {
    const tilt = (x - HX) * 0.05, nx = (x - HX) / 40;
    const y = Math.round(30 + tilt + Math.sqrt(Math.max(0, 1 - nx * nx)) * 5 * 0.2);
    if (Math.abs(x - HX) > 20 || true) s.px(x, y, HAT[1]);
  }
  // shirt collar and tie knot
  const collar = (x0: number, dir: number) => s.poly([[x0, 66], [x0 + dir * 9, 78], [x0 + dir * 2, 78], [x0 - dir * 1, 70]], PA[5]);
  collar(60, -1); collar(72, 1);
  s.line(60, 66, 51, 78, PA[3]); s.line(72, 66, 81, 78, PA[2]);
  s.poly([[62, 70], [70, 70], [69, 78], [63, 78]], B[3]);
  s.hline(63, 69, 70, B[5]); s.vline(63, 71, 77, B[4]); s.vline(69, 71, 77, B[1]);
  return s;
}

function buildBody(): Surface {
  const s = new Surface(W, H);
  const torso = (x: number, y: number) => {
    if (y < 66) return false;
    const t = Math.min(1, (y - 66) / 16);
    const half = 18 + Math.pow(t, 0.6) * 36 - Math.max(0, y - 100) * 0.1; // padded shoulders, tapered waist
    return Math.abs(x - HX) <= half;
  };
  cylinderFill(s, 59, 73, PL, { ambient: 0.6, diffuse: 2.4 }, (x, y) => y >= 60 && y <= 78, [60, 78]);
  cylinderFill(s, 2, 130, SUIT, { ambient: 0.7, diffuse: 3.6, vfall: 0.02, y0: 66 }, torso, [66, H - 1]);
  // pinstripes (dotted, follow the body's curve slightly)
  for (let x = 4; x < 128; x += 5) for (let y = 70; y < H; y++) {
    const xx = x + Math.round((x - HX) * (y - 70) * 0.0016);
    if (!torso(xx, y) || (y & 1)) continue;
    const i = SUIT.indexOf(s.get(xx, y));
    if (i >= 0 && i < 6) s.px(xx, y, SUIT[i + 1]);
  }
  // shoulder-seam highlight catching the tube light
  for (let x = 0; x < W; x++) for (let y = 66; y < 86; y++) {
    if (s.get(x, y) && !s.get(x, y - 1)) { s.px(x, y, SUIT[6]); s.px(x, y + 1, SUIT[5]); break; }
  }
  // shirt front + tie
  s.poly([[56, 66], [76, 66], [72, 110], [60, 110]], PA[4]);
  for (let y = 66; y < 110; y++) for (let x = 56; x < 77; x++) if (s.get(x, y) === PA[4] && x > HX + 2) s.px(x, y, PA[3]);
  s.poly([[63, 78], [69, 78], [71, 108], [66, 113], [61, 108]], B[3]);
  for (let y = 78; y < 112; y++) { s.pxIn(62 + Math.floor((y - 78) / 30), y, B[4]); s.pxIn(69, y, B[2]); }
  s.rect(62, 92, 9, 2, A[4]); s.hline(62, 70, 92, A[6]); // gold tie bar
  // lapels: wide peaks with crisp highlight edges
  const lapel = (dir: number) => {
    const sx = HX + dir * 10;
    const pts = [[sx, 66], [HX + dir * 26, 80], [HX + dir * 30, 76], [HX + dir * 24, 92], [HX + dir * 8, 112], [HX + dir * 6, 112]];
    s.poly(pts, SUIT[dir < 0 ? 5 : 3]);
    for (let y = 66; y < 112; y++) for (let x = HX - 32; x < HX + 32; x++) if (s.get(x, y) === SUIT[dir < 0 ? 5 : 3] && bayer(x, y) < (y - 66) / 60) s.px(x, y, SUIT[dir < 0 ? 4 : 2]);
    s.line(sx, 66, HX + dir * 6, 112, dir < 0 ? SUIT[6] : SUIT[4]);
    s.line(sx + dir, 67, HX + dir * 7, 112, SUIT[1]);
    s.line(HX + dir * 26, 80, HX + dir * 30, 76, SUIT[6]);
    s.line(HX + dir * 30, 76, HX + dir * 24, 92, SUIT[1]);
  };
  lapel(-1); lapel(1);
  // red pocket square, and a silver pin shaped like a key on the lapel
  s.poly([[86, 98], [96, 97], [94, 102], [88, 102]], B[4]); s.px(90, 97, B[5]); s.px(93, 96, B[5]);
  s.hline(86, 98, 102, SUIT[0]);
  s.circle(44, 86, 2, M[7]); s.hline(46, 50, 86, M[7]); s.px(49, 87, M[7]); s.px(44, 86, M[9]);
  silhouetteRim(s, C[5], 66, 100, 'both', 1);
  return s;
}

function face(s: Surface, e: Expression, lids: Lids, talk: number) {
  // eyes: two red pinpoints in shadow; when he "blinks" they go out
  if (lids < 2) {
    const g = e.gaze;
    for (const ex of [60 + g, 72 + g]) {
      s.px(ex, 41, P.neonRed);
      if (lids === 0) { s.px(ex + 1, 41, B[3]); s.px(ex, 42, B[2]); }
    }
  }
  // mouth: the grin dominates. Teeth are silver.
  const m = talk && e.mouth === 'grin' ? (talk > 1 ? 'open' : 'grin') : e.mouth;
  const teeth = (y: number, x0: number, x1: number) => {
    for (let x = x0; x <= x1; x++) s.px(x, y, (x - x0) % 3 === 2 ? M[2] : (x - x0) % 3 === 0 ? M[9] : M[7]);
  };
  if (m === 'grin' || m === 'open' || m === 'smirk') {
    const wide = m === 'smirk' ? 0 : 1;
    // lips pulled back into a crescent that reaches the scars
    for (let x = 52 - wide; x <= 80 + wide; x++) {
      const k = (x - HX) / 14;
      const curve = Math.round(k * k * 3.2);
      const yTop = 60 - curve, open = m === 'open' ? 4 : 2;
      s.px(x, yTop - 1, PL[0]);
      if (Math.abs(x - HX) < 13) {
        for (let r = 0; r < open; r++) s.px(x, yTop + r, P.black);
        teeth(yTop, x, x);
        if (m === 'open') teeth(yTop + open - 1, x, x);
        else teeth(yTop + 1, x, x);
      } else s.px(x, yTop, P.black);
      s.px(x, yTop + open, PL[0]);
      if (Math.abs(x - HX) < 9) s.px(x, yTop + open + 1, PL[4]);
    }
    // re-stripe the teeth so gaps line up
    for (let x = HX - 12; x <= HX + 12; x++) {
      const k = (x - HX) / 14, yTop = 60 - Math.round(k * k * 3.2);
      if ((x - HX + 30) % 3 === 0) { s.px(x, yTop, M[2]); s.px(x, yTop + (m === 'open' ? 3 : 1), M[2]); }
    }
    if (m === 'open') { s.hline(HX - 4, HX + 4, 62, B[1]); s.hline(HX - 3, HX + 3, 63, B[2]); }
  } else if (m === 'neutral' || m === 'frown') {
    // the grin is gone: a long flat seam with the scars still pulling at the corners
    s.hline(54, 78, 60, PL[0]); s.hline(56, 76, 61, PL[3]);
    s.px(53, 59, PL[0]); s.px(79, 59, PL[0]);
  } else if (m === 'talk') {
    s.hline(54, 78, 59, PL[0]); s.hline(57, 75, 60, P.black); teeth(60, 58, 74); s.hline(56, 76, 61, PL[0]);
  }
}

function ledgerHands(s: Surface, t: number) {
  // black kid gloves resting on a closed ledger; the right index finger taps, slowly, then quickly
  const cyc = t % 4;
  const tap = cyc > 2 && Math.floor(t * 8) % 2 === 0;
  // ledger: oxblood leather, gold corners, seen in shallow perspective
  s.poly([[10, 5], [58, 4], [62, 17], [6, 18]], R[2]);
  s.hline(10, 58, 4, R[4]); s.hline(10, 57, 5, R[3]);
  s.line(6, 18, 62, 17, R[0]); s.line(7, 17, 61, 16, R[1]);
  for (let x = 9; x < 60; x += 2) s.px(x, 18, P.paper[3]); // page edges
  s.rect(54, 4, 6, 4, A[3]); s.px(55, 5, A[6]); s.rect(6, 15, 5, 4, A[3]); s.px(7, 16, A[5]);
  s.rect(32, 16, 3, 7, B[3]); s.px(33, 22, B[1]); // ribbon
  // gloves: resting on the ledger, fingers curled over its near edge
  const glove = (x: number, tapFinger: number) => {
    // sleeve + cuff behind the hand
    s.rect(x - 1, 0, 13, 5, SUIT[3]); s.hline(x - 1, x + 11, 0, SUIT[5]);
    s.rect(x, 4, 11, 2, PA[4]); s.px(x + 9, 4, A[5]);
    // back of the hand
    for (let y = 5; y < 11; y++) for (let i = 0; i < 12; i++) {
      const nx = (i - 5.5) / 6, ny = (y - 7.5) / 3.5;
      if (nx * nx + ny * ny > 1.15) continue;
      s.px(x + i, y, lambert(nx, ny - 0.4, 0.7) > 0.55 ? M[5] : lambert(nx, ny - 0.4, 0.7) > 0.25 ? M[3] : M[2]);
    }
    // four fingers, gaps between
    for (let f = 0; f < 4; f++) {
      const fx = x + 1 + f * 3;
      const lift = f === tapFinger ? 2 : 0;
      for (let y = 10; y < 17 - lift; y++) { s.px(fx, y, y < 12 ? M[4] : M[2]); s.px(fx + 1, y, M[1]); }
      s.px(fx, 17 - lift, M[0]); s.px(fx + 1, 17 - lift, M[0]);
      s.px(fx, 11, M[6]); // knuckle
    }
    // thumb tucked along the side
    for (let y = 8; y < 14; y++) s.px(x - 1, y, y < 10 ? M[3] : M[2]);
  };
  glove(16, -1);
  glove(38, tap ? 0 : -1);
  for (let x = 4; x < 66; x++) if (bayer(x, 23) < 0.7) s.px(x, 23, M[0]);
}

export function buildLandlord(): CharacterArt {
  const head = buildHead();
  const body = buildBody();
  silhouetteRim(head, C[5], 0, 30, 'both', 1);
  head.outline(INK);
  body.outline(INK);
  return {
    id: 'voss', name: 'Mr. Voss', w: W, h: H, head, body, face,
    counter: { w: 70, h: 25, x: 285, y: 176, draw: ledgerHands },
    expressions: [
      { brows: 'neutral', mouth: 'grin', gaze: 0 },
      { brows: 'neutral', mouth: 'open', gaze: 0 },
      { brows: 'neutral', mouth: 'neutral', gaze: 0 },
      { brows: 'neutral', mouth: 'grin', gaze: 1 },
    ],
    breathPeriod: 5.2,
  };
}
