// Negotiation rules. Pure logic, no drawing: the scene feeds player actions in and shows the results.
// The game's rules are authoritative for prices, patience and outcomes (dialogue only reports them).

export type Mode = 'buy' | 'sell';          // buy: player buys from customer. sell: player sells to customer.
export type Expr = 'neutral' | 'angry' | 'worried' | 'smirk';
export interface Say { line: string; expr: Expr }

export interface TacticDef {
  id: string;
  label: string;
  /** requires the item to have been inspected first */
  needsInspect?: boolean;
  /** floor/budget shift (buy: lowers his minimum, sell: raises his maximum) */
  shift: number;
  patience: number;
  suspicion: number;
  say: Say;
  /** said instead when used without having inspected */
  bluffSay?: Say;
  /** relationship change with this customer */
  trust?: number;
  /** sell-only: sets the price outright and closes immediately */
  giveAt?: number;
}

export interface DealDef {
  mode: Mode;
  itemId: string;
  /** buy: his opening ask. sell: his opening bid */
  open: number;
  /** buy: lowest he will take. sell: most he will pay. Hidden from the player. */
  limit: number;
  patience: number;
  suspicion: number;
  tactics: TacticDef[];
  lines: {
    counter: Say[]; insult: Say; repeat: Say; accept: Say; overpay: Say; leave: Say;
    suspicious: Say; walkAway: Say;
  };
}

export type Outcome = 'open' | 'deal' | 'left' | 'walked';

export class Negotiation {
  ask: number;           // his current price (buy) or bid (sell)
  limit: number;
  patience: number;
  suspicion: number;
  outcome: Outcome = 'open';
  price = 0;             // agreed price once a deal is struck
  lastOffer: number | null = null;
  used = new Set<string>();
  rounds = 0;
  trust = 0;
  inspected = false;
  log: string[] = [];

  constructor(public def: DealDef) {
    this.ask = def.open;
    this.limit = def.limit;
    this.patience = def.patience;
    this.suspicion = def.suspicion;
  }

  get open() { return this.outcome === 'open'; }

  private round5(v: number) { return Math.round(v / 5) * 5; }

  /** Player names a price. Returns his reaction. Credits/stock checks are done by the caller first. */
  offer(amount: number): Say {
    if (!this.open) return this.def.lines.accept;
    const L = this.def.lines;
    const buy = this.def.mode === 'buy';
    this.rounds++;
    this.patience -= 1;
    const repeat = this.lastOffer === amount;
    this.lastOffer = amount;
    let say: Say;

    // in his favour already? take it
    if (buy ? amount >= this.ask : amount <= this.ask) {
      this.close(amount);
      return (buy ? amount > this.ask : amount < this.ask) ? L.overpay : L.accept;
    }
    const gapToLimit = buy ? this.limit - amount : amount - this.limit; // >0 means beyond what he'll accept
    const span = Math.max(1, Math.abs(this.ask - this.limit));
    if (repeat) { this.patience -= 1; say = L.repeat; }
    else if (gapToLimit > span * 1.2 || (buy ? amount < this.limit * 0.5 : amount > this.limit * 1.8)) {
      this.patience -= 1; say = L.insult;
    } else if (gapToLimit <= 0) {
      // acceptable to him: he takes it if close to his price, or if he's running out of patience
      const closeEnough = Math.abs(this.ask - amount) <= span * 0.45;
      if (closeEnough || this.patience <= 2) { this.close(amount); return L.accept; }
      this.ask = this.round5(this.ask - (this.ask - amount) * 0.5);
      say = L.counter[this.rounds % L.counter.length];
    } else {
      this.ask = this.round5(buy ? Math.max(this.limit, this.ask - (this.ask - amount) * 0.3) : Math.min(this.limit, this.ask + (amount - this.ask) * 0.3));
      say = L.counter[this.rounds % L.counter.length];
    }
    if (this.patience <= 0) { this.outcome = 'left'; return L.leave; }
    return say;
  }

  canUse(t: TacticDef) { return this.open && !this.used.has(t.id); }

  tactic(t: TacticDef): Say {
    if (!this.canUse(t)) return this.def.lines.repeat;
    this.used.add(t.id);
    const buy = this.def.mode === 'buy';
    const bluff = t.needsInspect && !this.inspected;
    if (t.giveAt !== undefined) { this.trust += t.trust ?? 0; this.close(t.giveAt); return t.say; }
    this.patience += t.patience;
    this.suspicion += t.suspicion + (bluff ? 1 : 0);
    this.trust += t.trust ?? 0;
    if (this.suspicion >= 4) {
      // he stops trusting what you say and digs in
      this.limit = this.round5(buy ? this.limit + 10 : this.limit - 10);
      if (this.patience <= 0) { this.outcome = 'left'; return this.def.lines.leave; }
      return this.def.lines.suspicious;
    }
    const shift = bluff ? Math.round(t.shift / 2) : t.shift;
    this.limit = this.round5(buy ? this.limit - shift : this.limit + shift);
    // his asking price moves toward the new reality too
    if (buy) this.ask = Math.max(this.limit, this.round5(this.ask - shift * 0.6));
    else this.ask = Math.min(this.limit, this.round5(this.ask + shift * 0.6));
    if (this.patience <= 0) { this.outcome = 'left'; return this.def.lines.leave; }
    return bluff && t.bluffSay ? t.bluffSay : t.say;
  }

  /** Player takes his current price. */
  acceptHis(): Say {
    if (!this.open) return this.def.lines.accept;
    this.close(this.ask);
    return this.def.lines.accept;
  }

  walkAway(): Say { this.outcome = 'walked'; return this.def.lines.walkAway; }

  private close(price: number) { this.outcome = 'deal'; this.price = price; }
}
