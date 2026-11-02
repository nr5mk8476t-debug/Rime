// The shop scene, built around the painted interior plate (src/art/plates).
// Layers, back to front: exterior plate -> snow/haze -> customer -> interior plate (window cut out)
// -> goods -> stock tray -> live screens -> light -> after-hours darkness -> UI.
// Coordinates are design units (640x360); the canvas is 1280x720 (RES = 2).

import { Surface, bayer } from '../engine/surface';
import { P, type Col } from '../engine/palette';
import { text, measure, BODY, TINY } from '../engine/font';
import { hash2 } from '../engine/rng';
import { W, H, DW, DH, RES } from './layout';
import { ITEMS, START_STOCK } from '../data/items';
import { TERMINAL_FEED } from '../data/reviewLines';
import { speech, tooltip, itemCard, toast, button, sheet, bigText, type Button } from './ui';
import { Run, CLOSE_TIME } from '../game/run';
import { type Silhouette, condWord } from '../data/customers';
import { ITEMS as ITEMDEFS } from '../data/items';
import { OPEN_TIME } from '../data/encounters';
import { sound, type Material } from '../audio/audio';

/** what an item sounds like when handled */
function material(id: string): Material {
  if (id === 'vel') return 'crystal';
  if (id === 'locket') return 'chain';
  if (id === 'bundle' || id === 'noodles') return 'soft';
  if (id === 'stim' || id === 'filters') return 'plastic';
  if (id === 'eye' || id === 'eye2') return 'glass';
  return 'metal';
}
const panX = (devX: number) => (devX / DW) * 2 - 1;
import { Inventory, type Item } from '../game/inventory';
import { BALANCE } from '../data/balance';
import interiorUrl from '../art/plates/interior.png';
import exteriorUrl from '../art/plates/exterior.png';
import trayUrl from '../art/plates/tray.png';
import vossBase from '../art/portraits/voss_base.png';
import vossBlink from '../art/portraits/voss_blink.png';
import vossLaugh from '../art/portraits/voss_laugh.png';
import vossFlat from '../art/portraits/voss_flat.png';
import vossTalk from '../art/portraits/voss_talk.png';
import TRAYG from '../art/plates/tray.json';

const itemUrls = import.meta.glob('../art/items/*.png', { eager: true, query: '', import: 'default' }) as Record<string, string>;
const ITEM_IMG: Record<string, HTMLImageElement> = {};
for (const [path, url] of Object.entries(itemUrls)) ITEM_IMG[path.split('/').pop()!.replace('.png', '')] = img(url);
const ROWS = 4, COLS = 13;
/** device-pixel rect of an item footprint on the tray */
function cellRect(col: number, row: number, w = 1, h = 1) {
  return { x: TRAYG.x + col * TRAYG.cw, y: TRAYG.y + row * TRAYG.ch, w: w * TRAYG.cw, h: h * TRAYG.ch };
}

const A = P.amber, T = P.teal, M = P.metal, B = P.blood, R = P.rust, C = P.cold, PA = P.paper;

function img(src: string) { const i = new Image(); i.src = src; return i; }
const IMG = { interior: img(interiorUrl), exterior: img(exteriorUrl), tray: img(trayUrl) };
const KELL: Record<string, HTMLImageElement> = {};
for (const [path, url] of Object.entries(import.meta.glob('../art/portraits/kell_*.png', { eager: true, query: '', import: 'default' }) as Record<string, string>)) {
  KELL[path.split('/').pop()!.replace('kell_', '').replace('.png', '')] = img(url);
}
/** review-line expression index -> Kell frame */
const KELL_EXPR = ['neutral', 'angry', 'worried', 'smirk'];
const VOSS = { base: img(vossBase), blink: img(vossBlink), laugh: img(vossLaugh), flat: img(vossFlat), talk: img(vossTalk) };

/** Hi-res (device pixel) positions of things painted in the plate. */
const D = {
  win: { x: 357, y: 93, w: 559, h: 313 },
  counterTop: 406,
  regDisplay: { x: 209, y: 313, w: 68, h: 17 },
  rentScreen: { x: 1056, y: 185, w: 64, h: 62 },
  newsScreen: { x: 1016, y: 287, w: 85, h: 72 },
  scanScreen: { x: 1137, y: 336, w: 46, h: 40 },
  scanner: { x: 1104, y: 318, w: 110, h: 110 },
  lamp: { x: 190, y: 158 },
  heater: { x: 42, y: 590 },
  tube: { x: 1180, y: 92 },
  kellMouth: { x: 632, y: 252 },
  counterTray: { x: 496, y: 404, w: 292, h: 56 },
};

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; c: Col; s?: number }
interface Hotspot { x: number; y: number; w: number; h: number; title: string; lines: string[]; foot: string }

function glowCanvas(r: number, rgb: string, rx = 1, ry = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(r * 2 * rx); c.height = Math.ceil(r * 2 * ry);
  const g = c.getContext('2d')!;
  g.scale(rx, ry);
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.4)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

export class ShopScene {
  scale = 1;
  t = 0;
  cursor = 'default';
  ui = new Surface(W, H);            // design-unit UI (speech, tooltips), drawn at 2x for legibility
  hud = new Surface(DW, DH);         // device-resolution screen contents
  run = new Run();
  get inv() { return this.run.inv; }
  get wallet() { return this.run.wallet; }
  get enc() { return this.run.enc; }
  /** who is talking right now and what they say */
  talk = 0;                          // seconds of mouth movement left
  expr = 0;                          // 0 neutral 1 angry 2 worried 3 smirk (Voss: 0 grin 1 laugh 2 flat)
  vossBlinkAt = 4;
  /** Voss's scripted visit */
  vs: { lines: { text: string; expr: number; dark?: boolean; kill?: boolean }[]; i: number; t: number; dark: number; lean: number; flash: number; fade: number } | null = null;
  vossLine = '';
  devMode = location.hash === '#dev';
  showRent = false;
  shown = 0;
  started = false;
  hideCustomer = false;
  /** active drag: the item, where it was grabbed, and whether the pointer has really moved */
  drag: { uid: number; gx: number; gy: number; sx: number; sy: number; moved: boolean } | null = null;
  selected: number | null = null;
  returning: { uid: number; x: number; y: number; t: number } | null = null;
  settle: { uid: number; t: number } | null = null;
  flash: { uids: number[]; t: number } | null = null;
  note: { text: string; x: number; y: number; t: number; bad: boolean } | null = null;
  down = false;
  /** scanner readout animation for the last scanned item */
  scan: { uid: number; t: number; id: string } | null = null;
  mouse = { x: -1, y: -1 };   // design units (fractional)
  night = false;
  nightMap: HTMLCanvasElement;
  tremor = 0;
  nextTremor = 50;
  shake = { x: 0, y: 0 };
  snow: Particle[] = [];
  vapour: Particle[] = [];
  dust: Particle[] = [];
  nextBreath = 2;
  lampOn = true;
  tubeOn = true;
  glows: Record<string, HTMLCanvasElement>;
  get credits() { return this.wallet.credits; }
  silCache = new Map<string, HTMLCanvasElement>();
  sayId = -1;
  buttons: Button[] = [];
  lastCredits = -1;
  lastFlickerSound = -99;
  stepsPlayed = false;
  /** movable windows: top-left in design units (null = default spot) */
  panels: Record<string, { x: number; y: number } | null> = loadPanels();
  handles: { id: string; x: number; y: number; w: number; h: number }[] = [];
  windows: { x: number; y: number; w: number; h: number }[] = [];
  panelDrag: { id: string; dx: number; dy: number } | null = null;
  hotspots: Hotspot[];
  kellBlinkAt = 2.5;
  arrivedAt: number | null = null;
  lastEnc: unknown = null;

  constructor() {
    this.glows = {
      lamp: glowCanvas(90, '255,170,90'),
      heater: glowCanvas(110, '255,110,50'),
      tube: glowCanvas(80, '110,230,255', 1.6, 0.8),
      crt: glowCanvas(60, '120,230,190'),
      amber: glowCanvas(50, '255,180,90'),
      red: glowCanvas(30, '255,60,40'),
      redBig: glowCanvas(240, '255,40,40'),
      vel: glowCanvas(36, '180,120,255'),
      haze: glowCanvas(120, '170,180,230', 2.4, 0.5),
    };
    this.nightMap = this.buildNightMap();
    for (let i = 0; i < 110; i++) this.snow.push(this.flake(true));
    this.hotspots = [
      { x: 69, y: 151, w: 90, h: 58, title: 'Register', lines: ['Everything you own in cash.'], foot: 'CREDITS ON HAND' },
      { x: 520, y: 86, w: 50, h: 44, title: 'Tenancy monitor', lines: ['Rent and the deadline.', 'Click to pay early.'], foot: 'MR. VOSS COLLECTS IN PERSON' },
      { x: 500, y: 138, w: 57, h: 48, title: 'K-NET terminal', lines: ['News, notices, messages.'], foot: 'READING COSTS NO TIME' },
      { x: 552, y: 159, w: 55, h: 55, title: 'Spectra scanner', lines: ['Drag any item onto it', 'to inspect it.'], foot: 'INSPECTION TAKES TIME' },
      { x: 86, y: 90, w: 75, h: 66, title: 'Pinned notices', lines: ['Company posters, a skyline', 'sketch, a curfew order.'], foot: "THE LAST TENANT'S" },
      { x: 0, y: 260, w: 42, h: 70, title: 'Heater', lines: ['The only warm thing here.'], foot: 'RUNS ON STOLEN CURRENT' },
    ];
  }

  /** customer goods are on show while their owner is at the window */
  get custHere() { return !!this.enc && this.enc.phase !== 'gone' && !this.hideCustomer; }
  get vossHere() { return this.run.current === 'voss' && !!this.vs; }
  get line() {
    const e = this.enc;
    if (e) return { name: e.cust.name, text: e.say.line, expr: e.exprIndex, patience: e.deal && (e.phase === 'buy' || e.phase === 'sell') ? Math.max(0, e.deal.patience) : 0, suspicion: e.deal && (e.phase === 'buy' || e.phase === 'sell') ? e.deal.suspicion : 0, menace: false };
    if (this.vs) { const l = this.vs.lines[this.vs.i]; return { name: 'Mr. Voss', text: l ? l.text : '', expr: l ? l.expr : 0, patience: 0, suspicion: 0, menace: true }; }
    return { name: '', text: '', expr: 0, patience: 0, suspicion: 0, menace: false };
  }
  /** start or continue a run from the title screen */
  begin(cont: boolean) {
    if (!(cont && this.run.continue())) this.run.newRun();
    this.resetView();
  }
  resetView() {
    this.drag = null; this.returning = null; this.selected = null; this.sayId = -1; this.scan = null; this.lastCredits = -1; this.vs = null; this.showRent = false;
    this.night = this.run.mode !== 'open'; sound.setNight(this.night);
  }

  /** Voss's visit: a short script; if you're short of rent the lights die while he leans in */
  startVoss() {
    const r = this.run, v = r.voss!;
    const days = r.daysLeft;
    const lines: { text: string; expr: number; dark?: boolean; kill?: boolean }[] =
      v.kind === 'collect' ? [
        { text: `Day ${r.day}. Closing time.`, expr: 0 },
        { text: `You owe ${r.rent}. You have ${r.wallet.credits}.`, expr: 2 },
        { text: 'I did warn you.', expr: 2, dark: true, kill: true },
      ] : v.short ? [
        { text: `Day ${r.day}. I thought I'd see how my favourite tenant is getting on.`, expr: 0 },
        { text: `You have ${r.wallet.credits}. Rent is ${r.rent}. In ${days} day${days === 1 ? '' : 's'}.`, expr: 1 },
        { text: 'The last tenant had five days as well.', expr: 2, dark: true },
        { text: 'Do count it twice. I always do.', expr: 0 },
      ] : [
        { text: `Day ${r.day}. Money in the register, I see.`, expr: 0 },
        { text: 'Pay early if you like. I never refuse money.', expr: 1 },
        { text: `Until day ${r.dueDay}, then.`, expr: 0 },
      ];
    this.vs = { lines, i: 0, t: 0, dark: 0, lean: 0, flash: 0, fade: 0 };
    if (v.kind === 'collect') { this.night = true; sound.setNight(true); }
    sound.sting();
    this.sayId = -1; this.startLine();
  }
  advanceVoss() {
    const vs = this.vs!;
    const cur = vs.lines[vs.i];
    if (cur?.kill) return;            // the last line plays out on its own
    vs.i++; vs.t = 0;
    if (vs.i >= vs.lines.length) { this.vs = null; this.run.vossDone(); return; }
    const l = vs.lines[vs.i];
    if (l.dark) { sound.flicker(); sound.sting(); }
    this.startLine();
  }

  // ------------------------------------------------------------------ input
  pointer(x: number, y: number) {
    this.mouse = { x, y };
    if (this.panelDrag) { this.panels[this.panelDrag.id] = { x: x - this.panelDrag.dx, y: y - this.panelDrag.dy }; return; }
    const d = this.drag;
    if (d && !d.moved && Math.hypot(x * RES - d.sx, y * RES - d.sy) > 4) {
      d.moved = true;
      const it = this.inv.get(d.uid);
      if (it) sound.pickup(material(it.id), panX(x * RES));
    }
  }
  /** pointer pressed: pick up an item, or advance dialogue when clicking the window */
  click(x: number, y: number) {
    this.mouse = { x, y };
    this.down = true;
    for (const h of this.handles.slice().reverse()) if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) {
      this.panelDrag = { id: h.id, dx: x - h.x, dy: y - h.y }; sound.slide(panX(x * RES)); return;
    }
    for (const b of this.buttons) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
      if (!b.enabled) { sound.deny(panX(x * RES)); return; }
      if (b.step) sound.tick(b.step > 0, panX(x * RES)); else sound.click(panX(x * RES));
      b.on(); return;
    }
    // the tenancy monitor opens the rent window
    if (this.run.mode === 'open' && x >= 520 && x < 570 && y >= 86 && y < 130) { this.showRent = !this.showRent; sound.click(0.6); return; }
    // clicks on a window's body stop there: they never reach items underneath
    if (this.windows.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) return;
    const mx = x * RES, my = y * RES;
    const it = this.itemAtDevice(mx, my);
    if (it && !this.returning) {
      const p = this.itemDrawPos(it);
      this.drag = { uid: it.uid, gx: mx - p.x, gy: my - p.y, sx: mx, sy: my, moved: false };
      return;
    }
    this.selected = null;
    if (this.vs && y < 203 && x > 179 && x < 500 && this.shown >= this.line.text.length) this.advanceVoss();
  }
  release(x: number, y: number) {
    this.mouse = { x, y };
    this.down = false;
    if (this.panelDrag) {
      // store the clamped spot so a window never stays off screen
      const h = this.handles.find((q) => q.id === this.panelDrag!.id);
      if (h) this.panels[h.id] = { x: h.x, y: h.y };
      this.panelDrag = null; savePanels(this.panels); return;
    }
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const it = this.inv.get(d.uid);
    if (!it) return;
    if (!d.moved) { this.selected = this.selected === it.uid ? null : it.uid; return; } // a click selects
    this.drop(it, x * RES - d.gx, y * RES - d.gy);
  }
  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const it = this.inv.get(d.uid);
    if (it) this.returning = { uid: it.uid, x: this.mouse.x * RES - d.gx, y: this.mouse.y * RES - d.gy, t: 0 };
  }

  /** Resolve a drop of `it` whose image top-left is at (ix, iy) in device px. */
  drop(it: Item, ix: number, iy: number) {
    const im = this.imgFor(it, 'grid');
    const target = this.dropTarget(it, ix, iy);
    const back = () => { this.returning = { uid: it.uid, x: ix, y: iy, t: 0 }; };
    const pan = panX(ix);
    const heavy = ITEMS[it.id].w * ITEMS[it.id].h >= 4;
    if (target.kind === 'grid') {
      if (it.owner !== 'player') { back(); sound.deny(pan); this.say("Not yours yet. Make a deal first.", true); return; }
      if (!target.ok) { back(); sound.deny(pan); this.flash = { uids: target.blockers.map((b) => b.uid), t: 0 }; this.say(target.outOfBounds ? "It won't fit there." : 'Something is in the way.', true); return; }
      const wasCounter = it.where === 'counter';
      this.inv.moveToGrid(it.uid, target.col, target.row);
      sound.drop(material(it.id), heavy, pan);
      this.settle = { uid: it.uid, t: 0 };
      if (wasCounter) this.enc?.itemWithdrawn(it.uid);
      return;
    }
    if (target.kind === 'scanner') {
      // scan, then the item goes back where it came from
      back();
      this.scan = { uid: it.uid, t: 0, id: it.id };
      if (it.owner === 'customer' && this.enc?.canScan && it.uid === this.enc.itemUid) { const why = this.enc.inspect(); if (why) this.say(why, true); }
      sound.scan(!!this.inv.get(it.uid)?.tagged);
      return;
    }
    if (target.kind === 'counter') {
      if (!target.ok) { back(); sound.deny(pan); this.say('No room on the counter.', true); return; }
      this.inv.moveToCounter(it.uid, target.x, target.y);
      sound.drop(material(it.id), heavy, pan, true);
      this.settle = { uid: it.uid, t: 0 };
      this.enc?.itemOffered(it);
      return;
    }
    void im;
    back();
  }

  say(text: string, bad = false) { this.note = { text, x: this.mouse.x, y: this.mouse.y, t: 0, bad }; }

  key(k: string) {
    if (k === 'Escape') { this.cancelDrag(); this.selected = null; this.showRent = false; return; }
    if (k === 'r' || k === 'R') { this.panels = {}; savePanels(this.panels); }
    if (k === 'm' || k === 'M') sound.toggleMute();
    if ((k === ' ' || k === 'Enter') && this.vs && this.shown >= this.line.text.length) this.advanceVoss();
    if (!this.devMode) return;
    // development keys (only with #dev in the address)
    if (k === 'n' || k === 'N') { this.night = !this.night; sound.setNight(this.night); }
    if (k === 't' || k === 'T') this.startTremor();
    if (k === 'c' || k === 'C') this.hideCustomer = !this.hideCustomer;
  }
  startLine() {
    this.shown = 0;
    this.talk = this.line.text.length / 42 + 0.1;
    this.expr = this.line.expr;
  }
  startTremor() {
    sound.tremor();
    this.tremor = 1.5;
    for (let i = 0; i < 70; i++) this.dust.push({ x: Math.random() * DW, y: Math.random() * 40, vx: (Math.random() - 0.5) * 10, vy: 20 + Math.random() * 40, life: 0, max: 3, c: Math.random() < 0.5 ? P.paper[2] : M[5] });
  }

  flake(anywhere = false): Particle {
    const near = Math.random() < 0.18;
    const w = D.win;
    return { x: w.x + (anywhere ? Math.random() * w.w : -10 - Math.random() * 30), y: w.y + Math.random() * w.h, vx: (near ? 50 : 22) + Math.random() * 14, vy: (near ? 22 : 10) + Math.random() * 8, life: 0, max: 99, c: near ? P.white : C[8], s: near ? 2 : 1 };
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    this.t += dt;
    const r = this.run;
    r.update(dt);
    if (r.voss && !this.vs) this.startVoss();
    if (this.vs) this.updateVoss(dt);
    if (this.enc !== this.lastEnc) { this.lastEnc = this.enc; this.arrivedAt = this.t; this.sayId = -1; }
    if (this.enc && this.enc.sayId !== this.sayId) { this.sayId = this.enc.sayId; this.startLine(); }
    const shouldNight = r.mode !== 'open' || (!!r.voss && r.voss.kind === 'collect');
    if (shouldNight !== this.night && !this.devMode) { this.night = shouldNight; sound.setNight(shouldNight); }
    const before = Math.floor(this.shown);
    this.shown = Math.min(this.line.text.length, this.shown + dt * 42);
    const now = Math.floor(this.shown);
    if (now > before && (this.custHere || this.vossHere)) {
      // one syllable every other letter, so speech reads as murmured words
      for (let i = before; i < now; i++) if (i % 2 === 0) {
        if (this.vossHere) sound.voice('voss', this.line.text[i] ?? '', this.expr === 2 ? 'flat' : 'grin');
        else if (this.enc) sound.voice(this.enc.cust.id === 'kell' ? 'kell' : this.enc.cust.voice, this.line.text[i] ?? '', this.enc.say.expr);
        break;
      }
    }
    if (this.wallet.credits !== this.lastCredits) { if (this.lastCredits >= 0) sound.register(this.wallet.credits > this.lastCredits); this.lastCredits = this.wallet.credits; }
    if (this.enc && this.enc.phase === 'leaving' && this.enc.leaveAt < 1.2 && !this.stepsPlayed) { this.stepsPlayed = true; sound.footsteps(0); }
    if (!this.enc || this.enc.phase !== 'leaving') this.stepsPlayed = false;
    if (this.talk > 0) this.talk -= dt;
    if (this.returning && (this.returning.t += dt) > 0.18) {
      const it = this.inv.get(this.returning.uid);
      if (it) sound.drop(material(it.id), false, panX(this.itemDrawPos(it).x), it.where === 'counter');
      this.returning = null;
    }
    if (this.settle && (this.settle.t += dt) > 0.16) this.settle = null;
    if (this.flash && (this.flash.t += dt) > 0.5) this.flash = null;
    if (this.note && (this.note.t += dt) > 1.6) this.note = null;
    if (this.scan && (this.scan.t += dt) > 7) this.scan = null;
    if (this.t > this.vossBlinkAt + 0.16) this.vossBlinkAt = this.t + 4 + Math.random() * 5;
    if (this.t > this.kellBlinkAt + 0.2) this.kellBlinkAt = this.t + 2.5 + Math.random() * 4;
    this.nextTremor -= dt;
    if (this.nextTremor <= 0) { this.startTremor(); this.nextTremor = 70 + Math.random() * 60; }
    if (this.tremor > 0) {
      this.tremor -= dt;
      const a = this.tremor > 0.4 ? 2 : 0;
      this.shake = { x: a * Math.round(Math.sin(this.t * 61) * 1.4), y: a * Math.round(Math.cos(this.t * 47)) };
    } else this.shake = { x: 0, y: 0 };
    const fl = hash2(Math.floor(this.t * 12), 7, 3);
    const wasOn = this.lampOn;
    this.lampOn = this.tremor > 0 ? fl > 0.4 : !(fl > 0.97 || (Math.floor(this.t / 9) % 3 === 0 && fl > 0.85));
    if (wasOn && !this.lampOn && this.t - this.lastFlickerSound > 3.5) { this.lastFlickerSound = this.t; sound.flicker(); }
    const tf = hash2(Math.floor(this.t * 18), 9, 5);
    this.tubeOn = !(tf > 0.95 || (Math.floor(this.t / 6) % 4 === 1 && tf > 0.6));
    // snow drifting past the window
    const w = D.win;
    for (const p of this.snow) {
      p.x += p.vx * dt + Math.sin(this.t * 2 + p.y * 0.05) * 6 * dt; p.y += p.vy * dt;
      if (p.x > w.x + w.w + 4 || p.y > w.y + w.h + 4) Object.assign(p, this.flake(), { y: w.y + Math.random() * w.h * 0.8 - 20 });
    }
    // Kell's breath fogging in the cold
    this.nextBreath -= dt;
    if (this.custHere && this.nextBreath <= 0) {
      if (this.talk <= 0) sound.exhale(-0.02);
      for (let i = 0; i < 8; i++) this.vapour.push({ x: D.kellMouth.x + (Math.random() - 0.5) * 6, y: D.kellMouth.y, vx: 8 + Math.random() * 14, vy: -6 - Math.random() * 8, life: 0, max: 1.4 + Math.random() * 0.8, c: C[8] });
      this.nextBreath = this.talk > 0 ? 0.9 : 3.4 + Math.random() * 1.5;
    }
    for (const p of this.vapour) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.life += dt; }
    this.vapour = this.vapour.filter((p) => p.life < p.max);
    for (const p of this.dust) { p.x += p.vx * dt; p.vy += 80 * dt; p.y += p.vy * dt; p.life += dt; }
    this.dust = this.dust.filter((p) => p.life < p.max && p.y < DH);
  }

  /** cell highlights under the item being dragged */
  drawGridPreview(ctx: CanvasRenderingContext2D) {
    const d = this.drag;
    if (!d || !d.moved) return;
    const it = this.inv.get(d.uid)!;
    const tgt = this.dropTarget(it, this.mouse.x * RES - d.gx, this.mouse.y * RES - d.gy);
    if (tgt.kind !== 'grid') return;
    const def = ITEMS[it.id];
    const good = tgt.ok && it.owner === 'player';
    for (let r = tgt.row; r < tgt.row + def.h; r++) for (let c = tgt.col; c < tgt.col + def.w; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const q = cellRect(c, r);
      ctx.fillStyle = good ? 'rgba(130,242,106,0.22)' : 'rgba(255,58,51,0.28)';
      ctx.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
      ctx.strokeStyle = good ? 'rgba(130,242,106,0.8)' : 'rgba(255,58,51,0.85)';
      ctx.lineWidth = 2; ctx.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
    }
  }

  /** the item in the hand (or flying back to where it came from) */
  drawHeld(ctx: CanvasRenderingContext2D) {
    const d = this.drag;
    if (d && d.moved) {
      const it = this.inv.get(d.uid)!;
      const ix = this.mouse.x * RES - d.gx, iy = this.mouse.y * RES - d.gy;
      const tgt = this.dropTarget(it, ix, iy);
      const im = tgt.kind === 'counter' ? this.imgFor(it, 'counter') : ITEM_IMG[it.id];
      if (tgt.kind === 'scanner') {
        const sz = D.scanner;
        ctx.strokeStyle = 'rgba(88,240,220,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.strokeRect(sz.x + 1, sz.y + 1, sz.w - 2, sz.h - 2); ctx.setLineDash([]);
      }
      if (tgt.kind === 'counter') {
        const ct = D.counterTray;
        ctx.strokeStyle = tgt.ok ? 'rgba(130,242,106,0.7)' : 'rgba(255,58,51,0.8)';
        ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(ct.x + 1, ct.y + 1, ct.w - 2, ct.h - 2); ctx.setLineDash([]);
        if (tgt.ok) { ctx.globalAlpha = 0.35; ctx.drawImage(im, tgt.x, tgt.y); ctx.globalAlpha = 1; }
      }
      // lifted: drop shadow offset below, item slightly raised
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(ix + im.width / 2 + 6, iy + im.height + 8, im.width * 0.4, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(im, Math.round(ix), Math.round(iy - 4));
    } else if (this.returning) {
      const it = this.inv.get(this.returning.uid);
      if (!it) return;
      const to = this.itemDrawPos(it), im = this.imgFor(it);
      const k = Math.min(1, this.returning.t / 0.18), e = 1 - (1 - k) * (1 - k);
      ctx.drawImage(im, Math.round(this.returning.x + (to.x - this.returning.x) * e), Math.round(this.returning.y + (to.y - this.returning.y) * e));
    }
  }

  updateVoss(dt: number) {
    const vs = this.vs!;
    vs.t += dt;
    const l = vs.lines[vs.i];
    // darkness and lean-in for the threatening line
    const wantDark = l?.dark ? 1 : 0;
    vs.dark += (wantDark - vs.dark) * Math.min(1, dt * (wantDark ? 6 : 2));
    vs.lean += (wantDark - vs.lean) * Math.min(1, dt * 1.5);
    if (l?.kill && this.shown >= l.text.length && vs.t > l.text.length / 42 + 1.2) {
      if (vs.flash === 0) { vs.flash = 1; sound.tremor(); sound.deny(); }
      vs.fade += dt / 2.2;
      vs.flash = Math.max(0.0001, vs.flash - dt * 1.5);
      if (vs.fade >= 1) { this.vs = null; this.run.die(); }
    }
    // the rest auto-advance after a pause, or on click
    if (l && !l.kill && this.shown >= l.text.length && vs.t > l.text.length / 42 + 2.4) this.advanceVoss();
  }

  /** provisional portrait: a dark figure at the window, coloured by who it is */
  silhouette(d: Silhouette, id: string): HTMLCanvasElement {
    const key = id + (this.talk > 0 ? Math.floor(this.t * 9) % 2 : 0);
    let c = this.silCache.get(id);
    if (!c) {
      c = document.createElement('canvas'); c.width = 300; c.height = 280;
      const g = c.getContext('2d')!;
      const cx = 150;
      // a backlit figure: almost black, tinted by their clothes, rimmed by the cold street light
      const body = shadeHex(d.coat, -0.78), head = shadeHex(d.skin, -0.8);
      const shape = (fill: string) => {
        g.fillStyle = fill;
        g.beginPath(); g.moveTo(10, 280); g.quadraticCurveTo(22, 176, 96, 158); g.lineTo(204, 158); g.quadraticCurveTo(278, 176, 290, 280); g.fill();
        g.fillRect(cx - 22, 118, 44, 50);
        g.beginPath(); g.ellipse(cx, 92, 46, 58, 0, 0, Math.PI * 2); g.fill();
        if (d.hat === 'hood') { g.beginPath(); g.ellipse(cx, 84, 66, 78, 0, Math.PI, 0); g.fill(); g.fillRect(cx - 66, 84, 22, 84); g.fillRect(cx + 44, 84, 22, 84); }
        if (d.hat === 'collar') { g.beginPath(); g.moveTo(cx - 74, 172); g.lineTo(cx - 52, 104); g.lineTo(cx - 24, 150); g.fill(); g.beginPath(); g.moveTo(cx + 74, 172); g.lineTo(cx + 52, 104); g.lineTo(cx + 24, 150); g.fill(); }
        if (d.hat === 'visor') { g.fillRect(cx - 54, 36, 108, 18); }
      };
      // rim: draw the shape offset in cold blue, then the body over it
      g.save(); g.translate(-3, -3); shape('#61789a'); g.restore();
      g.save(); g.translate(3, -2); shape('#2f4263'); g.restore();
      shape(body);
      g.fillStyle = head; g.beginPath(); g.ellipse(cx, 92, 43, 55, 0, 0, Math.PI * 2); g.fill();
      // faint details catching the shop light
      g.strokeStyle = shadeHex(d.trim, -0.35); g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx - 44, 164); g.lineTo(cx, 226); g.lineTo(cx + 44, 164); g.stroke();
      g.fillStyle = shadeHex(d.skin, -0.62); g.beginPath(); g.ellipse(cx - 14, 96, 20, 44, 0, 0, Math.PI * 2); g.fill();
      if (d.hat === 'visor') { g.fillStyle = d.eye; g.globalAlpha = 0.9; g.fillRect(cx - 50, 40, 100, 9); g.globalAlpha = 1; }
      if (d.hat === 'collar') { g.fillStyle = '#9aa49a'; g.fillRect(cx - 40, 34, 80, 10); }
      // eyes: two small glints
      g.fillStyle = d.eye; g.fillRect(cx - 22, 88, 8, 4); g.fillRect(cx + 14, 88, 8, 4);
      g.globalAlpha = 0.35; g.fillRect(cx - 24, 86, 12, 8); g.fillRect(cx + 12, 86, 12, 8); g.globalAlpha = 1;
      // crisp it into pixels
      const s2 = document.createElement('canvas'); s2.width = 150; s2.height = 140;
      const g2 = s2.getContext('2d')!; g2.imageSmoothingEnabled = false; g2.drawImage(c, 0, 0, 150, 140);
      g.clearRect(0, 0, 300, 280); g.imageSmoothingEnabled = false; g.drawImage(s2, 0, 0, 300, 280);
      g.font = '10px monospace'; g.fillStyle = 'rgba(230,220,188,0.55)'; g.fillText('PORTRAIT PENDING', cx - 50, 268);
      this.silCache.set(id, c);
    }
    void key;
    return c;
  }

  kellFrame(): HTMLImageElement {
    const bt = this.t - this.kellBlinkAt;
    if (bt >= 0 && bt < 0.2) return KELL[bt < 0.05 || bt > 0.14 ? 'half' : 'closed'];
    const expr = KELL_EXPR[this.expr] ?? 'neutral';
    if (this.talk > 0) {
      // mouth cycles small -> medium -> wide, settling back on the expression between words
      const seq = ['talk1', 'talk2', 'talk3', 'talk2', 'talk1', expr, 'talk2', 'talk1', expr];
      return KELL[seq[Math.floor(this.t * 9) % seq.length]];
    }
    return KELL[expr];
  }

  vossFrame(): HTMLImageElement {
    if (this.t >= this.vossBlinkAt && this.t < this.vossBlinkAt + 0.16) return VOSS.blink;
    const e = this.expr;
    if (e === 2) return VOSS.flat;
    if (this.talk > 0) {
      const f = Math.floor(this.t * 7) % 3;
      if (e === 1) return f === 2 ? VOSS.talk : VOSS.laugh;
      return f === 1 ? VOSS.talk : VOSS.base;
    }
    return e === 1 ? VOSS.laugh : VOSS.base;
  }

  // ------------------------------------------------------------------ hover helpers
  cellAt(x: number, y: number) {
    const col = Math.floor((x * RES - TRAYG.x) / TRAYG.cw), row = Math.floor((y * RES - TRAYG.y) / TRAYG.ch);
    return col < 0 || row < 0 || col >= COLS || row >= ROWS ? null : { col, row };
  }
  /** customer goods are only on show while that customer is at the window */
  visible(it: Item) { return it.owner === 'player' || this.custHere; }
  imgFor(it: Item, where = it.where): HTMLImageElement {
    return (where === 'counter' && ITEM_IMG[it.id + '_counter']) || ITEM_IMG[it.id];
  }
  /** top-left of the item's image as currently resting (device px) */
  itemDrawPos(it: Item): { x: number; y: number } {
    const im = this.imgFor(it);
    if (it.where === 'counter') return { x: it.x, y: it.y };
    const d = ITEMS[it.id], r = cellRect(it.col, it.row, d.w, d.h);
    return { x: Math.round(r.x + (r.w - im.width) / 2), y: Math.round(r.y + (r.h - im.height) / 2) };
  }
  itemAtDevice(mx: number, my: number): Item | null {
    for (const it of this.inv.onCounter().slice().reverse()) {
      if (!this.visible(it)) continue;
      const p = this.itemDrawPos(it), im = this.imgFor(it);
      if (mx >= p.x && mx < p.x + im.width && my >= p.y && my < p.y + im.height) return it;
    }
    const cell = this.cellAt(mx / RES, my / RES);
    return cell ? this.inv.at(cell.col, cell.row) : null;
  }
  stockAt(x: number, y: number): Item | null {
    const cell = this.cellAt(x, y);
    return cell ? this.inv.at(cell.col, cell.row) : null;
  }
  /** Where would the dragged item land if released with its image top-left at (ix,iy)? */
  dropTarget(it: Item, ix: number, iy: number):
    | { kind: 'grid'; ok: boolean; outOfBounds: boolean; col: number; row: number; blockers: Item[] }
    | { kind: 'counter'; ok: boolean; x: number; y: number }
    | { kind: 'scanner' }
    | { kind: 'none' } {
    const def = ITEMS[it.id];
    const gi = ITEM_IMG[it.id];
    const cx = this.mouse.x * RES, cy = this.mouse.y * RES;
    // over the stock tray (with a small margin)
    const tray = { x: TRAYG.x - 20, y: TRAYG.y - 20, w: COLS * TRAYG.cw + 40, h: ROWS * TRAYG.ch + 40 };
    if (cx >= tray.x && cx < tray.x + tray.w && cy >= tray.y && cy < tray.y + tray.h) {
      // footprint top-left from the image's top-left (image is centred in its footprint)
      const fx = ix - (def.w * TRAYG.cw - gi.width) / 2, fy = iy - (def.h * TRAYG.ch - gi.height) / 2;
      const col = Math.round((fx - TRAYG.x) / TRAYG.cw), row = Math.round((fy - TRAYG.y) / TRAYG.ch);
      const r = this.inv.check(it.id, col, row, it.uid);
      return { kind: 'grid', ok: r.ok, outOfBounds: r.outOfBounds, col, row, blockers: r.blockers };
    }
    // over the bench scanner
    const sz = D.scanner;
    if (cx >= sz.x && cx < sz.x + sz.w && cy >= sz.y && cy < sz.y + sz.h) return { kind: 'scanner' };
    // over the counter tray: rest the item on the tray floor, avoid other counter goods
    const ct = D.counterTray;
    if (cx >= ct.x - 30 && cx < ct.x + ct.w + 30 && cy >= ct.y - 50 && cy < ct.y + ct.h + 20) {
      const im = this.imgFor(it, 'counter');
      const y = Math.round(Math.min(ct.y + ct.h - 2, Math.max(ct.y + 26, iy + im.height)) - im.height);
      const want = Math.round(Math.max(ct.x, Math.min(ct.x + ct.w - im.width, ix)));
      const others = this.inv.onCounter().filter((o) => o.uid !== it.uid && this.visible(o));
      const clear = (x: number) => others.every((o) => { const oi = this.imgFor(o); return x + im.width <= o.x + 4 || x >= o.x + oi.width - 4; });
      for (let k = 0; k < 80; k++) for (const sgn of [1, -1]) {
        const x = want + sgn * k * 4;
        if (x < ct.x || x > ct.x + ct.w - im.width) continue;
        if (clear(x)) return { kind: 'counter', ok: true, x, y };
      }
      return { kind: 'counter', ok: false, x: want, y };
    }
    return { kind: 'none' };
  }

  // ------------------------------------------------------------------ render
  render(ctx: CanvasRenderingContext2D) {
    const t = this.t;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#050606';
    ctx.fillRect(0, 0, DW, DH);
    ctx.translate(this.shake.x, this.shake.y);

    // exterior + weather (device pixels)
    const w = D.win;
    ctx.drawImage(IMG.exterior, w.x, w.y);
    ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.06 + 0.02 * Math.sin(t * 0.3 + i);
      const hx = w.x - 300 + ((t * (8 + i * 5) + i * 260) % (w.w + 600));
      ctx.drawImage(this.glows.haze, hx, w.y + w.h - 150 - i * 30);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#c4cfde';
    for (const p of this.snow) { if (p.s === 2) { ctx.fillStyle = '#f4f1e6'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); ctx.fillStyle = '#c4cfde'; } else ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    ctx.restore();

    // customer
    if (this.custHere) {
      const e = this.enc!;
      // step up to the window (first second), leave over the last
      const arrive = Math.min(1, this.t - (this.arrivedAt ?? this.t) + 0.0);
      const out = e.phase === 'leaving' && e.leaveAt < 1 ? e.leaveAt : 1;
      const k = Math.min(arrive / 0.8, out);
      ctx.globalAlpha = Math.max(0, Math.min(1, k));
      const drop = Math.round((1 - Math.min(1, k)) * 30);
      const b = (t % 3.6) < 1.5 ? -1 : 0;
      const im = e.cust.portrait === 'kell' ? this.kellFrame() : this.silhouette(e.cust.portrait as Silhouette, e.cust.id);
      const bob = e.cust.portrait !== 'kell' && this.talk > 0 && Math.floor(t * 9) % 2 ? 1 : 0;
      ctx.drawImage(im, Math.round(636 - im.width / 2), D.counterTop + 12 - im.height + b + drop + bob);
      ctx.globalAlpha = 1;
      for (const p of this.vapour) {
        const q = p.life / p.max;
        ctx.globalAlpha = 0.5 * (1 - q);
        ctx.fillStyle = '#dfe6ee';
        const r = 1 + Math.floor(q * 5);
        ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r / 2), r * 2, r);
      }
      ctx.globalAlpha = 1;
    } else if (this.vossHere) {
      const vs = this.vs!;
      const v = this.vossFrame();
      const b = (t % 5.2) < 2.2 ? -1 : 0;
      const sc = 1 + vs.lean * 0.14;
      const w = v.width * sc, h = v.height * sc;
      const k = Math.min(1, vs.t / 0.8 + (vs.i > 0 ? 1 : 0));
      ctx.globalAlpha = k;
      ctx.drawImage(v, Math.round(640 - w / 2), Math.round(D.counterTop + 12 - h + b + (1 - k) * 30 + vs.lean * 20), Math.round(w), Math.round(h));
      ctx.globalAlpha = 1;
    }

    // interior plate
    ctx.drawImage(IMG.interior, 0, 0);

    // goods resting on the counter
    for (const it of this.inv.onCounter()) {
      if (!this.visible(it) || this.drag?.uid === it.uid || this.returning?.uid === it.uid) continue;
      const im = this.imgFor(it), p = this.itemDrawPos(it);
      const lift = this.settle?.uid === it.uid ? -Math.round(3 * (1 - this.settle.t / 0.16)) : 0;
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(p.x + im.width / 2, p.y + im.height - 2, im.width * 0.42, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(im, p.x, p.y + lift);
      if (it.id === 'bundle' || it.id === 'vel') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 2.2);
        ctx.drawImage(this.glows.vel, p.x + im.width / 2 - 36, p.y + im.height / 2 - 36);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    // stock tray and its contents
    ctx.drawImage(IMG.tray, TRAYG.frameX, TRAYG.frameY);
    this.drawGridPreview(ctx);
    for (const it of this.inv.onGrid()) {
      if (this.drag?.uid === it.uid || this.returning?.uid === it.uid) continue;
      const im = this.imgFor(it), p = this.itemDrawPos(it);
      const d = ITEMS[it.id], r = cellRect(it.col, it.row, d.w, d.h);
      const lift = this.settle?.uid === it.uid ? -Math.round(3 * (1 - this.settle.t / 0.16)) : 0;
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h - 6, im.width * 0.38, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(im, p.x, p.y + lift);
      if (this.flash?.uids.includes(it.uid) && Math.floor(this.flash.t * 12) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,58,51,0.35)'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      }
    }

    // live screens
    this.paintHud();
    ctx.drawImage(this.hud.canvas, 0, 0);
    // dust from tremors
    for (const p of this.dust) { ctx.fillStyle = '#857a5a'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }

    this.drawGlows(ctx);
    // Voss: the lights die while he leans in; only his eyes stay lit
    const vs = this.vs;
    if (vs && vs.dark > 0.01) {
      ctx.fillStyle = `rgba(2,2,4,${(0.88 * vs.dark).toFixed(3)})`; ctx.fillRect(-10, -10, DW + 20, DH + 20);
      if (this.vossFrame() !== VOSS.blink) {
        ctx.globalCompositeOperation = 'lighter';
        const lean = vs.lean, b = (t % 5.2) < 2.2 ? -1 : 0;
        for (const ex of [626, 663]) {
          const x = 640 + (ex - 640) * (1 + lean * 0.14), y = 224 + b + lean * 6;
          ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 3); ctx.drawImage(this.glows.red, x - 30, y - 30);
          ctx.fillStyle = '#ff3a33'; ctx.globalAlpha = 1; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (this.night) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.nightMap, 0, 0, DW, DH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.hud.canvas, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.14 + 0.06 * Math.sin(t * 2.4);
      ctx.drawImage(this.glows.redBig, 352 - 240, 120 - 240);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // red emergency lamp on the window post
      const on = Math.sin(t * 2.4) > -0.2;
      ctx.fillStyle = '#141818'; ctx.fillRect(342, 104, 14, 18);
      ctx.fillStyle = on ? '#ff3a33' : '#5e1016'; ctx.fillRect(344, 106, 10, 14);
      ctx.fillStyle = on ? '#f4f1e6' : '#8a1a1f'; ctx.fillRect(346, 108, 3, 3);
    }
    this.drawHeld(ctx);
    if (vs && vs.flash > 0) { ctx.fillStyle = `rgba(180,20,20,${Math.min(0.85, vs.flash).toFixed(3)})`; ctx.fillRect(-10, -10, DW + 20, DH + 20); }
    if (vs && vs.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, vs.fade).toFixed(3)})`; ctx.fillRect(-10, -10, DW + 20, DH + 20); }
    ctx.restore();

    this.paintUI();
    ctx.drawImage(this.ui.flush(), 0, 0, DW, DH);
  }

  paintHud() {
    const s = this.hud, t = this.t;
    s.clear();
    // register: red LED credits
    const r = D.regDisplay;
    const cr = String(Math.max(0, Math.floor(this.credits))).padStart(4, ' ');
    for (let i = 0; i < 4; i++) seg2(s, cr[i], r.x + 6 + i * 13, r.y + 3, P.neonRed, B[0]);
    text(s, 'CR', r.x + r.w - 14, r.y + 7, B[4], TINY);
    // tenancy monitor (amber)
    const m = D.rentScreen;
    const dim = hash2(Math.floor(t * 8), 3, 1) > 0.97;
    const ink = dim ? A[3] : A[5];
    const rn = this.run;
    if (rn.mode !== 'title') {
      text(s, `DAY ${rn.day}`, m.x + 4, m.y + 5, ink, BODY);
      const mins = Math.min(this.wallet.minutes, 23 * 60 + 59);
      const late = this.wallet.minutes >= CLOSE_TIME - 60;
      text(s, `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, m.x + 4, m.y + 15, late && Math.floor(t * 2) % 2 ? B[5] : A[4], BODY);
      text(s, 'RENT', m.x + 4, m.y + 29, ink, BODY);
      text(s, `${rn.rent} CR`, m.x + 4, m.y + 39, ink, BODY);
      const due = rn.paid ? 'PAID' : rn.daysLeft === 0 ? 'DUE TONIGHT' : `DUE IN ${rn.daysLeft} DAY${rn.daysLeft === 1 ? '' : 'S'}`;
      text(s, due, m.x + 4, m.y + 52, rn.paid ? P.neonGreen : rn.daysLeft <= 1 ? (Math.floor(t * 2) % 2 ? B[5] : B[3]) : Math.floor(t * 1.5) % 2 ? A[4] : A[3], TINY);
    }
    // news terminal (green)
    const n = D.newsScreen;
    s.clip(n.x, n.y, n.w, n.h);
    const scroll = Math.floor(t / 2.2);
    const glitch = this.tremor > 0 && Math.floor(t * 30) % 3 === 0 ? 2 : 0;
    for (let i = 0; i < 7; i++) {
      const line = TERMINAL_FEED[(scroll + i) % TERMINAL_FEED.length];
      const head = line.startsWith('>');
      const typed = i === 6 ? line.slice(0, Math.floor(((t % 2.2) / 2.2) * line.length * 1.6)) : line;
      text(s, typed, n.x + 3 + (i % 2 ? glitch : 0), n.y + 3 + i * 10, head ? P.neonCyan : T[8], BODY);
    }
    s.unclip();
    // scanner readout
    const sc = D.scanScreen;
    const e0 = this.custHere ? this.enc : null;
    const st = e0?.step;
    const anomaly = !!e0 && e0.canScan && st?.kind === 'sell' && e0.item?.id === 'bundle';
    const sv = this.scan;
    if (sv && sv.t < 1.1) {
      // scanning sweep
      text(s, 'SCANNING', sc.x + 4, sc.y + 5, T[7], TINY);
      const bar = Math.floor((sv.t / 1.1) * (sc.w - 8));
      s.rect(sc.x + 4, sc.y + 16, sc.w - 8, 4, T[1]); s.rect(sc.x + 4, sc.y + 16, bar, 4, T[7]);
      const ly = sc.y + 22 + Math.floor((sv.t * 30) % 16);
      s.hline(sc.x + 2, sc.x + sc.w - 3, ly, P.neonCyan);
    } else if (sv) {
      const it = this.inv.get(sv.uid);
      const def = ITEMS[it ? it.id : sv.id];
      if (it?.tagged || def.id === 'vel' && it?.tagged) {
        text(s, 'VEL ORE', sc.x + 4, sc.y + 5, P.vel[5], TINY);
        text(s, 'GRADE A', sc.x + 4, sc.y + 13, T[7], TINY);
        if (Math.floor(t * 3) % 2) text(s, 'HALCYON', sc.x + 4, sc.y + 23, P.neonRed, TINY);
        text(s, 'TAG', sc.x + 4, sc.y + 31, P.neonRed, TINY);
      } else {
        const val = it ? Inventory.value(it) : def.value;
        const cw = condWord(it?.cond ?? 1);
        text(s, cw, sc.x + 4, sc.y + 5, cw === 'BUSTED' ? P.neonRed : cw === 'WORN' ? A[5] : P.neonGreen, TINY);
        text(s, `${val[0]}-${val[1]}`, sc.x + 4, sc.y + 13, A[5], TINY);
        const flag = it?.fault ? it.fault.split(' ').pop()!.toUpperCase().slice(0, 9) : it?.stolen ? 'REG. OWNER' : def.contraband ? 'ILLEGAL' : 'NO FLAGS';
        text(s, flag, sc.x + 4, sc.y + 23, flag === 'NO FLAGS' ? P.neonGreen : P.neonRed, TINY);
        if (it?.stolen && it.fault) text(s, 'REG. OWNER', sc.x + 4, sc.y + 31, P.neonRed, TINY);
      }
    } else if (e0 && e0.scanned && e0.phase === 'buy' && e0.item?.tagged) {
      text(s, 'VEL ORE', sc.x + 4, sc.y + 5, P.vel[5], TINY);
      text(s, 'GRADE A', sc.x + 4, sc.y + 13, T[7], TINY);
      if (Math.floor(t * 3) % 2) text(s, 'HALCYON', sc.x + 4, sc.y + 23, P.neonRed, TINY);
      text(s, 'TAG', sc.x + 4, sc.y + 31, P.neonRed, TINY);
    } else if (anomaly) {
      if (Math.floor(t * 3) % 2) text(s, 'ANOMALY', sc.x + 4, sc.y + 5, P.neonMag, TINY);
      for (let x = 0; x < sc.w - 6; x++) {
        const v = Math.sin(x * 0.6 + t * 9) * 5 * (0.5 + 0.5 * Math.sin(t * 2.3 + x * 0.15)) + (hash2(x, Math.floor(t * 10), 2) - 0.5) * 4;
        s.px(sc.x + 3 + x, sc.y + 25 + Math.round(v), P.vel[5]);
      }
    } else {
      text(s, 'READY', sc.x + 4, sc.y + 5, T[7], TINY);
      for (let x = 0; x < sc.w - 6; x++) s.px(sc.x + 3 + x, sc.y + 25 + Math.round(Math.sin(x * 0.3 + t * 3) * 2), T[6]);
    }
    // scanlines over every screen
    for (const q of [m, n, sc]) for (let y = q.y; y < q.y + q.h; y += 2) for (let x = q.x; x < q.x + q.w; x++) {
      const c = s.get(x, y);
      if (c === A[5]) s.px(x, y, A[4]); else if (c === T[8]) s.px(x, y, T[7]);
    }
    s.flush();
  }

  drawGlows(ctx: CanvasRenderingContext2D) {
    const g = this.glows, t = this.t;
    ctx.globalCompositeOperation = 'lighter';
    const add = (c: HTMLCanvasElement, x: number, y: number, a: number) => { ctx.globalAlpha = a; ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); };
    if (!this.night) {
      if (this.lampOn) add(g.lamp, D.lamp.x, D.lamp.y + 20, 0.22);
      if (this.tubeOn) add(g.tube, D.tube.x, D.tube.y + 10, 0.2);
      add(g.amber, D.rentScreen.x + 32, D.rentScreen.y + 31, 0.1);
    }
    add(g.heater, D.heater.x, D.heater.y, 0.18 + 0.05 * Math.sin(t * 0.9));
    add(g.crt, D.newsScreen.x + 42, D.newsScreen.y + 36, this.night ? 0.25 : 0.1);
    add(g.red, D.regDisplay.x + 34, D.regDisplay.y + 8, 0.2);
    if (this.custHere && this.enc!.canScan && this.enc!.item?.id === 'bundle') add(g.vel, D.scanScreen.x + 23, D.scanScreen.y + 20, 0.15 + 0.1 * Math.sin(t * 6));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // when the lamp stutters, the plate's lit area dips
    if (!this.lampOn && !this.night) {
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.5;
      ctx.drawImage(g.lamp, D.lamp.x - 90, D.lamp.y - 70);
      ctx.fillStyle = '#5a5a6a'; ctx.globalAlpha = 0.25; ctx.fillRect(0, 0, 440, 560);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  buildNightMap(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const im = g.createImageData(W, H);
    const lights = [
      { x: 176, y: 60, r: 240, col: [1.0, 0.32, 0.3] },
      { x: 529, y: 162, r: 130, col: [0.35, 0.8, 0.7] },
      { x: 21, y: 295, r: 150, col: [0.9, 0.45, 0.25] },
      { x: 318, y: 120, r: 140, col: [0.45, 0.4, 0.6] },
      { x: 320, y: 305, r: 170, col: [0.42, 0.38, 0.46] },
    ];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0.14, gg = 0.14, b = 0.24;
      for (const L of lights) {
        const d = Math.hypot(x - L.x, y - L.y) / L.r;
        if (d >= 1) continue;
        const a = (1 - d) * (1 - d);
        r += L.col[0] * a; gg += L.col[1] * a; b += L.col[2] * a;
      }
      const i = (y * W + x) * 4;
      im.data[i] = Math.min(1, r) * 255; im.data[i + 1] = Math.min(1, gg) * 255; im.data[i + 2] = Math.min(1, b) * 255; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c;
  }

  paintUI() {
    const s = this.ui;
    s.clear();
    const L = this.line;
    this.buttons = [];
    this.handles = [];
    this.windows = [];
    if (this.run.mode === 'title') { this.titleScreen(s); return; }
    if (this.run.mode === 'dead') { this.deathScreen(s); return; }
    if (this.run.mode === 'open' && ((this.custHere && this.enc!.phase !== 'gone') || (this.vossHere && this.vs!.fade < 0.3))) speech(s, 360, 66, L.name, L.text, Math.floor(this.shown), L.patience, L.suspicion, L.menace);
    if (this.custHere) this.dealPanel(s);
    if (this.run.mode === 'closed') this.dayCard(s);
    if (this.showRent) this.rentPanel(s);
    if (this.devMode) this.devPanel(s);
    const { x, y } = this.mouse;
    this.cursor = 'default';
    // selected item: brackets + detail card
    const sel = this.selected !== null ? this.inv.get(this.selected) : null;
    if (sel && this.visible(sel) && this.drag?.uid !== sel.uid) {
      const b = this.itemBox(sel);
      this.bracket(s, b.x, b.y, b.w, b.h);
      const def = ITEMS[sel.id];
      const f = this.itemFacts(sel);
      const cp = this.place('card', 172, 86, { x: 464, y: 230 });
      itemCard(s, cp.x, cp.y, { ...def, detail: sel.scanned ? `${def.detail} ${f.lines[1]}` : def.detail }, {
        owner: sel.owner === 'customer' ? "Customer's goods" : 'Your stock',
        estimate: f.est, warn: f.warn,
      });
    } else if (sel && !this.visible(sel)) this.selected = null;
    // feedback note near the cursor
    if (this.note) toast(s, this.note.x, this.note.y - 14 - Math.floor(this.note.t * 6), this.note.text, this.note.bad, this.note.t);
    if (this.panelDrag) { this.cursor = 'grabbing'; return; }
    if (this.drag) { this.cursor = this.drag.moved ? 'grabbing' : 'grab'; return; }
    if (this.handles.some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h)) { this.cursor = 'move'; return; }
    const overWindow = this.windows.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (overWindow) return;
    const hovered = this.itemAtDevice(x * RES, y * RES);
    if (hovered && this.visible(hovered)) {
      const def = ITEMS[hovered.id];
      const b = this.itemBox(hovered);
      if (hovered.uid !== this.selected) this.bracket(s, b.x, b.y, b.w, b.h);
      const f = this.itemFacts(hovered);
      tooltip(s, x, y, def.name, f.lines, f.est, f.warn);
      this.cursor = 'grab';
      return;
    }
    const cell = this.cellAt(x, y);
    if (cell) { const r = cellRect(cell.col, cell.row); s.frame(Math.round(r.x / RES), Math.round(r.y / RES), Math.round(r.w / RES), Math.round(r.h / RES), T[5]); return; }
    for (const h of this.hotspots) {
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) {
        const lines = h.title === 'Register' ? [...h.lines, `${this.credits} credits.`] : h.lines;
        tooltip(s, x, y, h.title, lines, h.foot);
        this.cursor = 'help';
        return;
      }
    }
  }

  /** where a movable window goes this frame; registers its title bar as a drag handle */
  place(id: string, w: number, h: number, def: { x: number; y: number }) {
    const p = this.panels[id] ?? def;
    const x = Math.max(0, Math.min(W - w, Math.round(p.x)));
    const y = Math.max(0, Math.min(H - h, Math.round(p.y)));
    this.handles.push({ id, x, y, w, h: 13 });
    this.windows.push({ x, y, w, h });
    return { x, y };
  }

  /** a push-button that registers itself for clicks this frame */
  btn(s: Surface, x: number, y: number, w: number, label: string, on: () => void, enabled = true, tone: 'plain' | 'go' | 'stop' | 'tool' = 'plain') {
    const mx = this.mouse.x, my = this.mouse.y;
    const hover = enabled && mx >= x && mx < x + w && my >= y && my < y + 13;
    const r = button(s, x, y, w, label, { enabled, hover, tone });
    this.buttons.push({ ...r, on, enabled });
    (this as any).__labels = { ...((this as any).__labels || {}), [label]: [r.x, r.y, r.w] };
  }

  titleScreen(s: Surface) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 2 === 0) s.px(x, y, P.black);
    const cx = 320;
    const tw = bigText(s, 'RIME', 0, -100, 7, A[5]);
    bigText(s, 'RIME', cx - Math.round(tw / 2), 58, 7, A[5], P.black);
    text(s, 'A pawn shop under the Halcyon ship.', cx - 82, 122, PA[4], BODY, P.black);
    text(s, 'Pay Mr. Voss every five days. Or else.', cx - 88, 134, PA[3], BODY, P.black);
    const has = Run.hasSave();
    const save = Run.load();
    if (has && save) this.btn(s, cx - 70, 162, 140, `Continue - day ${save.day}`, () => { this.begin(true); }, true, 'go');
    this.btn(s, cx - 70, has ? 180 : 162, 140, 'New run', () => { this.begin(false); }, true, has ? 'plain' : 'go');
    if (this.run.best > 0) text(s, `LONGEST SURVIVAL: ${this.run.best} DAY${this.run.best === 1 ? '' : 'S'}`, cx - 52, 206, M[6], TINY);
    text(s, 'DRAG GOODS - CLICK TO INSPECT - M SOUND - ESC CANCEL', cx - 108, 336, M[5], TINY);
  }

  deathScreen(s: Surface) {
    s.rect(0, 0, W, H, P.black);
    for (let i = 0; i < 260; i++) { const x = (i * 97) % W, y = 40 + ((i * 53) % 120); if ((i % 7) < 3) s.px(x, y, B[1]); }
    const cx = 320;
    const tw = bigText(s, 'RENT COLLECTED', 0, -100, 3, B[4]);
    bigText(s, 'RENT COLLECTED', cx - Math.round(tw / 2), 96, 3, B[4]);
    text(s, this.run.deathCause, cx - 70, 136, PA[4], BODY);
    text(s, `You kept the shop for ${this.run.day - 1} day${this.run.day === 2 ? '' : 's'}.`, cx - 64, 150, PA[3], BODY);
    text(s, `LONGEST SURVIVAL: ${this.run.best} DAYS`, cx - 48, 168, M[6], TINY);
    this.btn(s, cx - 60, 190, 120, 'New run', () => { this.begin(false); }, true, 'go');
  }

  dayCard(s: Surface) {
    const r = this.run, sm = r.summary;
    if (!sm) return;
    const net = sm.end - sm.start;
    const lines = [
      `Credits ${sm.start} -> ${sm.end}  (${net >= 0 ? '+' : ''}${net})`,
      sm.served.length ? `Served: ${sm.served.join(', ')}` : 'Nobody came.',
      sm.skipped ? `${sm.skipped} turned away at curfew.` : '',
      sm.rentNote,
      `Seed ${r.seed.toString(16).toUpperCase().padStart(8, '0')}`,
      r.day % 5 === 0 ? '' : r.paid ? `Rent for day ${r.dueDay}: PAID.` : `Rent ${r.rent} due in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}.`,
    ].filter(Boolean);
    const Wd = 220, Hd = 40 + lines.length * 11 + 18;
    const { x, y } = this.place('day', Wd, Hd, { x: 210, y: 90 });
    sheet(s, x, y, Wd, Hd, `DAY ${sm.day} - CLOSED`);
    lines.forEach((l, i) => text(s, l, x + 6, y + 19 + i * 11, i === 0 ? A[5] : PA[5], BODY));
    this.btn(s, x + 6, y + Hd - 20, Wd - 12, `Open up - day ${r.day + 1}`, () => { r.nextDay(); this.resetView(); }, true, 'go');
  }

  /** tenancy window: rent status and early payment */
  rentPanel(s: Surface) {
    const r = this.run;
    const Wd = 170, Hd = 82;
    const { x, y } = this.place('rent', Wd, Hd, { x: 466, y: 86 });
    sheet(s, x, y, Wd, Hd, 'TENANCY 4C');
    text(s, `RENT DUE END OF DAY ${r.dueDay}`, x + 6, y + 18, M[6], TINY);
    text(s, `${r.rent} CR`, x + 6, y + 27, A[5], BODY);
    text(s, r.paid ? 'SETTLED' : `${r.daysLeft} DAY${r.daysLeft === 1 ? '' : 'S'} LEFT`, x + Wd - 8 - measure(r.paid ? 'SETTLED' : `${r.daysLeft} DAYS LEFT`, BODY), y + 27, r.paid ? P.neonGreen : B[5], BODY);
    const busy = !!this.enc && this.enc.phase !== 'gone';
    text(s, r.paid ? 'Nothing owed this cycle.' : r.wallet.credits < r.rent ? `You are ${r.rent - r.wallet.credits} short.` : busy ? 'Finish with the customer first.' : 'You can pay it now.', x + 6, y + 40, PA[4], BODY);
    this.btn(s, x + 6, y + 53, Wd - 12, r.paid ? 'Paid' : `Pay ${r.rent} now`, () => {
      const why = r.payRent(); if (why) { this.say(why, true); sound.deny(); } else this.say('Rent settled.');
    }, !r.paid && r.wallet.credits >= r.rent && !busy, 'go');
    this.btn(s, x + 6, y + 68 - 1, Wd - 12, 'Close', () => { this.showRent = false; });
  }

  /** development tools: only with #dev in the address */
  devPanel(s: Surface) {
    const r = this.run;
    const Wd = 120, Hd = 120;
    const { x, y } = this.place('dev', Wd, Hd, { x: 516, y: 2 });
    sheet(s, x, y, Wd, Hd, 'DEV');
    const b = (i: number, label: string, on: () => void) => this.btn(s, x + 4 + (i % 2) * 57, y + 17 + Math.floor(i / 2) * 15, 55, label, on, true, 'tool');
    b(0, '+50 cr', () => { r.wallet.credits += 50; });
    b(1, '-50 cr', () => { r.wallet.credits = Math.max(0, r.wallet.credits - 50); });
    b(2, 'Rent +20', () => { BALANCE.rent[0] += 20; });
    b(3, 'Rent -20', () => { BALANCE.rent[0] = Math.max(0, BALANCE.rent[0] - 20); });
    b(4, 'Next cust', () => { if (r.enc) { r.enc.phase = 'gone'; } else if (r.voss && this.vs) { this.vs = null; r.vossDone(); } });
    b(5, 'Close day', () => { if (r.enc) r.enc.phase = 'gone'; r.closeNow(); });
    b(6, 'Restart day', () => { r.restartDay(); this.resetView(); });
    b(7, 'Day 5', () => { r.day = 5; r.startDay(); this.resetView(); });
    text(s, `DAY ${r.day} RENT ${r.rent} ${r.paid ? 'PAID' : ''}`, x + 4, y + 80, M[6], TINY);
    text(s, `MODE ${r.mode.toUpperCase()} Q ${r.queueIdx}/${r.queue.length} ${r.queue.join(' ').slice(0, 26)}`, x + 4, y + 88, M[6], TINY);
    text(s, `SEED ${r.seed.toString(16).toUpperCase()}`, x + 4, y + 104, M[6], TINY);
    text(s, 'N T C KEYS ACTIVE', x + 4, y + 96, M[5], TINY);
  }

  /** The deal sheet: offer controls, tactics, accept / walk away. All rules live in the encounter. */
  dealPanel(s: Surface) {
    const e = this.enc!, d = e.deal;
    const Wd = 170;
    let X = 4, Y = 204;
    const mx = this.mouse.x, my = this.mouse.y;
    const add = (x: number, y: number, w: number, label: string, on: () => void, enabled = true, tone: 'plain' | 'go' | 'stop' | 'tool' = 'plain', step = 0) => {
      const hover = enabled && mx >= x && mx < x + w && my >= y && my < y + 13;
      const r = button(s, x, y, w, label, { enabled: enabled && e.busy <= 0, hover, tone });
      this.buttons.push({ ...r, on, enabled: enabled && e.busy <= 0, step });
      (this as any).__labels = { ...((this as any).__labels || {}), [label]: [r.x, r.y, r.w] };
    };
    const fail = (why: string | null) => { if (why) { this.say(why, true); sound.deny(); } };
    if (e.phase === 'gone' || e.phase === 'leaving' || e.phase === 'talk') return;
    if (e.phase === 'request') {
      const st = e.step;
      const wants = st && st.kind === 'request' ? st.wants : [];
      const names = wants.map((w) => ITEMDEFS[w].name);
      ({ x: X, y: Y } = this.place('deal', Wd, 82, { x: 4, y: 357 - 82 }));
      sheet(s, X, Y, Wd, 82, 'THEY WANT TO BUY');
      text(s, names.join(' or '), X + 6, Y + 18, A[5], BODY);
      text(s, 'Drag one from your stock', X + 6, Y + 30, PA[5], BODY);
      text(s, 'onto the counter.', X + 6, Y + 40, PA[5], BODY);
      const have = this.inv.onGrid().some((i) => wants.includes(i.id));
      if (!have) text(s, 'YOU HAVE NONE IN STOCK', X + 6, Y + 52, B[4], TINY);
      add(X + 6, Y + 63, Wd - 12, 'Send them away', () => e.walkAway(), true, 'stop');
      return;
    }
    const buy = e.mode === 'buy';
    const it = e.item;
    const tactics = d.def.tactics;
    const H = 122 + tactics.length * 15 + (e.canScan ? 15 : 0);
    const pos = this.place('deal', Wd, H, { x: 4, y: 357 - H });
    X = pos.x; const top = pos.y;
    sheet(s, X, top, Wd, H, buy ? 'BUYING FROM THEM' : 'SELLING TO THEM');
    let y = top + 18;
    const name = it ? ITEMS[it.id].name : '';
    text(s, name, X + 6, y, A[5], BODY); y += 11;
    const facts = it ? this.itemFacts(it) : null;
    const est = !facts ? '' : facts.warn && it!.scanned ? `${facts.est.replace(' CR', '')}  ${facts.warn.split(' ')[0]}` : facts.est;
    text(s, est, X + 6, y, it?.tagged || it?.stolen ? B[4] : P.rust[5], TINY); y += 10;
    text(s, buy ? 'HIS PRICE' : 'HIS BID', X + 6, y + 2, M[6], TINY);
    text(s, `${d.ask} CR`, X + Wd - 8 - measure(`${d.ask} CR`, BODY), y, PA[5], BODY); y += 12;
    // offer stepper
    text(s, buy ? 'YOUR OFFER' : 'YOUR PRICE', X + 6, y + 4, M[6], TINY);
    add(X + 58, y, 18, '-10', () => e.adjust(-10), true, 'plain', -1);
    add(X + 77, y, 14, '-1', () => e.adjust(-1), true, 'plain', -1);
    const ov = `${e.offer}`;
    s.rect(X + 92, y, 30, 13, P.black); s.frame(X + 92, y, 30, 13, T[4]);
    text(s, ov, X + 107 - Math.round(measure(ov, BODY) / 2), y + 3, buy && e.offer > this.credits ? B[5] : A[6], BODY);
    add(X + 123, y, 14, '+1', () => e.adjust(1), true, 'plain', 1);
    add(X + 138, y, 26, '+10', () => e.adjust(10), true, 'plain', 1);
    y += 16;
    add(X + 6, y, 78, buy ? 'Make offer' : 'Name price', () => fail(e.makeOffer()), true, 'go');
    add(X + 86, y, Wd - 92, buy ? `Pay ${d.ask}` : `Take ${d.ask}`, () => fail(e.acceptHis()), !buy || d.ask <= this.credits, 'go');
    y += 17;
    text(s, 'TACTICS', X + 6, y, M[5], TINY); y += 8;
    for (const tac of tactics) {
      const usable = d.canUse(tac);
      add(X + 6, y, Wd - 12, tac.label, () => fail(e.useTactic(tac)), usable);
      y += 15;
    }
    if (e.canScan) { text(s, 'DRAG IT ONTO THE SCANNER', X + 6, y + 1, T[7], TINY); text(s, 'TO INSPECT IT', X + 6, y + 8, T[7], TINY); y += 15; }
    y += 2;
    add(X + 6, y, Wd - 12, buy ? 'Walk away' : 'No sale', () => e.walkAway(), true, 'stop'); y += 16;
    text(s, `CREDITS ${this.credits}   EACH ACTION 10 MIN`, X + 6, y, M[5], TINY);
  }

  /** what you know about an item: condition, faults and flags once it's been looked at */
  itemFacts(it: Item): { est: string; lines: string[]; warn?: string } {
    const def = ITEMS[it.id];
    if (!it.scanned) return { est: 'EST. RESALE ??? (UNINSPECTED)', lines: [def.blurb], warn: it.owner === 'customer' ? 'SCAN IT TO KNOW MORE' : undefined };
    const val = Inventory.value(it);
    const cw = condWord(it.cond ?? 1);
    const lines = [def.blurb, `Condition: ${cw.toLowerCase()}${it.fault ? ', ' + it.fault : ''}.`];
    const warn = it.tagged ? 'HALCYON TAGGED' : it.stolen ? 'STOLEN - REGISTERED OWNER' : def.contraband ? 'CONTRABAND' : undefined;
    return { est: `EST. RESALE ${val[0]}-${val[1]} CR`, lines, warn };
  }

  /** design-unit box around an item: its footprint on the grid, its image on the counter */
  itemBox(it: Item) {
    if (it.where === 'grid') { const d = ITEMS[it.id], r = cellRect(it.col, it.row, d.w, d.h); return { x: Math.round(r.x / RES), y: Math.round(r.y / RES), w: Math.round(r.w / RES), h: Math.round(r.h / RES) }; }
    const p = this.itemDrawPos(it), im = this.imgFor(it);
    return { x: Math.round(p.x / RES) - 1, y: Math.round(p.y / RES) - 1, w: Math.round(im.width / RES) + 2, h: Math.round(im.height / RES) + 2 };
  }

  bracket(s: Surface, x: number, y: number, w: number, h: number) {
    const c = Math.floor(this.t * 3) % 2 ? A[5] : A[4];
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      for (let i = 0; i < 4; i++) { s.px(cx + dx * i, cy, c); s.px(cx, cy + dy * i, c); }
    }
  }
}

/** 7-segment digit at device resolution: 10x18, 2px strokes */
function seg2(s: Surface, ch: string, x: number, y: number, on: Col, off: Col) {
  const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '' };
  const lit = SEG[ch] ?? '';
  const bar = (k: string, rx: number, ry: number, rw: number, rh: number) => s.rect(x + rx, y + ry, rw, rh, lit.includes(k) ? on : off);
  bar('a', 2, 0, 6, 2); bar('g', 2, 8, 6, 2); bar('d', 2, 16, 6, 2);
  bar('f', 0, 2, 2, 6); bar('b', 8, 2, 2, 6); bar('e', 0, 10, 2, 6); bar('c', 8, 10, 2, 6);
}

/** window positions survive reloads in this browser only; nothing breaks if storage is unavailable */
function loadPanels(): Record<string, { x: number; y: number } | null> {
  try { return JSON.parse(localStorage.getItem('rime.panels') || '{}'); } catch { return {}; }
}
function savePanels(p: Record<string, { x: number; y: number } | null>) {
  try { localStorage.setItem('rime.panels', JSON.stringify(p)); } catch { /* storage blocked */ }
}

function shadeHex(h: string, k: number) {
  const n = parseInt(h.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
