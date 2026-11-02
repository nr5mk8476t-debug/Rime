// The shop scene: composes static paint, ambient animation, the customer, goods, screens and UI.
// Milestone 1 (visual review): no trading yet - hover to read, keys to switch cast and lighting.

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { text, BODY, TINY } from '../engine/font';
import { hash2 } from '../engine/rng';
import { W, H, DW, DH, RES, WIN, CUSTOMER, GRID, CELL, TRAY, CONTROLS } from './layout';
import { buildExteriorStatic, ExteriorAnim } from '../art/exterior';
import { buildRoom } from '../art/room';
import { buildProps, SCREENS, fanGrille, ventGrille } from '../art/props';
import { buildMiner } from '../art/characters/miner';
import { buildLandlord } from '../art/characters/landlord';
import { CustomerView } from './customerView';
import { itemSprite } from '../art/items';
import { ITEMS, START_STOCK } from '../data/items';
import { REVIEW_LINES, TERMINAL_FEED } from '../data/reviewLines';
import { segDigit, speech, tooltip } from './ui';
import { BALANCE } from '../data/balance';
import kellGpt from '../art/portraits/kell_gpt_300.png';

const kellGptImg = new Image();
kellGptImg.src = kellGpt;

const A = P.amber, T = P.teal, M = P.metal, B = P.blood, PA = P.paper, R = P.rust, C = P.cold;

interface Placed { id: string; col: number; row: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; c: Col }
interface Hotspot { x: number; y: number; w: number; h: number; title: string; lines: string[]; foot: string }

function glowCanvas(r: number, rgb: string, rx = 1, ry = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(r * 2 * rx); c.height = Math.ceil(r * 2 * ry);
  const g = c.getContext('2d')!;
  g.scale(rx, ry);
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.45)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

export class ShopScene {
  scale = 1;
  t = 0;
  cursor = 'default';
  ext: Surface;
  extAnim = new ExteriorAnim();
  room: Surface;
  anim = new Surface(W, H);
  ui = new Surface(W, H);
  fanG = new Surface(48, 48);
  ventG = new Surface(44, 44);
  cast: CustomerView[];
  who = 0;
  lineIdx = [0, 0];
  shown = 0;
  stock: Placed[] = START_STOCK.map(([id, col, row]) => ({ id, col, row }));
  mouse = { x: -1, y: -1 };
  night = false;
  nightMap: HTMLCanvasElement;
  tremor = 0;
  nextTremor = 45;
  shake = { x: 0, y: 0 };
  dust: Particle[] = [];
  steam: Particle[] = [];
  motes: Particle[] = [];
  bulbOn = true;
  tubeLevel = 1;
  spark = 0;
  nextSpark = 8;
  glows: Record<string, HTMLCanvasElement>;
  credits = BALANCE.startCredits;
  hotspots: Hotspot[];

  constructor() {
    this.ext = buildExteriorStatic();
    this.ext.flush();
    this.room = buildRoom();
    buildProps(this.room);
    this.room.flush();
    // grilles painted once at their own offsets
    const fg = new Surface(W, H); fanGrille(fg); copyRegion(fg, this.fanG, 446, 28);
    const vg = new Surface(W, H); ventGrille(vg); copyRegion(vg, this.ventG, 482, 240);
    this.cast = [new CustomerView(buildMiner()), new CustomerView(buildLandlord())];
    this.glows = {
      tube: glowCanvas(60, '255,214,140', 2.2, 0.7),
      bulb: glowCanvas(46, '255,190,110'),
      heater: glowCanvas(58, '255,120,60'),
      crt: glowCanvas(44, '120,230,190'),
      amber: glowCanvas(36, '255,180,90'),
      red: glowCanvas(22, '255,50,40'),
      redBig: glowCanvas(120, '255,40,40'),
      spark: glowCanvas(18, '255,230,160'),
      vel: glowCanvas(18, '180,120,255'),
    };
    this.nightMap = this.buildNightMap();
    for (let i = 0; i < 14; i++) this.motes.push(this.newMote(true));
    this.hotspots = [
      { x: 136, y: 122, w: 68, h: 54, title: 'Register', lines: ['Everything you own in cash.'], foot: 'CREDITS ON HAND' },
      { x: 108, y: 30, w: 88, h: 44, title: 'Tenancy display', lines: [`Rent ${BALANCE.rent[0]} cr, due end of day 5.`, 'Mr. Voss collects in person.'], foot: 'NO EXTENSIONS' },
      { x: 444, y: 104, w: 74, h: 60, title: 'K-NET terminal', lines: ['News, notices, messages.'], foot: 'READING COSTS NO TIME' },
      { x: 534, y: 104, w: 92, h: 72, title: 'Spectra II scanner', lines: ['Bench analyser. Drop goods', 'on the pad to inspect them.'], foot: 'INSPECTION TAKES TIME' },
      { x: 10, y: 30, w: 92, h: 98, title: 'Notice board', lines: ['Curfew order, a wanted sheet,', 'a union flyer, a family photo.'], foot: 'NOT YOURS. THE LAST TENANT\'S' },
    ];
  }

  get customer() { return this.cast[this.who]; }
  get line() { return REVIEW_LINES[this.customer.art.id][this.lineIdx[this.who]]; }

  // ------------------------------------------------------------------ input
  pointer(x: number, y: number) { this.mouse = { x, y }; }
  click(x: number, y: number) {
    // clicking the speech plate (or anywhere in the window) advances the review dialogue
    if (y < 175 && x > 216 && x < 500) this.nextLine();
  }
  key(k: string) {
    if (k === '1' || k === '2') { this.who = k === '1' ? 0 : 1; this.startLine(); }
    if (k === 'e' || k === 'E') this.nextLine();
    if (k === ' ') this.nextLine();
    if (k === 'n' || k === 'N') this.night = !this.night;
    if (k === 't' || k === 'T') this.startTremor();
    if (k === 'c' || k === 'C') this.hideCustomer = !this.hideCustomer;
    if (k === '3') { this.who = 0; this.gptTest = !this.gptTest; this.startLine(); }
  }
  nextLine() {
    const n = REVIEW_LINES[this.customer.art.id].length;
    this.lineIdx[this.who] = (this.lineIdx[this.who] + 1) % n;
    this.startLine();
  }
  startLine() {
    this.shown = 0;
    this.customer.expr = this.line.expr;
    this.customer.talking = this.line.text.length / 42 + 0.1;
  }
  startTremor() {
    this.tremor = 1.5;
    this.customer.startle = 1.2;
    for (let i = 0; i < 40; i++) this.dust.push({ x: Math.random() * W, y: 10 + Math.random() * 6, vx: (Math.random() - 0.5) * 6, vy: 10 + Math.random() * 20, life: 0, max: 3, c: Math.random() < 0.5 ? PA[2] : M[5] });
  }

  // ------------------------------------------------------------------ update
  newMote(anywhere = false): Particle {
    return { x: 236 + Math.random() * 170, y: anywhere ? 44 + Math.random() * 120 : 40, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, life: 0, max: 8 + Math.random() * 8, c: A[5] };
  }

  update(dt: number) {
    this.t += dt;
    if (this.t > 0.6 && this.shown === 0 && this.customer.talking <= 0 && !this.started) { this.started = true; this.startLine(); }
    this.shown = Math.min(this.line.text.length, this.shown + dt * 42);
    this.extAnim.update(dt, this.t);
    this.customer.update(dt);
    // tremors: rare, scripted for review with T
    this.nextTremor -= dt;
    if (this.nextTremor <= 0) { this.startTremor(); this.nextTremor = 70 + Math.random() * 60; }
    if (this.tremor > 0) {
      this.tremor -= dt;
      const a = this.tremor > 0.4 ? 1 : 0;
      this.shake = { x: a * Math.round(Math.sin(this.t * 61) * 1.4), y: a * Math.round(Math.cos(this.t * 47)) };
    } else this.shake = { x: 0, y: 0 };
    // bulb flicker: mostly on, occasional stutters (and constant stutter during tremors)
    const fl = hash2(Math.floor(this.t * 12), 7, 3);
    this.bulbOn = this.tremor > 0 ? fl > 0.4 : !(fl > 0.965 || (Math.floor(this.t / 9) % 3 === 0 && fl > 0.8));
    const tl = hash2(Math.floor(this.t * 20), 9, 5);
    this.tubeLevel = tl > 0.985 ? 0.35 : 1;
    // junction box sparks
    this.nextSpark -= dt;
    if (this.nextSpark <= 0) { this.spark = 0.15; this.nextSpark = 9 + Math.random() * 14; }
    if (this.spark > 0) this.spark -= dt;
    // steam from the mug and kettle
    if (Math.random() < dt * 6) this.steam.push({ x: 115 + Math.random() * 4, y: 160, vx: (Math.random() - 0.3) * 2, vy: -6 - Math.random() * 3, life: 0, max: 1.6 + Math.random(), c: C[7] });
    if (Math.random() < dt * 3) this.steam.push({ x: 62 + Math.random() * 2, y: 276, vx: 2 + Math.random() * 3, vy: -7 - Math.random() * 3, life: 0, max: 1.8, c: C[6] });
    for (const p of this.steam) { p.x += p.vx * dt + Math.sin(this.t * 3 + p.y * 0.3) * 0.15; p.y += p.vy * dt; p.life += dt; }
    this.steam = this.steam.filter((p) => p.life < p.max);
    for (const p of this.dust) { p.x += p.vx * dt; p.vy += 40 * dt; p.y += p.vy * dt; p.life += dt; }
    this.dust = this.dust.filter((p) => p.life < p.max && p.y < H);
    for (const p of this.motes) {
      p.x += p.vx * dt + Math.sin(this.t * 0.7 + p.max) * 0.08; p.y += p.vy * dt; p.life += dt;
      if (p.life > p.max || p.y > 170) Object.assign(p, this.newMote());
    }
  }
  started = false;
  hideCustomer = false;
  gptTest = true;

  // ------------------------------------------------------------------ hover
  stockAt(x: number, y: number): Placed | null {
    const col = Math.floor((x - GRID.x) / CELL), row = Math.floor((y - GRID.y) / CELL);
    if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) return null;
    return this.stock.find((p) => col >= p.col && col < p.col + ITEMS[p.id].w && row >= p.row && row < p.row + ITEMS[p.id].h) ?? null;
  }
  counterGood(): { id: string; x: number; y: number } | null {
    return this.customer.art.id === 'kell' ? { id: 'bundle', x: 318, y: 178 } : null;
  }

  // ------------------------------------------------------------------ render
  render(ctx: CanvasRenderingContext2D) {
    const t = this.t;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#050606';
    ctx.fillRect(0, 0, DW, DH);
    ctx.scale(RES, RES);
    ctx.translate(this.shake.x, this.shake.y);

    // exterior
    ctx.drawImage(this.ext.canvas, WIN.x, WIN.y);
    this.extAnim.draw(t);
    ctx.drawImage(this.extAnim.layer.canvas, WIN.x, WIN.y);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(this.extAnim.fog.canvas, WIN.x, WIN.y);
    ctx.globalAlpha = 1;
    // customer
    if (this.gptTest && this.who === 0) {
      // review: ChatGPT concept converted to the game's pixel scale (static, no face animation yet)
      // full-resolution portrait: drawn at half size in design units = 1:1 screen pixels
      const b = (this.t % 3.6) < 1.5 ? -0.5 : 0;
      const w = kellGptImg.width / RES, h = kellGptImg.height / RES;
      ctx.drawImage(kellGptImg, 320 - w / 2, 172 + 5 - h + b, w, h);
    } else if (!this.hideCustomer) this.customer.draw(ctx, CUSTOMER.x, CUSTOMER.y);
    // room
    ctx.drawImage(this.room.canvas, 0, 0);
    // animated layer
    this.paintAnim();
    ctx.drawImage(this.anim.canvas, 0, 0);
    // goods on the counter
    if (!(this.gptTest && this.who === 0)) this.customer.drawCounter(ctx, this.tremor > 0 ? this.shake.x : 0, 0);
    const good = this.counterGood();
    if (good) {
      const jig = this.tremor > 0.4 && Math.floor(t * 20) % 2 ? -1 : 0;
      ctx.drawImage(itemSprite(good.id).canvas, good.x, good.y + jig);
      // vel light leaking out of the bundle
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 2.2);
      ctx.drawImage(this.glows.vel, good.x + 2, good.y - 8);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else this.drawRentSlip(ctx);
    // stock
    for (const p of this.stock) ctx.drawImage(itemSprite(p.id).canvas, GRID.x + p.col * CELL, GRID.y + p.row * CELL);

    // light
    this.drawGlows(ctx);
    if (this.night) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.nightMap, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      // only light-emitting things punch back through the dark
      for (const r of EMISSIVE) { ctx.save(); ctx.beginPath(); ctx.rect(r[0], r[1], r[2], r[3]); ctx.clip(); ctx.drawImage(this.anim.canvas, 0, 0); ctx.restore(); }
      this.drawNightLights(ctx);
    }
    ctx.restore();

    // UI (never shakes)
    this.paintUI();
    ctx.drawImage(this.ui.flush(), 0, 0, DW, DH);
  }

  paintAnim() {
    const s = this.anim, t = this.t;
    s.clear();
    // --- tenancy display (amber CRT)
    const d = SCREENS.day;
    const dim = hash2(Math.floor(t * 8), 3, 1) > 0.97;
    const ink = dim ? A[3] : A[5], ink2 = dim ? A[2] : A[4];
    text(s, 'DAY 1', d.x + 4, d.y + 4, ink, BODY);
    text(s, 'MON', d.x + d.w - 21, d.y + 4, ink2, BODY);
    text(s, `RENT ${BALANCE.rent[0]}`, d.x + 4, d.y + 14, ink, BODY);
    text(s, 'CR', d.x + 59, d.y + 16, ink2, TINY);
    const blink = Math.floor(t * 1.5) % 2 === 0;
    text(s, 'DUE IN 5 DAYS', d.x + 4, d.y + 24, blink ? A[4] : A[3], TINY);
    for (let y = d.y; y < d.y + d.h; y += 2) for (let x = d.x; x < d.x + d.w; x++) if (s.get(x, y)) s.px(x, y, A[3]);

    // --- register LEDs
    const r = SCREENS.register;
    const cr = String(Math.max(0, Math.floor(this.credits))).padStart(4, ' ');
    for (let i = 0; i < 4; i++) segDigit(s, cr[i], r.x + 3 + i * 7, r.y + 1, P.neonRed, B[0]);
    text(s, 'CR', r.x + r.w - 11, r.y + 5, B[3], TINY);
    s.px(r.x + 1, r.y + 1, Math.floor(t * 2) % 2 ? P.neonRed : B[1]);

    // --- K-NET terminal
    const tm = SCREENS.terminal;
    const scroll = Math.floor(t / 2.2);
    const glitch = this.tremor > 0 && Math.floor(t * 30) % 3 === 0 ? 2 : 0;
    for (let i = 0; i < 6; i++) {
      const line = TERMINAL_FEED[(scroll + i) % TERMINAL_FEED.length];
      const head = line.startsWith('>');
      const c = head ? P.neonCyan : i === 5 ? T[6] : T[8];
      const typed = i === 5 ? line.slice(0, Math.floor(((t % 2.2) / 2.2) * line.length * 1.6)) : line;
      text(s, typed, tm.x + 2 + (i % 2 ? glitch : 0), tm.y + 3 + i * 6, c, TINY);
    }
    if (Math.floor(t * 2) % 2) s.rect(tm.x + 2, tm.y + 39, 3, 2, T[8]);
    for (let y = tm.y; y < tm.y + tm.h; y += 2) for (let x = tm.x; x < tm.x + tm.w; x++) { const c = s.get(x, y); if (c === T[8]) s.px(x, y, T[7]); }
    s.px(tm.x + tm.w + 4, tm.y + tm.h + 6, P.neonGreen);

    // --- scanner readout
    const sc = SCREENS.scanner;
    const anomaly = this.customer.art.id === 'kell';
    if (anomaly) {
      if (Math.floor(t * 3) % 2) text(s, 'ANOMALY', sc.x + 3, sc.y + 2, P.neonMag, TINY);
      for (let x = 0; x < sc.w - 4; x++) {
        const v = Math.sin(x * 0.9 + t * 9) * 3 * (0.5 + 0.5 * Math.sin(t * 2.3 + x * 0.2)) + (hash2(x, Math.floor(t * 10), 2) - 0.5) * 3;
        s.px(sc.x + 2 + x, sc.y + 12 + Math.round(v), P.vel[5]);
      }
    } else {
      text(s, 'READY', sc.x + 3, sc.y + 2, T[7], TINY);
      for (let x = 0; x < sc.w - 4; x++) s.px(sc.x + 2 + x, sc.y + 12 + Math.round(Math.sin(x * 0.4 + t * 3) * 1.2), T[6]);
    }
    // scanner gauge needle (needs to move when it reads something)
    const gx = 594, gy = 154;
    const ang = Math.PI * (anomaly ? 1.45 + Math.sin(t * 7) * 0.12 : 1.05 + Math.sin(t * 0.8) * 0.02);
    s.line(gx, gy, gx + Math.round(Math.cos(ang) * 6), gy + Math.round(Math.sin(ang) * 6), B[3]);
    s.px(gx, gy, M[1]);
    // scanner LEDs
    s.px(546, 140, anomaly && Math.floor(t * 4) % 2 ? P.neonMag : T[2]);
    s.px(550, 140, P.neonGreen);
    s.px(554, 140, Math.floor(t * 1.3) % 2 ? P.neonAmber : A[1]);

    // --- fans
    this.fan(s, 470, 52, 20, t * 9);
    s.blit(this.fanG, 446, 28);
    this.fan(s, 504, 262, 18, t * 3);
    s.blit(this.ventG, 482, 240);

    // --- heater coils
    for (let k = 0; k < 4; k++) {
      const y = 300 + k * 9;
      const glow = 0.5 + 0.5 * Math.sin(t * 0.9 + k * 0.7);
      for (let x = 28; x < 72; x++) {
        const wave = Math.round(Math.sin(x * 0.8) * 1.5);
        s.px(x, y + wave, glow > 0.6 ? A[5] : R[6]);
        s.px(x, y + wave + 1, R[4]);
      }
    }
    // --- bulb (re-painted dark when it stutters)
    if (!this.bulbOn) { s.ellipse(128, 24, 3, 4, A[1]); s.px(127, 22, A[2]); }
    // --- tube under the shutter
    if (this.night || this.tubeLevel < 1) { s.hline(WIN.x + 26, WIN.x + WIN.w - 27, WIN.y + 13, M[3]); s.hline(WIN.x + 28, WIN.x + WIN.w - 29, WIN.y + 14, M[2]); }

    // --- small indicator lights
    s.px(612, 17, Math.floor(t * 1.2) % 2 ? P.neonRed : B[1]); // CCTV
    s.px(531, 40, Math.floor(t * 0.7) % 3 ? P.neonGreen : T[2]); // junction
    const c = CONTROLS;
    s.px(c.x + 80, c.y + 8, P.neonGreen);
    s.px(c.x + 86, c.y + 8, Math.floor(t * 2) % 2 ? P.neonAmber : A[1]);
    s.px(c.x + 92, c.y + 8, B[1]);
    // spark from the junction box
    if (this.spark > 0) { for (let k = 0; k < 5; k++) s.px(518 + Math.round((Math.random() - 0.5) * 8), 76 + Math.round(Math.random() * 5), Math.random() < 0.5 ? P.white : A[6]); }

    // --- steam, dust, motes
    for (const p of this.steam) {
      const k = p.life / p.max;
      if (k < 0.6 || bayer(Math.round(p.x), Math.round(p.y)) < 0.5) s.px(p.x, p.y, k < 0.4 ? p.c : C[5]);
    }
    for (const p of this.dust) s.px(p.x, p.y, p.c);
    if (!this.night) for (const p of this.motes) { const k = p.life / p.max; if (k > 0.1 && k < 0.9 && Math.sin(this.t * 2 + p.max) > -0.3) s.px(p.x, p.y, A[4]); }

    // --- after hours: shutter pulled half down, red emergency lamp on the post
    if (this.night) {
      for (let y = WIN.y; y < WIN.y + 34; y++) for (let x = WIN.x; x < WIN.x + WIN.w; x++) {
        const k = (y - WIN.y) % 3;
        s.px(x, y, k === 0 ? R[3] : k === 1 ? R[2] : R[0]);
      }
      s.hline(WIN.x, WIN.x + WIN.w - 1, WIN.y + 34, M[0]);
      s.rect(WIN.x + 96, WIN.y + 31, 16, 3, M[2]);
      const on = Math.sin(t * 2.4) > -0.2;
      s.rect(203, 34, 7, 8, M[1]); s.rect(204, 35, 5, 6, on ? P.neonRed : B[1]); s.vline(206, 35, 40, M[1]); s.hline(204, 208, 38, M[1]);
      s.px(205, 36, on ? P.white : B[2]);
    }
    s.flush();
  }

  fan(s: Surface, cx: number, cy: number, r: number, rot: number) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > r || d < 3) continue;
      const a = Math.atan2(y, x) + rot;
      const blade = ((a * 3) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (blade < 1.3) s.px(cx + x, cy + y, blade < 0.25 ? M[5] : M[3]);
      else if (blade < 1.7) s.px(cx + x, cy + y, M[1]);
    }
  }

  drawRentSlip(ctx: CanvasRenderingContext2D) {
    // a rent notice slid across the tray toward you
    const s = new Surface(34, 20);
    s.poly([[2, 4], [30, 1], [32, 17], [4, 19]], PA[5]);
    s.line(2, 4, 30, 1, PA[3]);
    for (let k = 0; k < 4; k++) s.line(6, 8 + k * 2, 24, 6 + k * 2, PA[2]);
    s.ring(25, 13, 4, B[3]); s.ring(25, 13, 3, B[2]); s.px(25, 13, B[3]);
    text(s, '140', 6, 14, M[1], TINY);
    s.outline(P.black);
    ctx.drawImage(s.flush(), 252, 180);
  }

  drawGlows(ctx: CanvasRenderingContext2D) {
    const g = this.glows, t = this.t;
    ctx.globalCompositeOperation = 'lighter';
    const add = (c: HTMLCanvasElement, x: number, y: number, a: number) => { ctx.globalAlpha = a; ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); };
    if (!this.night) {
      add(g.tube, 320, 52, 0.13 * this.tubeLevel);
      if (this.bulbOn) add(g.bulb, 128, 26, 0.2);
      add(g.amber, 152, 51, 0.1);
    }
    add(g.heater, 50, 316, 0.16 + 0.04 * Math.sin(t * 0.9));
    add(g.crt, 481, 133, this.night ? 0.22 : 0.1);
    add(g.red, 169, 141, 0.16);
    if (this.customer.art.id === 'kell') add(g.vel, 561, 155, 0.15 + 0.1 * Math.sin(t * 6));
    if (this.spark > 0) add(g.spark, 518, 78, 0.6);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawNightLights(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + 0.06 * Math.sin(this.t * 2.4);
    ctx.drawImage(this.glows.redBig, 206 - 120, 38 - 120);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(this.glows.crt, 481 - 44, 133 - 44);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  buildNightMap(): HTMLCanvasElement {
    // multiply map for after-hours: near-black blue ambient, a red emergency pool, CRT and heater spill
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, H);
    const lights = [
      { x: 206, y: 40, r: 230, col: [1.0, 0.32, 0.3] },
      { x: 481, y: 133, r: 120, col: [0.35, 0.8, 0.7] },
      { x: 50, y: 318, r: 140, col: [0.9, 0.45, 0.25] },
      { x: 320, y: 110, r: 120, col: [0.32, 0.36, 0.55] },
      { x: 320, y: 300, r: 170, col: [0.42, 0.38, 0.46] },  // dim worklight over the stock tray
    ];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0.14, gg = 0.14, b = 0.24;
      for (const L of lights) {
        const d = Math.hypot(x - L.x, y - L.y) / L.r;
        if (d >= 1) continue;
        const a = (1 - d) * (1 - d);
        r += L.col[0] * a; gg += L.col[1] * a; b += L.col[2] * a;
      }
      // quantise into bands with ordered dither so the light stays pixel-crisp
      const q = (v: number) => { const s = Math.min(1, v) * 10; const lo = Math.floor(s); const f = s - lo; const g = f < 0.4 ? 0 : f > 0.6 ? 1 : (f - 0.4) / 0.2; return (g > bayer(x, y) ? lo + 1 : lo) / 10; };
      const i = (y * W + x) * 4;
      img.data[i] = q(r) * 255; img.data[i + 1] = q(gg) * 255; img.data[i + 2] = q(b) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  paintUI() {
    const s = this.ui;
    s.clear();
    const art = this.customer.art;
    const L = this.line;
    if (!this.hideCustomer) speech(s, 348, 48, art.name, L.text, Math.floor(this.shown), L.patience, L.suspicion, art.id === 'voss');
    // hover
    const { x, y } = this.mouse;
    this.cursor = 'default';
    const hovered = this.stockAt(x, y);
    if (hovered) {
      const def = ITEMS[hovered.id];
      const hx = GRID.x + hovered.col * CELL, hy = GRID.y + hovered.row * CELL;
      this.cellHighlight(s, hx, hy, def.w * CELL, def.h * CELL);
      tooltip(s, x, y, def.name, [def.blurb], `EST. RESALE ${def.value[0]}-${def.value[1]} CR`, def.contraband ? 'CONTRABAND' : undefined);
      this.cursor = 'pointer';
      return;
    }
    const good = this.counterGood();
    if (good && x >= good.x && x < good.x + 40 && y >= good.y && y < good.y + 20) {
      const def = ITEMS[good.id];
      this.cellHighlight(s, good.x - 1, good.y - 1, 42, 22);
      tooltip(s, x, y, def.name, [def.blurb, def.detail], 'EST. RESALE ??? CR', 'UNINSPECTED');
      this.cursor = 'pointer';
      return;
    }
    // empty grid cell highlight
    const col = Math.floor((x - GRID.x) / CELL), row = Math.floor((y - GRID.y) / CELL);
    if (col >= 0 && row >= 0 && col < GRID.cols && row < GRID.rows) {
      s.frame(GRID.x + col * CELL, GRID.y + row * CELL, CELL, CELL, T[3]);
      return;
    }
    for (const h of this.hotspots) {
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) {
        const lines = h.title === 'Register' ? [...h.lines, `${this.credits} credits.`] : h.lines;
        tooltip(s, x, y, h.title, lines, h.foot);
        this.cursor = 'help';
        return;
      }
    }
    void TRAY;
  }

  cellHighlight(s: Surface, x: number, y: number, w: number, h: number) {
    // bracket corners in amber, pulsing slightly
    const c = Math.floor(this.t * 3) % 2 ? A[5] : A[4];
    const k = 4;
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      for (let i = 0; i < k; i++) { s.px(cx + dx * i, cy, c); s.px(cx, cy + dy * i, c); }
    }
  }
}

/** screen-space rects of light-emitting things (redrawn over the after-hours darkness) */
const EMISSIVE: number[][] = [
  [SCREENS.day.x, SCREENS.day.y, SCREENS.day.w, SCREENS.day.h],
  [SCREENS.register.x, SCREENS.register.y, SCREENS.register.w, SCREENS.register.h],
  [SCREENS.terminal.x, SCREENS.terminal.y, SCREENS.terminal.w, SCREENS.terminal.h + 8],
  [SCREENS.scanner.x, SCREENS.scanner.y - 8, SCREENS.scanner.w + 12, SCREENS.scanner.h + 8],
  [CONTROLS.x + 76, CONTROLS.y + 4, 22, 9], [608, 14, 8, 6], [26, 296, 50, 40], [200, 30, 12, 14],
];

function copyRegion(src: Surface, dst: Surface, ox: number, oy: number) {
  for (let y = 0; y < dst.h; y++) for (let x = 0; x < dst.w; x++) {
    const c = src.get(ox + x, oy + y);
    if (c) dst.px(x, y, c);
  }
}
