// The shop interior: walls, ceiling pipes, the service window frame, counter, floor,
// inventory tray frame and control strip. Baked once into a static layer (window left open).
// Props with their own detail (register, terminal, scanner, notices...) live in props.ts.

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { hash2, fbm, Rng } from '../engine/rng';
import { shade, lightAt, grime, rivet, rustStreak, scratches } from './paint';
import { W, H, WIN, COUNTER, TRAY, GRID, GRID_FRAME, CELL, CONTROLS } from '../scene/layout';
import { text, TINY } from '../engine/font';

const T = P.teal, M = P.metal, R = P.rust, A = P.amber, C = P.cold;

function wallColor(x: number, y: number, seed: number, base = 1.6): Col {
  const L = lightAt(x, y);
  // vignette toward the outer edges and floor
  const ex = Math.abs(x - 320) / 320;
  const vig = ex * ex * 1.4 + Math.max(0, (y - 180) / 180) * 0.8;
  let v = base + L.v * 1.55 + grime(x, y, seed) * 0.75 - vig;
  const wk = L.v * Math.max(0, L.warm) * 1.6 + (fbm(x * 0.05, y * 0.05, 5) - 0.5) * 0.5;
  if (wk > 0.9 + (bayer(x + 1, y) - 0.5) * 0.2) {
    return shade(R, v + 0.2, x, y); // warm bounce from bulb / heater
  }
  return shade(T, v, x, y);
}

function paintWalls(s: Surface) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s.px(x, y, wallColor(x, y, 3));
  // panel seams: staggered plates, with a lit edge below each seam
  const rowH = 38;
  for (let row = 0; row * rowH < 220; row++) {
    const y0 = 14 + row * rowH;
    const off = (row % 2) * 26;
    for (let x = 0; x < W; x++) {
      s.px(x, y0, shade(T, wallColor(x, y0, 3, 0.4) === 0 ? 0 : 0.6, x, y0));
      s.px(x, y0 + 1, wallColor(x, y0 + 1, 3, 2.4));
    }
    for (let px = -off; px < W; px += 52) {
      for (let y = y0; y < y0 + rowH; y++) { s.px(px, y, T[1]); s.px(px + 1, y, wallColor(px + 1, y, 3, 2.3)); }
      // rivets at the corners, some bleeding rust
      for (const [rx, ry] of [[px + 4, y0 + 4], [px + 46, y0 + 4], [px + 4, y0 + rowH - 6], [px + 46, y0 + rowH - 6]]) {
        rivet(s, rx, ry, wallColor(rx, ry, 3, 3), T[1]);
        if (hash2(rx, ry, 9) > 0.72) rustStreak(s, rx, ry + 2, 6 + Math.floor(hash2(rx, ry, 4) * 14), rx);
      }
    }
  }
  // lower wainscot: heavier plating behind the counter line
  for (let y = 132; y < COUNTER.top; y++) for (let x = 0; x < W; x++) {
    const L = lightAt(x, y);
    let v = 1.6 + L.v * 1.3 + grime(x, y, 12) * 0.6 - Math.abs(x - 320) / 400;
    s.px(x, y, shade(M, v, x, y));
  }
  for (let x = 0; x < W; x++) { s.px(x, 132, M[1]); s.px(x, 133, M[5]); }
  // damp stains spreading from the ceiling
  for (let y = 14; y < 120; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x * 0.02, y * 0.05, 88);
    if (n > 0.64 && bayer(x, y) < (n - 0.64) * 3) s.px(x, y, T[1]);
  }
}

function pipeRow(s: Surface, y: number, h: number, x0: number, x1: number, ramp: Col[], seed: number) {
  for (let j = 0; j < h; j++) {
    const t = j / (h - 1);
    const prof = 1 - Math.abs(t - 0.32) * 1.7; // highlight high on the cylinder
    for (let x = x0; x < x1; x++) {
      const L = lightAt(x, y + j);
      let v = 1.2 + prof * 3 + L.v * 0.8 + grime(x, y + j, seed) * 0.4;
      let c = shade(ramp, v, x, y + j);
      if (fbm(x * 0.07, j * 0.3, seed + 1) > 0.66 && j > h * 0.4) c = shade(R, v - 0.5, x, y + j);
      s.px(x, y + j, c);
    }
  }
}

function paintCeiling(s: Surface) {
  s.rect(0, 0, W, 14, M[1]);
  s.dither(0, 10, W, 4, M[2], 0.5);
  pipeRow(s, 1, 9, 0, W, M, 5);
  // pipe collars & brackets
  for (let x = 30; x < W; x += 74) {
    s.rect(x, 0, 5, 11, M[2]);
    s.vline(x, 0, 10, M[6]); s.vline(x + 4, 0, 10, M[1]);
    rivet(s, x + 1, 4, M[7], M[1]);
  }
  // valve wheel
  const vx = 584, vy = 5;
  s.ring(vx, vy + 6, 5, R[4]); s.ring(vx, vy + 6, 4, R[2]);
  s.line(vx - 4, vy + 6, vx + 4, vy + 6, R[3]); s.line(vx, vy + 2, vx, vy + 10, R[3]);
  s.rect(vx - 1, vy + 5, 3, 3, R[5]);
  // thin conduit
  pipeRow(s, 12, 4, 0, 200, T, 6);
  pipeRow(s, 12, 4, 444, W, T, 7);
}

/** catenary cable */
export function cable(s: Surface, x0: number, y0: number, x1: number, y1: number, sag: number, c: Col, hi?: Col) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  let lx = -1, ly = -1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t));
    if (x === lx && y === ly) continue;
    s.px(x, y, c); s.px(x, y + 1, c);
    if (hi) s.px(x, y, hi);
    lx = x; ly = y;
  }
}

function paintWindowFrame(s: Surface) {
  // open the window
  for (let y = WIN.y; y < WIN.y + WIN.h; y++) for (let x = WIN.x; x < WIN.x + WIN.w; x++) s.erase(x, y);
  // header beam
  const hx0 = WIN.x - 16, hx1 = WIN.x + WIN.w + 16;
  for (let y = 14; y < WIN.y; y++) for (let x = hx0; x < hx1; x++) {
    const L = lightAt(x, y);
    const v = 1.4 + L.v * 0.6 + grime(x, y, 21) * 0.5 + (y === 14 ? 2 : y === WIN.y - 1 ? -1 : 0);
    s.px(x, y, shade(M, v, x, y));
  }
  // painted shop sign on the header
  const signX = 268, signY = 15;
  s.rect(signX, signY, 104, 8, R[1]);
  s.dither(signX, signY, 104, 8, R[2], 0.5);
  text(s, 'PAWN - REPAIR - NO QUESTIONS', signX + 3, signY + 2, A[4], TINY);
  for (let x = signX; x < signX + 104; x++) if (hash2(x, 3, 1) > 0.8) s.px(x, signY + 2 + Math.floor(hash2(x, 4, 1) * 5), R[1]); // flaking
  // rolled shutter: corrugated slats hanging into the top of the opening
  for (let y = WIN.y; y < WIN.y + 9; y++) for (let x = WIN.x; x < WIN.x + WIN.w; x++) {
    const k = (y - WIN.y) % 3;
    let c = k === 0 ? R[4] : k === 1 ? R[3] : R[1];
    if (fbm(x * 0.06, y * 0.5, 31) > 0.6) c = k === 0 ? M[4] : M[2];
    s.px(x, y, c);
  }
  s.hline(WIN.x, WIN.x + WIN.w - 1, WIN.y + 9, M[1]);
  s.rect(WIN.x + 96, WIN.y + 8, 16, 3, M[3]); // pull handle
  s.hline(WIN.x + 96, WIN.x + 111, WIN.y + 8, M[6]);
  // tube light fixture under the shutter
  s.rect(WIN.x + 24, WIN.y + 10, WIN.w - 48, 4, M[2]);
  s.hline(WIN.x + 24, WIN.x + WIN.w - 25, WIN.y + 10, M[5]);
  s.hline(WIN.x + 26, WIN.x + WIN.w - 27, WIN.y + 13, A[6]);
  s.hline(WIN.x + 28, WIN.x + WIN.w - 29, WIN.y + 14, A[4]);
  // posts
  const post = (x0: number, side: number) => {
    for (let y = 14; y < COUNTER.top + 2; y++) for (let x = x0; x < x0 + 16; x++) {
      const lx = x - x0;
      const L = lightAt(x, y);
      // I-beam: flanges on each side, web in the middle
      const prof = lx < 3 ? 3.2 - lx * 0.6 : lx > 12 ? 1.8 - (lx - 12) * 0.4 : 1.4;
      let v = prof + L.v * 0.9 + grime(x, y, 40 + side) * 0.5;
      let c = shade(M, v, x, y);
      // hazard paint on lower section, worn off in patches
      if (y > 128 && lx >= 3 && lx <= 12) {
        const stripe = Math.floor((x + y) / 5) % 2;
        if (fbm(x * 0.2, y * 0.1, 7 + side) < 0.58) c = stripe ? shade(A, 2 + L.v, x, y) : M[1];
      }
      s.px(x, y, c);
    }
    for (let y = 24; y < COUNTER.top; y += 22) { rivet(s, x0 + 1, y, M[7], M[1]); rivet(s, x0 + 13, y, M[6], M[1]); }
    // frost creeping in from the outside edge, gathered in the corners
    const edge = side < 0 ? x0 + 15 : x0;
    for (let y = WIN.y + 8; y < COUNTER.top; y++) for (let k = 0; k < 7; k++) {
      const fx = side < 0 ? edge - k : edge + k;
      const corner = Math.max(0, 1 - (y - WIN.y - 8) / 26) + Math.max(0, 1 - (COUNTER.top - y) / 20);
      const n = fbm(fx * 0.25, y * 0.1, 70 + side) + corner * 0.5 - k * 0.09;
      if (n > 0.78) s.px(fx, y, n > 0.92 ? C[9] : C[7]);
      else if (n > 0.72 && k < 2) s.px(fx, y, C[6]);
    }
  };
  post(WIN.x - 16, -1);
  post(WIN.x + WIN.w, 1);
  // frost along the shutter bottom edge
  for (let x = WIN.x; x < WIN.x + WIN.w; x++) if (hash2(x, 1, 5) > 0.55) s.px(x, WIN.y + 9, C[8]);
}

function paintCounter(s: Surface) {
  const y0 = COUNTER.top, y1 = COUNTER.surfBottom, y2 = COUNTER.lipBottom;
  const x0 = 104;
  // top surface: worn steel with a lit centre
  for (let y = y0; y < y1; y++) for (let x = x0; x < W; x++) {
    const L = lightAt(x, y);
    const depth = (y - y0) / (y1 - y0);
    let v = 2.2 + L.v * 1.5 + depth * 0.6 + grime(x, y, 51) * 0.55;
    let c = shade(M, v, x, y);
    if (fbm(x * 0.04, y * 0.2, 52) > 0.67) c = shade(T, v - 0.3, x, y); // oxidised patches
    s.px(x, y, c);
  }
  // back edge where the counter meets the wall
  s.hline(x0, W - 1, y0, M[1]);
  s.hline(x0, W - 1, y0 + 1, M[6]);
  // seams between counter sheets
  for (const sx of [196, 436, 548]) { s.vline(sx, y0 + 1, y1 - 1, M[1]); s.vline(sx + 1, y0 + 1, y1 - 1, M[5]); }
  scratches(s, x0, y0 + 2, W - x0, y1 - y0 - 3, 45, M[6], 4);
  scratches(s, x0, y0 + 2, W - x0, y1 - y0 - 3, 30, M[2], 6);
  // stains: coffee rings, oil, a dried brown smear
  s.ring(126, 196, 4, M[2]);
  s.ring(512, 194, 5, M[3]);
  for (let i = 0; i < 40; i++) { const x = 600 + Math.floor(hash2(i, 0, 3) * 26), y = 190 + Math.floor(hash2(i, 1, 3) * 10); s.px(x, y, P.blood[1]); }
  // the tray: recessed, lit by the tube above
  const t = TRAY;
  for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) {
    const dx = (x - (t.x + t.w / 2)) / (t.w * 0.55), dy = (y - (t.y + 8)) / 22;
    const pool = Math.max(0, 1 - dx * dx - dy * dy);
    let v = 2.4 + pool * 3.2 + grime(x, y, 60) * 0.35;
    s.px(x, y, shade(M, v, x, y));
  }
  s.hline(t.x - 1, t.x + t.w, t.y - 1, M[0]);
  s.vline(t.x - 1, t.y, t.y + t.h - 1, M[1]);
  s.vline(t.x + t.w, t.y, t.y + t.h - 1, M[7]);
  s.hline(t.x - 1, t.x + t.w, t.y + t.h, M[7]);
  s.hline(t.x, t.x + t.w - 1, t.y, M[2]);
  scratches(s, t.x + 4, t.y + 4, t.w - 8, t.h - 8, 14, M[7], 11);
  // lip facing us
  for (let y = y1; y < y2; y++) for (let x = x0; x < W; x++) {
    const L = lightAt(x, y);
    const k = (y - y1) / (y2 - y1);
    let v = (y === y1 ? 5.5 : y === y1 + 1 ? 4 : 2.6 - k * 1.6) + L.v * 0.7 + grime(x, y, 71) * 0.5;
    let c = shade(M, v, x, y);
    if (k > 0.55 && fbm(x * 0.08, y * 0.4, 72) > 0.52) c = shade(R, v + 0.6, x, y);
    s.px(x, y, c);
  }
  // dents along the lip
  const r = new Rng(13);
  for (let i = 0; i < 14; i++) {
    const dx = r.int(x0 + 4, W - 8), dy = r.int(y1 + 3, y2 - 4);
    s.px(dx, dy, M[1]); s.px(dx + 1, dy, M[2]); s.px(dx + 1, dy + 1, M[5]);
  }
  for (let x = x0 + 10; x < W; x += 40) rivet(s, x, y1 + 6, M[6], M[1]);
  // end cap on the left
  for (let y = y0; y < y2; y++) { s.px(x0 - 1, y, M[1]); s.px(x0, y, M[5]); }
}

function paintFloor(s: Surface) {
  const y0 = COUNTER.lipBottom;
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
    const L = lightAt(x, y);
    const near = (y - y0) / (H - y0);
    let v = 0.7 + L.v * 1.3 + near * 0.5 + grime(x, y, 90) * 0.45;
    // diamond tread pattern
    const tx = (x + (Math.floor(y / 4) % 2) * 4) % 8, ty = y % 4;
    if ((tx === 1 && ty === 1) || (tx === 2 && ty === 2)) v += 0.9;
    // plate seams
    if (x % 64 === 0 || (y - y0) % 46 === 0) v -= 1.2;
    const wk = L.v * Math.max(0, L.warm) * 1.6 + (fbm(x * 0.05, y * 0.05, 6) - 0.5) * 0.5;
    let c = wk > 1.0 + (bayer(x, y) - 0.5) * 0.2 ? shade(R, v + 0.1, x, y) : shade(M, v, x, y);
    s.px(x, y, c);
  }
  // deep shadow under the counter lip
  for (let y = y0; y < y0 + 12; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < 1 - (y - y0) / 12) s.px(x, y, M[0]);
  // meltwater puddle reflecting the window
  for (let y = 336; y < 352; y++) for (let x = 470; x < 540; x++) {
    const dx = (x - 505) / 35, dy = (y - 344) / 8;
    if (dx * dx + dy * dy < 1 - fbm(x * 0.2, y * 0.3, 3) * 0.35) s.px(x, y, (x + y) % 5 === 0 ? C[6] : bayer(x, y) < 0.4 ? C[3] : M[2]);
  }
  // floor drain grate bottom-left
  for (let y = 344; y < H; y++) for (let x = 14; x < 74; x++) s.px(x, y, (x % 4 === 0) ? M[0] : y === 344 ? M[6] : M[3]);
}

function paintInventoryFrame(s: Surface) {
  const f = GRID_FRAME;
  // drop shadow on the floor
  for (let y = f.y + 3; y < Math.min(H, f.y + f.h + 4); y++) for (let x = f.x + 4; x < f.x + f.w + 4; x++) if (bayer(x, y) < 0.75) s.px(x, y, M[0]);
  // rust-painted steel frame
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
    const L = lightAt(x, y);
    const top = y - f.y, lx = x - f.x, rx = f.x + f.w - 1 - x, by = f.y + f.h - 1 - y;
    const edgeHi = top === 0 || lx === 0 ? 1.6 : 0;
    const edgeLo = rx === 0 || by === 0 ? -1.4 : 0;
    let v = 3 + L.v * 0.9 + grime(x, y, 101) * 0.6 + edgeHi + edgeLo;
    let c = shade(R, v, x, y);
    if (fbm(x * 0.09, y * 0.09, 102) > 0.66) c = shade(M, v - 0.8, x, y); // paint worn through
    s.px(x, y, c);
  }
  // inner well
  const ix = GRID.x - 2, iy = GRID.y - 2, iw = GRID.cols * CELL + 4, ih = GRID.rows * CELL + 4;
  s.rect(ix, iy, iw, ih, R[0]);
  s.hline(ix, ix + iw - 1, iy + ih - 1, R[5]); s.vline(ix + iw - 1, iy, iy + ih - 1, R[5]);
  // cells: dark slots with faint dividers
  for (let cy = 0; cy < GRID.rows; cy++) for (let cx = 0; cx < GRID.cols; cx++) {
    const x = GRID.x + cx * CELL, y = GRID.y + cy * CELL;
    for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++) {
      let c: Col = T[1];
      if (i === 0 || j === 0) c = T[0];
      else if (i === CELL - 1 || j === CELL - 1) c = T[2];
      else if (bayer(x + i, y + j) < 0.12 + (j / CELL) * 0.1) c = T[2];
      s.px(x + i, y + j, c);
    }
  }
  // bolts and stencil
  for (const [bx, by] of [[f.x + 3, f.y + 3], [f.x + f.w - 5, f.y + 3], [f.x + 3, f.y + f.h - 5], [f.x + f.w - 5, f.y + f.h - 5]]) rivet(s, bx, by, R[7], R[1], R[4]);
  text(s, 'STOCK', f.x + 10, f.y + 1, R[2], TINY);
  text(s, 'MAX LOAD 65', f.x + f.w - 54, f.y + 1, R[2], TINY);
}

function paintControls(s: Surface) {
  const c = CONTROLS;
  s.bevel(c.x, c.y, c.w, c.h, M[3], M[6], M[1]);
  s.dither(c.x + 1, c.y + 1, c.w - 2, c.h - 2, M[2], 0.25);
  rivet(s, c.x + 2, c.y + 2, M[7], M[1]); rivet(s, c.x + c.w - 4, c.y + 2, M[7], M[1]);
  rivet(s, c.x + 2, c.y + c.h - 4, M[7], M[1]); rivet(s, c.x + c.w - 4, c.y + c.h - 4, M[7], M[1]);
  // three chunky buttons
  const btn = (x: number, base: Col[], glyph: (bx: number, by: number) => void) => {
    s.rect(x - 1, c.y + 2, 16, 14, M[0]);
    s.bevel(x, c.y + 2, 14, 12, base[2], base[3], base[0]);
    s.hline(x + 1, x + 12, c.y + 3, base[4]);
    glyph(x, c.y + 2);
  };
  const green = [hex('#0f2a12'), hex('#1d4a1f'), hex('#2f7a2c'), hex('#58b046'), hex('#8fdc6c')];
  const red = [P.blood[1], P.blood[2], P.blood[3], P.blood[4], P.blood[5]];
  const teal = [T[1], T[3], T[5], T[7], T[8]];
  btn(c.x + 10, green, (x, y) => { // accept: down arrow (into stock)
    s.vline(x + 7, y + 3, y + 7, green[4]); s.vline(x + 6, y + 3, y + 7, green[4]);
    s.hline(x + 4, x + 9, y + 7, green[4]); s.hline(x + 5, x + 8, y + 8, green[4]); s.hline(x + 6, x + 7, y + 9, green[4]);
  });
  btn(c.x + 32, red, (x, y) => { // reject: X
    for (let k = 0; k < 6; k++) { s.px(x + 4 + k, y + 3 + k, red[4]); s.px(x + 5 + k, y + 3 + k, red[4]); s.px(x + 9 - k, y + 3 + k, red[4]); s.px(x + 10 - k, y + 3 + k, red[4]); }
  });
  btn(c.x + 54, teal, (x, y) => { // inspect: lens
    s.ring(x + 6, y + 5, 3, teal[4]); s.line(x + 8, y + 7, x + 10, y + 9, teal[4]); s.px(x + 5, y + 4, P.white);
  });
  // LED readout window for indicators
  s.rect(c.x + 76, c.y + 4, 22, 9, M[0]);
  s.frame(c.x + 75, c.y + 3, 24, 11, M[5]);
}

import { hex } from '../engine/palette';

export function buildRoom(): Surface {
  const s = new Surface(W, H);
  paintWalls(s);
  paintCeiling(s);
  paintFloor(s);
  paintCounter(s);
  paintWindowFrame(s);
  paintInventoryFrame(s);
  paintControls(s);
  return s;
}
