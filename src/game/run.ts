// The survival run: days, the customer queue, closing time, rent cycles, saving and failure.
// Rules here are authoritative; the scene only presents them.

import { Inventory } from './inventory';
import { Encounter, type Wallet } from './encounter';
import { CUSTOMERS, walkIn, rollInstance } from '../data/customers';
import { Rng } from '../engine/rng';
import { BALANCE } from '../data/balance';
import { ITEMS, START_STOCK } from '../data/items';
import { OPEN_TIME } from '../data/encounters';

export const COLS = 13, ROWS = 4;
export const CLOSE_TIME = 18 * 60;
const ARRIVE_GAP = 30;          // minutes between one customer leaving and the next arriving
const SAVE_KEY = 'underhold.save.v1';

/** title: start screen. open: shop hours. closed: end-of-day card. voss: his visit. dead: run over. */
export type Mode = 'title' | 'open' | 'closed' | 'dead';

export interface DaySummary { day: number; start: number; end: number; served: string[]; skipped: number; rentNote: string }

type SavedItem = { id: string; col: number; row: number; tagged?: boolean; cond?: number; fault?: string; stolen?: boolean; scanned?: boolean };
export interface SaveData {
  v: 1; seed: number; day: number; credits: number; queueIdx: number; rentPaid: number[];
  trust: Record<string, number>; seen: Record<string, number>; items: SavedItem[];
  vossWarned: boolean; best: number; dayStart: number;
}

/** deterministic mixing of the run seed with a day / slot */
export function mix(...n: number[]) {
  let h = 2166136261 >>> 0;
  for (const x of n) { h ^= x >>> 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; h = Math.imul(h, 2246822519) >>> 0; }
  return (h ^ (h >>> 16)) >>> 0;
}
const REGULARS = ['kell', 'marrow', 'ines', 'pip', 'ardent', 'dace', 'neve', 'glass', 'sutura', 'reyk', 'cross'];
const STOCK_POOL: [string, number][] = [['ration', 5], ['noodles', 4], ['filters', 4], ['stim', 4], ['o2', 2], ['locket', 2], ['eye', 2], ['drill', 2], ['hand', 1.5], ['arm', 1], ['pistol', 1.5], ['vel', 1]];
const VALUABLES = ['eye2', 'spike', 'goldhand', 'pistol', 'arm'];

export class Run {
  mode: Mode = 'title';
  day = 1;
  wallet: Wallet = { credits: BALANCE.startCredits, minutes: OPEN_TIME };
  inv = new Inventory(COLS, ROWS);
  queueIdx = 0;                 // next customer today
  enc: Encounter | null = null;
  current: string | null = null; // customer id at the window ('voss' for the landlord)
  gap = 0;                      // seconds until the next customer steps up
  rentPaid: number[] = [];      // cycles already settled
  trust: Record<string, number> = {};
  vossWarned = false;
  summary: DaySummary | null = null;
  dayStart = BALANCE.startCredits;
  served: string[] = [];
  deathCause = '';
  best = 0;
  snapshot: string | null = null;
  seed = 1;
  /** how many times each regular has visited this run */
  seen: Record<string, number> = {};
  plan: string[] = [];
  /** set while Voss is at the window: 'warn' (day-3 visit) or 'collect' (the deadline) */
  voss: { kind: 'warn' | 'collect'; short: boolean; t: number; done: boolean } | null = null;

  constructor() { try { this.best = Number(localStorage.getItem('underhold.best') || 0); } catch { this.best = 0; } }

  // ------------------------------------------------------------------ rent
  get cycle() { return Math.floor((this.day - 1) / BALANCE.daysPerCycle); }
  rentFor(cycle: number) { return Math.round((BALANCE.rent[0] * Math.pow(BALANCE.rentGrowth, cycle)) / 5) * 5; }
  get rent() { return this.rentFor(this.cycle); }
  get dueDay() { return (this.cycle + 1) * BALANCE.daysPerCycle; }
  get daysLeft() { return this.dueDay - this.day; }
  get paid() { return this.rentPaid.includes(this.cycle); }
  /** pay this cycle's rent early. Refuses double payment and insufficient funds. */
  payRent(): string | null {
    if (this.paid) return 'Already paid this cycle.';
    if (this.wallet.credits < this.rent) return "You don't have enough.";
    this.wallet.credits -= this.rent;
    this.rentPaid.push(this.cycle);
    this.save();
    return null;
  }

  // ------------------------------------------------------------------ flow
  /** a fresh run. Every run gets its own seed unless one is given (tests, sharing a seed). */
  newRun(seed?: number) {
    Run.clear();
    this.seed = seed ?? ((Math.random() * 0xffffffff) >>> 0);
    this.day = 1; this.wallet.credits = BALANCE.startCredits; this.rentPaid = []; this.trust = {}; this.seen = {}; this.vossWarned = false;
    this.inv = this.rollStock();
    this.startDay();
  }

  /** tests: the original hand-placed stock layout */
  fixedStock() {
    this.inv = new Inventory(COLS, ROWS);
    for (const [id, col, row] of START_STOCK) { const it = this.inv.add(id, 'player', { col, row }); if (it) it.scanned = true; }
    if (this.enc) this.enc.inv = this.inv;
  }

  /** starting stock: staples, a random spread of goods, and one valuable worth holding on to */
  private rollStock() {
    const rng = new Rng(mix(this.seed, 0, 1));
    const inv = new Inventory(COLS, ROWS);
    const ids = ['ration', 'ration', 'noodles', 'filters', 'stim', rng.pick(VALUABLES)];
    const total = STOCK_POOL.reduce((a, [, w]) => a + w, 0);
    for (let n = rng.int(6, 9); n > 0; n--) {
      let r = rng.next() * total;
      for (const [id, w] of STOCK_POOL) { r -= w; if (r <= 0) { ids.push(id); break; } }
    }
    // big things first so they find room, then shuffle small ones into the gaps
    ids.sort((a, b) => ITEMS[b].w * ITEMS[b].h - ITEMS[a].w * ITEMS[a].h || rng.next() - 0.5);
    for (const id of ids) {
      const free: { col: number; row: number }[] = [];
      for (let r2 = 0; r2 < ROWS; r2++) for (let c = 0; c < COLS; c++) if (inv.fits(id, c, r2)) free.push({ col: c, row: r2 });
      if (!free.length) continue;
      const it = inv.add(id, 'player', rng.pick(free))!;
      const inst = rollInstance(rng, id);
      it.cond = inst.cond; it.fault = inst.fault; it.scanned = true;
    }
    return inv;
  }

  /** today's visitors, rolled from the seed: regulars by weight, strangers, and Voss once per cycle */
  dayPlan(day: number): string[] {
    const rng = new Rng(mix(this.seed, day, 2));
    const n = 2 + (rng.chance(0.6) ? 1 : 0) + (day >= 3 && rng.chance(0.35) ? 1 : 0);
    const plan: string[] = [];
    if (day === 1) plan.push('kell');
    while (plan.length < n) {
      const opts = REGULARS.filter((id) => !plan.includes(id)).map((id) => [id, CUSTOMERS[id].weight(day)] as [string, number]).filter(([, w]) => w > 0);
      opts.push(['walkin', 1.6]);
      const tot = opts.reduce((a, [, w]) => a + w, 0);
      let r = rng.next() * tot;
      for (const [id, w] of opts) { r -= w; if (r <= 0) { plan.push(id); break; } }
    }
    const cyc = Math.floor((day - 1) / BALANCE.daysPerCycle);
    const vossDay = cyc * BALANCE.daysPerCycle + 2 + new Rng(mix(this.seed, cyc, 7)).int(0, 2);
    if (day === vossDay) plan.splice(rng.int(0, plan.length - 1), 0, 'voss');
    return plan;
  }

  startDay() {
    this.mode = 'open';
    this.snapshot = null;
    this.wallet.minutes = OPEN_TIME;
    this.queueIdx = 0; this.enc = null; this.current = null; this.voss = null;
    this.served = []; this.dayStart = this.wallet.credits; this.summary = null;
    this.plan = this.dayPlan(this.day);
    this.gap = 1.2;
    this.save();
    try { this.snapshot = localStorage.getItem(SAVE_KEY); if (this.snapshot) localStorage.setItem(SAVE_KEY + '.morning', this.snapshot); } catch { this.snapshot = null; }
  }

  /** dev: start today again from its morning state */
  restartDay() {
    if (!this.snapshot) { try { this.snapshot = localStorage.getItem(SAVE_KEY + '.morning'); } catch { /* ignore */ } }
    if (!this.snapshot) return;
    try { localStorage.setItem(SAVE_KEY, this.snapshot); } catch { return; }
    this.continue();
  }

  get queue() { return this.plan; }
  get customerHere() { return !!this.current; }

  update(dt: number) {
    if (this.mode !== 'open') return;
    if (this.enc) {
      this.enc.update(dt);
      if (this.enc.phase === 'gone') this.finishCustomer();
      return;
    }
    if (this.voss) { this.voss.t += dt; return; }
    if (this.current === null && (this.gap -= dt) <= 0) this.nextCustomer();
  }

  private nextCustomer() {
    if (this.wallet.minutes >= CLOSE_TIME || this.queueIdx >= this.queue.length) { this.closeDay(); return; }
    const slot = this.queueIdx;
    const id = this.queue[this.queueIdx++];
    if (id === 'voss') {
      this.current = 'voss';
      this.voss = { kind: 'warn', short: this.wallet.credits < this.rent && !this.paid, t: 0, done: false };
      this.vossWarned = true;
      return;
    }
    const rng = new Rng(mix(this.seed, this.day, 100 + slot));
    const c = id === 'walkin' ? walkIn(mix(this.seed, this.day, slot), new Rng(mix(this.seed, this.day, 200 + slot))) : CUSTOMERS[id];
    const visit = c.gen({ rng, day: this.day, stock: this.inv.onGrid().map((i) => i.id), trust: this.trust[c.id] ?? 0, seen: this.seen[c.id] ?? 0 });
    this.seen[c.id] = (this.seen[c.id] ?? 0) + 1;
    this.current = c.id;
    this.enc = new Encounter(c, visit, this.inv, this.wallet);
  }

  /** called by the scene once Voss's scene has played */
  vossDone() {
    if (!this.voss) return;
    if (this.voss.kind === 'collect') return;
    this.voss = null; this.current = null; this.gap = 1.5;
    this.wallet.minutes += 20;
    this.save();
  }

  private finishCustomer() {
    const e = this.enc!;
    this.trust[e.cust.id] = (this.trust[e.cust.id] ?? 0) + e.trust;
    this.served.push(e.cust.name);
    // anything a customer left on the counter that you own goes back into stock if there is room
    for (const it of this.inv.onCounter()) {
      if (it.owner === 'customer') { this.inv.items = this.inv.items.filter((i) => i !== it); continue; }
      const at = this.inv.firstFit(it.id);
      if (at) this.inv.moveToGrid(it.uid, at.col, at.row);
    }
    this.enc = null; this.current = null;
    this.wallet.minutes += ARRIVE_GAP;
    this.gap = 2.2;
    this.save();
  }

  /** End of day. On a rent day: auto-collect if paid or affordable; otherwise Voss comes for you. */
  closeDay() {
    const skipped = Math.max(0, this.queue.length - this.queueIdx);
    let rentNote = '';
    if (this.day % BALANCE.daysPerCycle === 0) {
      if (this.paid) rentNote = `Rent of ${this.rent} was already settled.`;
      else if (this.wallet.credits >= this.rent) {
        this.wallet.credits -= this.rent; this.rentPaid.push(this.cycle);
        rentNote = `Mr. Voss collected ${this.rent} at closing.`;
      } else {
        this.current = 'voss';
        this.voss = { kind: 'collect', short: true, t: 0, done: false };
        this.deathCause = `You owed ${this.rent}. You had ${this.wallet.credits}.`;
        return;
      }
    }
    this.summary = { day: this.day, start: this.dayStart, end: this.wallet.credits, served: this.served.slice(), skipped, rentNote };
    this.mode = 'closed';
    this.current = null;
    this.best = Math.max(this.best, this.day);
    try { localStorage.setItem('underhold.best', String(this.best)); } catch { /* ignore */ }
    this.save();
  }

  nextDay() { this.day++; this.startDay(); }

  /** the deadline scene ended: the run is over */
  die() {
    this.mode = 'dead';
    this.best = Math.max(this.best, this.day - 1);
    Run.clear(this.best);
  }

  /** dev: close early */
  closeNow() { if (this.mode === 'open' && !this.enc && !this.voss) this.closeDay(); }

  // ------------------------------------------------------------------ saving
  /** saved only at safe points: start of a day and between customers */
  save() {
    if (this.mode === 'dead') return;
    const data: SaveData = {
      v: 1, seed: this.seed, seen: { ...this.seen }, day: this.day, credits: this.wallet.credits, queueIdx: this.mode === 'closed' ? this.queue.length : this.queueIdx,
      rentPaid: this.rentPaid.slice(), trust: { ...this.trust }, vossWarned: this.vossWarned, best: this.best, dayStart: this.dayStart,
      items: this.inv.items.filter((i) => i.owner === 'player' && i.where === 'grid').map((i) => ({ id: i.id, col: i.col, row: i.row, tagged: i.tagged, cond: i.cond, fault: i.fault, stolen: i.stolen, scanned: i.scanned })),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* storage blocked: play continues unsaved */ }
  }
  static load(): SaveData | null {
    try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return d && d.v === 1 ? d : null; } catch { return null; }
  }
  static clear(best?: number) {
    try { localStorage.removeItem(SAVE_KEY); if (best !== undefined) localStorage.setItem('underhold.best', String(best)); } catch { /* ignore */ }
  }
  static hasSave() { const d = Run.load(); return !!d && typeof d.day === 'number'; }

  continue(): boolean {
    const d = Run.load();
    if (!d) return false;
    this.seed = d.seed ?? 1; this.seen = d.seen ?? {};
    this.day = d.day; this.wallet.credits = d.credits; this.rentPaid = d.rentPaid; this.trust = d.trust;
    this.vossWarned = d.vossWarned; this.best = d.best; this.dayStart = d.dayStart;
    this.inv = new Inventory(COLS, ROWS);
    for (const it of d.items) { const x = this.inv.add(it.id, 'player', { col: it.col, row: it.row }); if (x) Object.assign(x, { tagged: it.tagged, cond: it.cond, fault: it.fault, stolen: it.stolen, scanned: it.scanned }); }
    this.plan = this.dayPlan(this.day);
    this.mode = 'open'; this.enc = null; this.current = null; this.voss = null; this.served = []; this.summary = null;
    this.queueIdx = d.queueIdx;
    this.wallet.minutes = OPEN_TIME + d.queueIdx * 60;
    this.gap = 1.2;
    if (this.queueIdx >= this.queue.length) this.closeDay();
    return true;
  }
}
