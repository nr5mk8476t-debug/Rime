// KELL ABERNATHY - extraction-crew miner, shift C.
// Exhausted, proud, frost-bitten. Wears a faded quilted parka patched with tape, a collapsed fur hood,
// a knit cap with a cracked headlamp, and a respirator hanging off his chest. His left arm is a crude
// company-salvage prosthetic bolted on at the shoulder; the junction is bandaged and still weeps.

import { Surface, bayer } from '../../engine/surface';
import { P, type Col } from '../../engine/palette';
import { hash2 } from '../../engine/rng';
import { ellipsoid, cylinderFill, silhouetteRim, creases, lambert } from './sculpt';
void cylinderFill;
import type { CharacterArt, Expression, Lids } from './types';

const SK = P.skin, M = P.metal, R = P.rust, T = P.teal, C = P.cold, PA = P.paper, B = P.blood;
const W = 132, H = 124;
const INK = P.black;
const HX = 66; // head centre x

function inFace(x: number, y: number) {
  const dx = x - HX, dy = y - 40;
  if (dy > 8) { const half = 15 - (dy - 8) * 0.48; return Math.abs(dx) <= half && dy <= 21; }
  return (dx * dx) / (15.4 * 15.4) + (dy * dy) / (20.4 * 20.4) <= 1;
}

/** shift a skin pixel n steps darker along the ramp (for cast shadows) */
function darkenIn(s: Surface, x: number, y: number, ramp: Col[], n = 1) {
  const c = s.get(x, y);
  const i = ramp.indexOf(c);
  if (i > 0) s.px(x, y, ramp[Math.max(0, i - n)]);
}

function buildHead(): Surface {
  const s = new Surface(W, H);
  // ears
  ellipsoid(s, 50, 43, 3, 5, SK, { ambient: 1.2, diffuse: 3 });
  ellipsoid(s, 82, 43, 3, 5, SK, { ambient: 0.8, diffuse: 3 });
  s.px(50, 43, SK[1]); s.px(82, 43, SK[1]); s.px(51, 44, SK[2]);
  // face volume
  for (let y = 18; y < 62; y++) for (let x = 48; x < 85; x++) {
    if (!inFace(x, y)) continue;
    const nx = (x - HX) / 15.5, ny = (y - 40) / 21;
    const d = nx * nx + ny * ny;
    const nz = Math.sqrt(Math.max(0.05, 1 - Math.min(0.97, d)));
    let v = 1.6 + lambert(nx * 1.1, ny, nz) * 4.2;
    // gaunt planes: hollow cheeks & sunken temples
    if (Math.abs(nx) > 0.45 && ny > 0.15 && ny < 0.55) v -= 0.9;
    if (Math.abs(nx) > 0.6 && ny < -0.1) v -= 0.5;
    if (ny > 0.75) v -= 0.6;
    const g = v - Math.floor(v);
    const step = g < 0.42 ? 0 : g > 0.58 ? 1 : (g - 0.42) / 0.16 > bayer(x, y) ? 1 : 0;
    s.px(x, y, SK[Math.max(0, Math.min(6, Math.floor(v) + step))]);
  }
  // cast shadow from the cap
  for (let y = 29; y < 35; y++) for (let x = 48; x < 85; x++) if (inFace(x, y)) darkenIn(s, x, y, SK, y < 32 ? 2 : 1);
  // eye sockets
  for (const ex of [59, 73]) for (let y = 37; y < 46; y++) for (let x = ex - 5; x <= ex + 5; x++) {
    const d = ((x - ex) / 5) ** 2 + ((y - 41) / 4) ** 2;
    if (d < 1 && inFace(x, y)) darkenIn(s, x, y, SK, d < 0.5 ? 2 : 1);
  }
  // brow ridge highlight
  s.hline(55, 61, 36, SK[5]); s.hline(70, 76, 36, SK[4]);
  // nose
  for (let y = 40; y < 49; y++) { s.px(65, y, SK[5]); s.px(67, y, SK[3]); s.px(68, y, SK[2]); }
  s.px(64, 47, SK[4]);
  s.hline(63, 69, 49, SK[4]); s.px(65, 49, SK[6]); s.px(66, 50, B[4]); s.px(65, 50, B[5]);
  s.hline(63, 69, 50, SK[3]); s.px(65, 50, B[4]);
  s.px(63, 51, SK[1]); s.px(64, 51, SK[2]); s.px(68, 51, SK[1]); s.px(67, 51, SK[2]);
  s.hline(62, 70, 52, SK[2]);
  // frost-bitten cheeks
  for (const [x, y] of [[55, 47], [56, 47], [55, 48], [57, 48], [76, 47], [77, 48]]) s.px(x, y, B[4]);
  s.px(56, 46, SK[5]); s.px(57, 46, SK[6]);
  // cheekbone hollows
  s.line(53, 50, 58, 54, SK[2]); s.line(79, 50, 74, 54, SK[1]);
  // nasolabial folds
  s.line(61, 51, 59, 56, SK[2]); s.line(71, 51, 73, 56, SK[1]);
  // old scar across the left cheek
  s.line(53, 43, 51, 52, SK[5]); s.line(54, 44, 52, 52, SK[2]);
  // stubble with ice in it
  for (let y = 50; y < 62; y++) for (let x = 50; x < 83; x++) {
    if (!inFace(x, y)) continue;
    const onLip = y >= 53 && y <= 57 && x >= 61 && x <= 71;
    if (y < 53 && Math.abs(x - HX) < 6) continue;
    const h = hash2(x, y, 7);
    if (!onLip && h > 0.45) darkenIn(s, x, y, SK, 1);
    if (!onLip && h > 0.9) s.px(x, y, M[3]);
    if (h < 0.025) s.px(x, y, C[8]);
  }
  // soot on the forehead
  for (const [x, y] of [[60, 33], [61, 33], [62, 34], [74, 32], [75, 33]]) darkenIn(s, x, y, SK, 2);

  // knit cap
  ellipsoid(s, HX, 33, 18, 19, T, { ambient: 0.8, diffuse: 5.2 }, (x, y) => y < 31);
  for (let y = 14; y < 31; y++) for (let x = 47; x < 86; x++) {
    if (!s.get(x, y) || T.indexOf(s.get(x, y)) < 0) continue;
    if ((x + (y >> 1)) % 3 === 0) darkenIn(s, x, y, T, 1); // knit texture
  }
  // rolled brim
  for (let y = 25; y < 31; y++) for (let x = 47; x < 86; x++) {
    const nx = (x - HX) / 19; if (Math.abs(nx) > 1) continue;
    let v = 1.4 + lambert(nx, y < 27 ? -0.8 : 0.2, Math.sqrt(1 - nx * nx)) * 4;
    if (x % 2 === 0) v -= 0.8;
    s.px(x, y, T[Math.max(0, Math.min(8, Math.round(v)))]);
  }
  s.hline(48, 84, 31, T[1]);
  // cap darns & a pinned union pin
  s.px(54, 20, R[4]); s.px(55, 21, R[4]); s.px(56, 20, R[4]);
  s.rect(77, 27, 3, 3, PA[4]); s.px(78, 28, B[3]);
  // headlamp: strap + housing with a cracked lens
  s.rect(60, 18, 13, 8, M[2]);
  s.hline(60, 72, 18, M[5]); s.vline(60, 18, 25, M[4]); s.hline(60, 72, 25, M[0]);
  s.circle(66, 22, 3, C[4]); s.px(65, 21, C[8]); s.px(66, 21, C[6]);
  s.line(64, 20, 68, 24, M[1]); s.px(67, 21, M[1]);
  s.px(71, 20, B[3]); // dead power LED
  return s;
}

function buildBody(): Surface {
  const s = new Surface(W, H);
  const half = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - 60) / 30));
    return 14 + 40 * Math.sqrt(t) + Math.max(0, y - 92) * 0.12;
  };
  const torso = (x: number, y: number) => y >= 60 && Math.abs(x - HX) <= half(y);
  // parka: faded quilted rust, shaded as a broad rounded volume
  for (let y = 60; y < H; y++) for (let x = 0; x < W; x++) {
    if (!torso(x, y)) continue;
    const hw = half(y);
    const nx = (x - HX) / hw;
    const nyShoulder = y < 92 ? -0.9 + (y - 60) / 40 : 0.2;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx * 0.9));
    let v = 1.1 + lambert(nx, nyShoulder, nz) * 4.6 - (y - 60) * 0.022;
    s.px(x, y, quantR(v, x, y));
  }
  // quilting: curved seams with puffed highlights above each
  for (let row = 0; row < 6; row++) {
    const y0 = 84 + row * 8;
    for (let x = 0; x < W; x++) {
      const y = Math.round(y0 + Math.abs(x - HX) * 0.07);
      if (!torso(x, y)) continue;
      s.px(x, y, R[1]);
      const c = s.get(x, y - 2);
      const i = R.indexOf(c);
      if (i >= 0 && i < 7 && hash2(x, row, 2) > 0.15) s.px(x, y - 2, R[i + 1]);
    }
  }
  creases(s, [[34, 92, 42, 118], [92, 94, 88, 120], [52, 104, 53, 124]], R[1], R[4]);
  for (let y = 76; y < H; y++) s.px(HX + 1, y, y % 2 ? M[6] : M[2]); // zip
  const tape = (x: number, y: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const xx = x + i + Math.floor(j / 3), yy = y + j;
      if (!torso(xx, yy)) continue;
      s.px(xx, yy, j === 0 ? M[6] : i === 0 ? M[5] : (i + j) % 7 === 0 ? M[3] : M[4]);
    }
  };
  tape(22, 100, 12, 6); tape(26, 106, 10, 5); tape(78, 110, 9, 7);
  // union badge
  s.rect(36, 86, 11, 9, PA[3]); s.frame(36, 86, 11, 9, R[1]);
  s.rect(39, 88, 5, 5, B[3]); s.hline(39, 43, 90, PA[4]);

  // collapsed fur hood: a thick, matted ring around the neck, lying on the shoulders
  for (let y = 44; y < 84; y++) for (let x = 20; x < 112; x++) {
    const ox = (x - HX) / 36, oy = (y - 62) / 19;
    const ix = (x - HX) / 17, iy = (y - 55) / 10;
    const n = (hash2(x >> 1, y >> 1, 12) - 0.5) * 0.18;
    const outer = ox * ox + oy * oy, inner = ix * ix + iy * iy;
    if (outer > 1 + n || inner < 1 + n || y < 50) continue;
    // tube normal: how far between inner and outer edges
    const tt = Math.min(1, Math.max(0, (Math.sqrt(outer) - 0.55) / 0.45));
    const ny = -Math.cos(tt * Math.PI) * (y < 64 ? 1 : 0.3) - 0.2;
    let v = 0.6 + lambert(ox * 0.6, ny, Math.sin(tt * Math.PI)) * 3.6;
    if (hash2(x, y, 31) > 0.78) v -= 1;
    if (hash2(x, y >> 1, 32) > 0.92) v += 0.8;
    s.px(x, y, PA[Math.max(0, Math.min(4, Math.round(v)))]);
  }
  // matted strands
  for (let k = 0; k < 40; k++) {
    const x = 24 + Math.floor(hash2(k, 1, 40) * 84), y = 58 + Math.floor(hash2(k, 2, 40) * 22);
    if (PA.indexOf(s.get(x, y)) >= 0) { s.px(x, y, PA[0]); s.px(x + 1, y + 1, PA[1]); }
  }
  // the hood's dark interior behind the neck
  for (let y = 50; y < 68; y++) for (let x = 48; x < 85; x++) {
    const ix = (x - HX) / 17, iy = (y - 55) / 10;
    if (ix * ix + iy * iy < 1.02 && y >= 52) s.px(x, y, ix * ix + iy * iy > 0.8 ? PA[0] : M[0]);
  }
  // neck: in shadow under the jaw, tendons visible
  cylinderFill(s, 58, 74, SK, { ambient: 0.8, diffuse: 2.6 }, (x, y) => y >= 54 && y <= 66, [54, 66]);
  for (let y = 58; y < 63; y++) for (let x = 58; x <= 74; x++) darkenIn(s, x, y, SK, 1);
  s.line(62, 60, 63, 66, SK[1]); s.line(70, 60, 69, 66, SK[1]);
  s.px(66, 63, SK[3]); s.px(66, 64, SK[4]); // adam's apple
  // respirator hanging on the chest
  const mx = HX - 2, my = 90;
  s.line(mx - 6, my - 4, 54, 76, M[0]); s.line(mx + 6, my - 4, 78, 76, M[0]);
  s.poly([[mx - 7, my - 5], [mx + 7, my - 5], [mx + 5, my + 4], [mx, my + 7], [mx - 5, my + 4]], M[2]);
  s.hline(mx - 6, mx + 6, my - 5, M[5]); s.vline(mx - 7, my - 5, my - 2, M[4]);
  s.circle(mx, my, 3, M[1]); s.px(mx - 1, my - 1, M[4]); s.px(mx + 1, my - 1, M[4]); s.px(mx, my + 1, M[4]); s.px(mx - 1, my + 1, M[3]); s.px(mx + 1, my + 1, M[3]);
  ellipsoid(s, mx - 9, my + 5, 3, 3, M, { ambient: 1.2, diffuse: 4.4 });
  ellipsoid(s, mx + 9, my + 5, 3, 3, M, { ambient: 0.8, diffuse: 4.4 });
  s.px(mx - 9, my + 7, R[4]); s.px(mx + 9, my + 7, R[3]);

  // --- cybernetic arm (his left, our right). The sleeve has been cut away at the shoulder.
  for (let y = 68; y < H; y++) for (let x = 99; x < W; x++) s.erase(x, y);
  for (let y = 70; y < H; y++) {
    const fx = 99 + Math.floor(hash2(0, y, 4) * 2);
    if (torso(fx - 1, y)) { s.px(fx - 1, y, R[1]); if (hash2(1, y, 4) > 0.55) s.px(fx, y, PA[2]); }
  }
  const cab = (c: Col, hi: Col, x0: number, y0: number, x1: number, y1: number) => { s.line(x0, y0, x1, y1, c); s.line(x0, y0 - 1, x1, y1 - 1, hi); };
  cab(B[2], B[4], 94, 84, 104, 92);
  cab(M[1], M[4], 95, 89, 104, 98);
  cab(T[2], T[5], 94, 94, 103, 104);
  // upper arm strut (behind the cap)
  for (let y = 98; y < H; y++) for (let x = 102; x < 124; x++) {
    const nx = (x - 113) / 11;
    s.px(x, y, M[Math.max(1, Math.min(8, Math.round(1.6 + lambert(nx, -0.2, Math.sqrt(Math.max(0, 1 - nx * nx))) * 5.4)))]);
  }
  s.vline(112, 100, H - 1, M[1]); s.vline(113, 100, H - 1, M[6]);
  s.rect(103, 108, 20, 2, M[1]); s.hline(103, 122, 110, M[5]);
  s.rect(123, 96, 3, 28, M[2]); s.vline(123, 96, H - 1, M[7]); s.rect(122, 106, 5, 3, M[4]);
  // shoulder cap: armoured dome built from two overlapping plates
  ellipsoid(s, 112, 88, 13, 11, M, { ambient: 1, diffuse: 6.2, spec: M[9], specPow: 16 });
  for (let y = 77; y < 100; y++) for (let x = 99; x < 126; x++) {
    const d = ((x - 112) / 13) ** 2 + ((y - 88) / 11) ** 2;
    if (d < 1 && Math.abs(y - (84 + (x - 99) * 0.25)) < 0.6) s.px(x, y, M[1]); // plate seam
  }
  s.ring(112, 99, 5, M[1]); s.ring(112, 99, 4, M[6]); s.circle(112, 99, 2, M[2]); s.px(111, 98, M[8]); // elbow-socket joint
  for (const [x, y] of [[103, 84], [120, 80], [106, 94], [121, 93]]) { s.px(x, y, M[9]); s.px(x + 1, y + 1, M[1]); }
  for (let k = 0; k < 8; k++) s.px(101 + k * 3, 86 + Math.round((k * 3) * 0.25) + 1, P.amber[3]); // weld bead
  s.rect(108, 90, 10, 4, M[3]);
  s.hline(109, 110, 91, M[1]); s.hline(112, 113, 91, M[1]); s.hline(115, 116, 91, M[1]);
  // flesh junction: stained bandage where metal meets the shoulder
  for (let y = 70; y < 80; y++) for (let x = 98; x < 120; x++) {
    const nx = (x - 108) / 11, ny = (y - 75) / 5;
    if (nx * nx + ny * ny > 1) continue;
    s.px(x, y, y < 72 ? PA[4] : (y + Math.floor(x / 3)) % 3 === 0 ? PA[1] : PA[3]);
  }
  for (const [x, y] of [[103, 77], [104, 78], [105, 78], [103, 79], [106, 79], [111, 78], [112, 79]]) s.px(x, y, B[2]);
  s.px(104, 76, B[3]); s.px(106, 80, B[1]);

  silhouetteRim(s, C[6], 58, 100, 'both', 1);
  return s;
}

function quantR(v: number, x: number, y: number): Col {
  if (v <= 0) return R[0];
  if (v >= 8) return R[8];
  const lo = Math.floor(v), f = v - lo;
  const g = f < 0.42 ? 0 : f > 0.58 ? 1 : (f - 0.42) / 0.16;
  return g > bayer(x, y) ? R[lo + 1] : R[lo];
}

// eye: 7x5 sprite, gaze offsets iris
function eye(s: Surface, x: number, y: number, lids: Lids, gaze: number, bloodshot: boolean, brightSide: boolean) {
  const lid = SK[0], white = brightSide ? PA[4] : PA[3], iris = C[5], pupil = P.black, low = SK[2], bag = SK[2];
  if (lids === 2) {
    s.hline(x + 1, x + 5, y + 2, lid); s.hline(x, x + 6, y + 1, SK[2]);
    s.hline(x + 2, x + 4, y + 3, low);
  } else {
    s.hline(x + 1, x + 5, y, lid);
    s.px(x, y + 1, lid); s.px(x + 6, y + 1, lid);
    const top = lids === 1 ? y + 2 : y + 1;
    if (lids === 1) s.hline(x + 1, x + 5, y + 1, lid);
    for (let r = top; r <= y + 2; r++) {
      s.hline(x + 1, x + 5, r, white);
      const ix = x + 2 + gaze;
      s.px(ix, r, iris); s.px(ix + 1, r, iris);
      if (r === y + 2) s.px(ix + 1, r, pupil);
      else if (lids === 0) s.px(ix + 1, r, pupil);
    }
    if (lids === 0) s.px(x + 2 + gaze, y + 1, C[7]); // glint
    if (bloodshot) { s.px(x + 1, y + 2, B[5]); s.px(x + 5, y + 1, B[4]); }
    s.px(x, y + 2, lid); s.px(x + 6, y + 2, SK[1]);
    s.hline(x + 1, x + 5, y + 3, low);
  }
  s.hline(x + 2, x + 4, y + 4, bag);
}

function face(s: Surface, e: Expression, lids: Lids, talk: number) {
  // brows
  const browL = { neutral: [[54, 38], [62, 37]], angry: [[54, 36], [62, 38]], worried: [[54, 38], [62, 35]], raised: [[54, 35], [62, 34]] }[e.brows];
  const browR = { neutral: [[70, 37], [78, 38]], angry: [[70, 38], [78, 36]], worried: [[70, 35], [78, 38]], raised: [[70, 34], [78, 35]] }[e.brows];
  for (const [[x0, y0], [x1, y1]] of [browL, browR]) {
    s.line(x0, y0, x1, y1, M[1]);
    s.line(x0 + 1, y0 + 1, x1 - 1, y1 + 1, SK[1]);
  }
  s.px(70, 38, M[1]); // brow notch scar
  eye(s, 56, 39, lids, e.gaze, true, true);
  eye(s, 70, 39, lids, e.gaze, false, false);
  // mouth
  const m = talk && (e.mouth === 'neutral' || e.mouth === 'frown') ? 'talk' : e.mouth;
  const lip = SK[1], low = SK[4];
  if (m === 'neutral') { s.hline(61, 71, 55, lip); s.hline(63, 69, 56, low); s.px(60, 56, SK[2]); s.px(72, 56, SK[2]); }
  else if (m === 'frown') { s.hline(62, 70, 55, lip); s.px(61, 56, lip); s.px(71, 56, lip); s.px(60, 57, SK[2]); s.px(72, 57, SK[2]); s.hline(63, 69, 56, low); }
  else if (m === 'smirk') { s.hline(61, 69, 55, lip); s.px(70, 54, lip); s.px(71, 53, lip); s.hline(63, 68, 56, low); }
  else if (m === 'talk') {
    s.hline(61, 71, 54, lip);
    s.hline(62, 70, 55, SK[0]); s.hline(63, 69, 56, SK[0]); if (talk > 1) s.hline(64, 68, 57, SK[0]);
    s.hline(63, 69, talk > 1 ? 58 : 57, low); s.px(64, 55, PA[3]); s.px(67, 55, PA[2]);
  } else { s.hline(61, 71, 55, lip); s.hline(62, 70, 56, SK[0]); s.hline(63, 69, 57, low); }
}

function counterHand(s: Surface, t: number) {
  // the crude prosthetic hand resting on the tray; the index finger twitches now and then
  const ox = 0, oy = 0;
  const twitch = (t % 5.3) < 0.18 || ((t % 5.3) > 0.4 && (t % 5.3) < 0.52) ? 1 : 0;
  // forearm stub coming from behind the counter edge
  for (let y = oy; y < oy + 12; y++) for (let x = ox; x < ox + 14; x++) {
    const nx = (y - oy - 6) / 6;
    s.px(x, y, M[Math.max(1, Math.min(8, Math.round(3.4 - nx * 2.6)))]);
  }
  s.hline(ox, ox + 13, oy, M[7]);
  for (let x = ox + 1; x < ox + 13; x += 3) s.px(x, oy + 6, M[1]);
  // bloody bandage at the wrist
  for (let y = oy; y < oy + 12; y++) for (let x = ox + 12; x < ox + 17; x++) s.px(x, y, (x + y) % 3 ? PA[4] : PA[2]);
  s.px(ox + 14, oy + 7, B[2]); s.px(ox + 15, oy + 8, B[2]); s.px(ox + 13, oy + 9, B[3]);
  // palm block
  for (let y = oy + 1; y < oy + 12; y++) for (let x = ox + 17; x < ox + 27; x++) s.px(x, y, M[y < oy + 3 ? 6 : y < oy + 8 ? 4 : 2]);
  s.hline(ox + 17, ox + 26, oy + 1, M[8]);
  s.px(ox + 20, oy + 5, P.amber[3]); // status lamp (dim)
  // fingers: three segmented digits, one replaced with a bent bolt
  const finger = (fy: number, len: number, lift: number) => {
    for (let k = 0; k < len; k++) {
      const x = ox + 27 + k, y = oy + fy - (k > len - 4 ? lift : 0);
      s.px(x, y, k % 4 === 3 ? M[1] : M[5]); s.px(x, y + 1, M[2]);
      if (k % 4 === 0) s.px(x, y - 1, M[7]);
    }
    s.px(ox + 27 + len, oy + fy + 1 - lift, M[1]);
  };
  finger(2, 11, twitch);
  finger(5, 12, 0);
  // missing finger: bent bolt
  s.hline(ox + 27, ox + 31, oy + 8, M[3]); s.px(ox + 32, oy + 9, M[3]); s.px(ox + 33, oy + 9, M[6]);
  finger(10, 9, 0);
  // thumb tucked under
  s.hline(ox + 21, ox + 27, oy + 12, M[3]); s.hline(ox + 21, ox + 26, oy + 13, M[1]);
  // dangling wire
  s.line(ox + 26, oy + 11, ox + 29, oy + 15, B[3]); s.px(ox + 29, oy + 15, P.amber[5]);
  // shadow on the tray
  for (let x = ox + 2; x < ox + 40; x++) if (bayer(x, oy + 16) < 0.6) s.px(x, oy + 16, M[1]);
}

export function buildMiner(): CharacterArt {
  const head = buildHead();
  const body = buildBody();
  // outlines (ink) on each layer
  silhouetteRim(head, C[6], 12, 56, 'both', 1, (x, y) => y > 30 && y < 34);
  head.outline(INK);
  body.outline(INK);
  return {
    id: 'kell', name: 'Kell Abernathy', w: W, h: H, head, body, face,
    counter: { w: 44, h: 18, x: 246, y: 180, draw: counterHand },
    accents(s, t) {
      // status LED on the prosthetic shoulder, irregular stutter
      const on = (t % 2.7) < 0.1 || ((t % 2.7) > 0.25 && (t % 2.7) < 0.32);
      s.px(122, 88, on ? P.neonAmber : P.amber[1]);
      if (on) s.px(122, 87, P.amber[4]);
    },
    expressions: [
      { brows: 'neutral', mouth: 'neutral', gaze: 0 },
      { brows: 'angry', mouth: 'frown', gaze: 0 },
      { brows: 'worried', mouth: 'neutral', gaze: -1 },
      { brows: 'raised', mouth: 'smirk', gaze: 0 },
    ],
    breathPeriod: 3.6,
  };
}
