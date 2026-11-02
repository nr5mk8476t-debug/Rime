// Diegetic-feeling UI drawn on the pixel grid: speech plate, tooltips, LED digits.

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { text, wrap, measure, BODY, TINY } from '../engine/font';

const T = P.teal, A = P.amber, M = P.metal, B = P.blood, PA = P.paper;

/** 7-segment digit, 5x9 */
const SEG: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
};
export function segDigit(s: Surface, ch: string, x: number, y: number, on: Col, off: Col) {
  const lit = SEG[ch] ?? '';
  const seg = (k: string, pts: number[][]) => { for (const [px, py] of pts) s.px(x + px, y + py, lit.includes(k) ? on : off); };
  seg('a', [[1, 0], [2, 0], [3, 0]]);
  seg('b', [[4, 1], [4, 2], [4, 3]]);
  seg('c', [[4, 5], [4, 6], [4, 7]]);
  seg('d', [[1, 8], [2, 8], [3, 8]]);
  seg('e', [[0, 5], [0, 6], [0, 7]]);
  seg('f', [[0, 1], [0, 2], [0, 3]]);
  seg('g', [[1, 4], [2, 4], [3, 4]]);
}

/** Speech plate anchored beside the customer's mouth. Returns its bounds. */
export function speech(s: Surface, x: number, y: number, name: string, line: string, shown: number, patience: number, suspicion: number, menace = false) {
  const w = 142;
  const lines = wrap(line, w - 12, BODY);
  const h = 10 + lines.length * 10 + 14;
  // name tag
  const nw = measure(name.toUpperCase(), TINY) + 10;
  const tagC = menace ? B[3] : A[4], tagHi = menace ? B[5] : A[6], tagLo = menace ? B[1] : A[2];
  s.bevel(x + 6, y, nw, 9, tagC, tagHi, tagLo);
  text(s, name.toUpperCase(), x + 11, y + 2, menace ? PA[5] : M[0], TINY);
  // plate
  const py = y + 8;
  s.rect(x + 1, py + 1, w, h, P.black); // drop shadow
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j < 2 ? T[2] : bayer(x + i, py + j) < 0.08 ? T[1] : T[0];
    s.px(x + i, py + j, c);
  }
  s.frame(x, py, w, h, menace ? B[2] : T[4]);
  s.hline(x + 1, x + w - 2, py + 1, menace ? B[1] : T[3]);
  // pointer toward the speaker (left)
  for (let k = 0; k < 5; k++) { s.vline(x - 1 - k, py + 8 + k, py + 16 - k, T[0]); s.px(x - 1 - k, py + 8 + k, menace ? B[2] : T[4]); s.px(x - 1 - k, py + 16 - k, menace ? B[2] : T[4]); }
  // typed text
  let left = shown;
  lines.forEach((ln, i) => {
    if (left <= 0) return;
    const part = ln.slice(0, left);
    left -= ln.length + 1;
    text(s, part, x + 7, py + 6 + i * 10, PA[5], BODY, P.black);
  });
  // indicators: patience (hourglass) and suspicion (eye)
  const iy = py + h - 11;
  s.hline(x + 4, x + w - 5, iy - 2, T[2]);
  // hourglass
  const hx = x + 7;
  s.hline(hx, hx + 4, iy, A[4]); s.hline(hx, hx + 4, iy + 6, A[4]);
  s.hline(hx + 1, hx + 3, iy + 1, A[3]); s.px(hx + 2, iy + 2, A[3]); s.px(hx + 2, iy + 3, A[5]); s.hline(hx + 1, hx + 3, iy + 5, A[5]); s.px(hx + 2, iy + 4, A[5]);
  pips(s, hx + 8, iy + 1, patience, A[5], A[1]);
  // eye
  const ex = x + 80;
  s.hline(ex + 1, ex + 5, iy + 1, B[4]); s.hline(ex + 1, ex + 5, iy + 5, B[4]); s.px(ex, iy + 3, B[4]); s.px(ex + 6, iy + 3, B[4]);
  s.px(ex, iy + 2, B[4]); s.px(ex + 6, iy + 2, B[4]); s.px(ex, iy + 4, B[4]); s.px(ex + 6, iy + 4, B[4]);
  s.rect(ex + 2, iy + 2, 3, 3, B[3]); s.px(ex + 3, iy + 3, P.black);
  pips(s, ex + 10, iy + 1, suspicion, B[5], B[1]);
  return { x, y, w, h: h + 8 };
}

function pips(s: Surface, x: number, y: number, n: number, on: Col, off: Col) {
  for (let i = 0; i < 6; i++) {
    const c = i < n ? on : off;
    s.rect(x + i * 7, y, 5, 5, c);
    if (i < n) s.hline(x + i * 7, x + i * 7 + 4, y, P.white === on ? on : lighten(on));
  }
}
function lighten(c: Col): Col { return c === P.amber[5] ? P.amber[6] : c === P.blood[5] ? P.paper[5] : c; }

/** Tooltip tag for an item: title, blurb, estimate. Placed near (x,y) but kept on screen. */
export function tooltip(s: Surface, x: number, y: number, title: string, lines: string[], estimate: string, warn?: string) {
  const w = Math.max(measure(title, BODY), ...lines.map((l) => measure(l, BODY)), measure(estimate, TINY) + 4) + 14;
  const h = 14 + lines.length * 10 + 10 + (warn ? 9 : 0);
  let tx = x + 10, ty = y - h - 6;
  if (tx + w > 636) tx = x - w - 10;
  if (ty < 4) ty = y + 14;
  s.rect(tx + 2, ty + 2, w, h, P.black);
  // paper tag
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.px(tx + i, ty + j, j < 12 ? A[2] : bayer(tx + i, ty + j) < 0.1 ? PA[4] : PA[5]);
  s.frame(tx, ty, w, h, A[1]);
  s.hline(tx, tx + w - 1, ty + 12, A[1]);
  // punched hole + string
  s.circle(tx + 5, ty + 6, 1, A[0]);
  text(s, title, tx + 10, ty + 3, PA[5], BODY, A[0]);
  lines.forEach((l, i) => text(s, l, tx + 6, ty + 16 + i * 10, M[1], BODY));
  let by = ty + 16 + lines.length * 10;
  if (warn) { text(s, warn, tx + 6, by, B[3], TINY); by += 9; }
  text(s, estimate, tx + 6, by, P.rust[2], TINY);
}

/** Persistent detail card for the selected item (paper tag pinned at a fixed spot). */
export function itemCard(s: Surface, x: number, y: number, def: { name: string; category: string; w: number; h: number; detail: string; blurb: string }, o: { owner: string; estimate: string; warn?: string }) {
  const w = 170;
  const lines = wrap(def.detail, w - 14, BODY);
  const h = 44 + lines.length * 10 + (o.warn ? 9 : 0);
  s.rect(x + 2, y + 2, w, h, P.black);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.px(x + i, y + j, j < 13 ? A[2] : bayer(x + i, y + j) < 0.1 ? PA[4] : PA[5]);
  s.frame(x, y, w, h, A[1]);
  s.hline(x, x + w - 1, y + 13, A[1]);
  text(s, def.name, x + 6, y + 3, PA[5], BODY, A[0]);
  grip(s, x + w - 16, y + 3, A[4], A[0]);
  text(s, `${def.category.toUpperCase()}  ${def.w}x${def.h}  ${o.owner.toUpperCase()}`, x + 6, y + 17, P.rust[2], TINY);
  lines.forEach((l, i) => text(s, l, x + 6, y + 26 + i * 10, M[1], BODY));
  let by = y + 28 + lines.length * 10;
  if (o.warn) { text(s, o.warn, x + 6, by, B[3], TINY); by += 9; }
  text(s, o.estimate, x + 6, by, P.rust[2], TINY);
  text(s, 'ESC TO CLOSE', x + w - 50, by, PA[2], TINY);
}

/** Short floating feedback message near the cursor. */
export function toast(s: Surface, x: number, y: number, msg: string, bad: boolean, age: number) {
  if (age > 1.2 && Math.floor(age * 10) % 2) return; // fade out by flicker
  const w = measure(msg, BODY) + 10;
  let tx = Math.round(x - w / 2); tx = Math.max(4, Math.min(636 - w, tx));
  const ty = Math.max(4, Math.round(y) - 12);
  s.rect(tx + 1, ty + 1, w, 12, P.black);
  s.rect(tx, ty, w, 12, bad ? B[1] : T[1]);
  s.frame(tx, ty, w, 12, bad ? B[3] : T[5]);
  text(s, msg, tx + 5, ty + 3, PA[5], BODY, P.black);
}

export interface Button { x: number; y: number; w: number; h: number; on: () => void; enabled: boolean; step?: number }

/** Chunky bevelled push-button in the shop's palette. Returns the button rect for hit-testing. */
export function button(s: Surface, x: number, y: number, w: number, label: string, o: { enabled?: boolean; hover?: boolean; tone?: 'plain' | 'go' | 'stop' | 'tool' } = {}): { x: number; y: number; w: number; h: number } {
  const h = 13;
  const en = o.enabled !== false;
  const ramp = o.tone === 'go' ? [hexc('#0f2a12'), hexc('#1d4a1f'), hexc('#2f7a2c'), hexc('#58b046')]
    : o.tone === 'stop' ? [B[0], B[1], B[2], B[3]]
    : o.tone === 'tool' ? [T[1], T[2], T[4], T[6]]
    : [M[1], M[2], M[4], M[6]];
  const face = !en ? M[2] : o.hover ? ramp[3] : ramp[2];
  s.rect(x + 1, y + 1, w, h, P.black);
  s.bevel(x, y, w, h, face, en ? (o.hover ? PA[4] : ramp[3]) : M[3], ramp[0]);
  const lw = measure(label, BODY);
  text(s, label, x + Math.round((w - lw) / 2), y + 3, en ? PA[5] : M[4], BODY, en ? P.black : undefined);
  return { x, y, w, h };
}
function hexc(h: string) { const n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0; }

/** Clipboard-style deal sheet background. */
export function sheet(s: Surface, x: number, y: number, w: number, h: number, title: string) {
  s.rect(x + 2, y + 2, w, h, P.black);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.px(x + i, y + j, j < 13 ? P.rust[2] : bayer(x + i, y + j) < 0.08 ? T[1] : T[0]);
  s.frame(x, y, w, h, P.rust[4]);
  s.hline(x + 1, x + w - 2, y + 13, P.rust[1]);
  text(s, title, x + 6, y + 3, PA[5], BODY, P.black);
  grip(s, x + w - 16, y + 3, P.rust[5], P.rust[0]);
}
/** six-dot drag grip */
export function grip(s: Surface, x: number, y: number, hi: Col, lo: Col) {
  for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) { s.px(x + i * 4, y + j * 3, hi); s.px(x + i * 4 + 1, y + j * 3 + 1, lo); }
}

/** Large pixel text: the body font scaled up by whole pixels. */
export function bigText(s: Surface, str: string, x: number, y: number, scale: number, col: Col, shadow?: Col) {
  const w = measure(str, BODY) + 2, tmp = new Surface(w, 12);
  text(tmp, str, 0, 0, col, BODY);
  for (let j = 0; j < tmp.h; j++) for (let i = 0; i < tmp.w; i++) {
    const c = tmp.get(i, j); if (!c) continue;
    if (shadow) s.rect(x + i * scale + scale, y + j * scale + scale, scale, scale, shadow);
  }
  for (let j = 0; j < tmp.h; j++) for (let i = 0; i < tmp.w; i++) { const c = tmp.get(i, j); if (c) s.rect(x + i * scale, y + j * scale, scale, scale, c); }
  return w * scale;
}
