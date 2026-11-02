// One customer visit: a sequence of steps (they sell to you, they ask to buy, or they just talk).
// Owns the flow between deals and applies all credit/stock changes through the Inventory model.

import { Negotiation, type Say, type TacticDef } from './negotiation';
import { Inventory, type Item } from './inventory';
import { ACTION_MINUTES } from '../data/encounters';
import type { CustomerDef, Step, VisitDef } from '../data/customers';

/** buy = they sell to you. request = waiting for you to put something on the counter. sell = you sell to them. */
export type Phase = 'buy' | 'request' | 'sell' | 'talk' | 'leaving' | 'gone';
const EXPR_INDEX = { neutral: 0, angry: 1, worried: 2, smirk: 3 } as const;

export interface Wallet { credits: number; minutes: number }

/** where customer goods appear on the counter (device px) */
const GOODS_AT = { x: 578, y: 400 };

export class Encounter {
  phase: Phase = 'talk';
  deal!: Negotiation;
  say: Say;
  sayId = 0;
  offer = 0;
  busy = 0;
  leaveAt = 0;
  scanned = false;
  trust = 0;
  stepIdx = -1;
  itemUid = -1;            // the item being dealt over
  pending: { t: number; fn: () => void } | null = null;
  talkQueue: Say[] = [];
  angry = false;
  earned = 0;              // net credits this visit, for the day summary
  history: string[] = [];

  constructor(public cust: CustomerDef, public visit: VisitDef, public inv: Inventory, public wallet: Wallet) {
    this.say = visit.greet;
    this.later(1.6, () => this.nextStep());
  }

  get exprIndex() { return EXPR_INDEX[this.say.expr]; }
  get mode() { return this.deal?.def.mode ?? 'buy'; }
  get step(): Step | null { return this.visit.steps[this.stepIdx] ?? null; }
  get item(): Item | null { return this.inv.get(this.itemUid); }
  /** an item they sell that the scanner can reveal more about */
  get canScan() { const s = this.step; return this.phase === 'buy' && !this.scanned && !!s && s.kind === 'sell'; }

  private speak(s: Say) { this.say = s; this.sayId++; this.busy = 0.5; }
  private tick() { this.wallet.minutes += ACTION_MINUTES; }
  private later(t: number, fn: () => void) { this.pending = { t, fn }; }

  update(dt: number) {
    if (this.busy > 0) this.busy -= dt;
    if (this.pending && (this.pending.t -= dt) <= 0) { const f = this.pending.fn; this.pending = null; f(); }
    if (this.phase === 'leaving') { this.leaveAt -= dt; if (this.leaveAt <= 0) this.phase = 'gone'; }
  }

  private nextStep() {
    this.stepIdx++;
    this.itemUid = -1; this.scanned = false;
    const s = this.step;
    if (!s) { this.leave(this.angry ? this.visit.byeBad : this.visit.bye); return; }
    if (s.kind === 'talk') {
      this.phase = 'talk'; this.talkQueue = s.lines.slice();
      const go = () => { const l = this.talkQueue.shift(); if (!l) { this.nextStep(); return; } this.speak(l); this.later(Math.max(2.2, l.line.length / 18), go); };
      go(); return;
    }
    if (s.kind === 'sell') {
      // their goods go on the counter
      const it = this.inv.add(s.item, 'customer', { ...GOODS_AT });
      if (it) { it.cond = s.inst.cond; it.fault = s.inst.fault; it.stolen = s.inst.stolen; it.scanned = false; }
      this.itemUid = it ? it.uid : -1;
      this.deal = new Negotiation(s.deal);
      this.offer = Math.round(s.deal.open * 0.45 / 5) * 5;
      this.phase = 'buy';
      this.speak(s.intro);
      return;
    }
    this.phase = 'request';
    this.speak(s.ask);
  }

  /** null when allowed, otherwise the reason it is refused (no state is changed) */
  blockReason(kind: 'offer' | 'accept', amount: number): string | null {
    if (this.busy > 0) return 'busy';
    if (this.phase !== 'buy' && this.phase !== 'sell') return 'busy';
    if (this.mode === 'buy') {
      const price = kind === 'accept' ? this.deal.ask : amount;
      if (price > this.wallet.credits) return "You don't have that much.";
      const it = this.item;
      if (it && !this.inv.firstFit(it.id)) return 'No room in stock. Clear a space first.';
    }
    if (amount <= 0 && kind === 'offer') return 'Name a real price.';
    return null;
  }

  adjust(delta: number) { this.offer = Math.max(0, Math.min(999, this.offer + delta)); }

  makeOffer(): string | null {
    const why = this.blockReason('offer', this.offer);
    if (why) return why === 'busy' ? null : why;
    this.tick();
    this.speak(this.deal.offer(this.offer));
    this.history.push(`offer ${this.offer}`);
    this.after();
    return null;
  }

  acceptHis(): string | null {
    const why = this.blockReason('accept', this.deal.ask);
    if (why) return why === 'busy' ? null : why;
    this.tick();
    this.speak(this.deal.acceptHis());
    this.after();
    return null;
  }

  useTactic(t: TacticDef): string | null {
    if (this.busy > 0 || !this.deal || !this.deal.canUse(t) || (this.phase !== 'buy' && this.phase !== 'sell')) return null;
    if (t.giveAt !== undefined) {
      const why = this.blockReason('offer', Math.max(1, t.giveAt));
      if (why && why !== 'busy') return why;
    }
    this.tick();
    this.speak(this.deal.tactic(t));
    this.history.push(`tactic ${t.id}`);
    this.after();
    return null;
  }

  /** The item they brought was put on the scanner. */
  inspect(): string | null {
    const s = this.step;
    if (this.busy > 0 || !this.canScan || !s || s.kind !== 'sell' || !this.deal.open) return null;
    const it = this.item;
    if (!it) return null;
    this.tick();
    this.scanned = true;
    this.deal.inspected = true;
    it.scanned = true;
    if (s.inst.becomes) it.id = s.inst.becomes;
    if (s.inst.tagged) it.tagged = true;
    this.speak(s.scanSay);
    return null;
  }

  walkAway() {
    if (this.busy > 0) return;
    const s = this.step;
    if (this.phase === 'request' && s && s.kind === 'request') { this.speak(s.none); this.trust -= 1; this.later(2.2, () => this.nextStep()); this.phase = 'talk'; return; }
    if (!this.deal || !this.deal.open || (this.phase !== 'buy' && this.phase !== 'sell')) return;
    this.speak(this.deal.walkAway());
    this.after();
  }

  /** The player put one of their items on the counter. */
  itemOffered(it: Item) {
    const s = this.step;
    if (this.phase !== 'request' || !s || s.kind !== 'request' || it.owner !== 'player') return false;
    if (!s.wants.includes(it.id)) { this.speak(s.wrong); return false; }
    this.itemUid = it.uid;
    this.phase = 'sell';
    const def = s.deal(Inventory.value(it));
    this.deal = new Negotiation({ ...def, itemId: it.id });
    this.offer = Math.round(Math.max(def.open, Inventory.value(it)[1]) / 5) * 5;
    this.speak({ line: 'That one. How much?', expr: 'neutral' });
    return true;
  }
  /** Player took their item back off the counter mid-deal. */
  itemWithdrawn(uid: number) {
    if (this.phase === 'sell' && uid === this.itemUid && this.deal.open) {
      this.phase = 'request'; this.itemUid = -1;
      this.speak({ line: 'Changed your mind? Typical.', expr: 'angry' });
    }
  }

  private after() {
    const d = this.deal;
    this.trust += d.trust; d.trust = 0;
    if (d.open) return;
    const it = this.item;
    if (d.outcome === 'left') this.angry = true;
    if (this.phase === 'buy') {
      if (d.outcome === 'deal' && it) {
        this.wallet.credits -= d.price; this.earned -= d.price;
        it.owner = 'player';
        const at = this.inv.firstFit(it.id)!;       // checked before the deal could close
        this.inv.moveToGrid(it.uid, at.col, at.row);
      } else if (it) {
        this.inv.items = this.inv.items.filter((i) => i.uid !== it.uid);   // they take their goods back
      }
    } else if (this.phase === 'sell') {
      if (d.outcome === 'deal' && it) {
        this.wallet.credits += d.price; this.earned += d.price;
        this.inv.items = this.inv.items.filter((i) => i.uid !== it.uid);
      }
    }
    this.phase = 'talk';
    if (d.outcome === 'left') { this.later(2.4, () => this.leave(this.visit.byeBad, true)); return; }
    this.later(2.4, () => this.nextStep());
  }

  private leave(line: Say, silent = false) {
    if (!silent) this.speak(line);
    this.phase = 'leaving';
    this.leaveAt = 3.2;
  }
}
