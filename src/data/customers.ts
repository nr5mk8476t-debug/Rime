// Customers are generators. Each run has its own seed; each visit is rolled from it:
// what they bring, its real condition and hidden faults, what they want, prices, patience, mood and lines.
// Every balance knob for customers lives in this file.

import type { DealDef, Say, TacticDef } from '../game/negotiation';
import { ITEMS } from './items';
import type { Rng } from '../engine/rng';

export interface VoiceDef { pitch: number; formant: number; q: number; wave: OscillatorType; grit: number; vibrato: number; pan: number }
export interface Silhouette { coat: string; trim: string; skin: string; eye: string; hat: 'hood' | 'cap' | 'bare' | 'visor' | 'collar' }

/** the real nature of an item a customer brings (mostly hidden until scanned) */
export interface Instance { cond: number; fault?: string; stolen?: boolean; tagged?: boolean; becomes?: string }

export type Step =
  | { kind: 'sell'; item: string; inst: Instance; deal: DealDef; intro: Say; scanSay: Say }
  | { kind: 'request'; wants: string[]; ask: Say; deal: (itemValue: [number, number]) => DealDef; wrong: Say; none: Say }
  | { kind: 'talk'; lines: Say[] };

export interface VisitDef { greet: Say; steps: Step[]; bye: Say; byeBad: Say }

export interface GenCtx { rng: Rng; day: number; stock: string[]; trust: number; seen: number }

export interface CustomerDef {
  id: string;
  name: string;
  portrait: 'kell' | 'voss' | Silhouette;
  voice: VoiceDef;
  /** how likely they are to come in today (0 = not at all) */
  weight: (day: number) => number;
  gen: (ctx: GenCtx) => VisitDef;
}

// ------------------------------------------------------------------------------------------------
// helpers

const r5 = (v: number) => Math.max(1, Math.round(v / 5) * 5);
const say = (line: string, expr: Say['expr'] = 'neutral'): Say => ({ line, expr });
const mid = (id: string) => (ITEMS[id].value[0] + ITEMS[id].value[1]) / 2;
const lower = (id: string) => ITEMS[id].name.toLowerCase();

/** condition roll: busted / worn / fine / pristine */
export const COND_WORDS: [number, string][] = [[0.6, 'BUSTED'], [0.85, 'WORN'], [1.05, 'GOOD'], [9, 'PRISTINE']];
export const condWord = (c: number) => (COND_WORDS.find(([m]) => c < m) ?? COND_WORDS[3])[1];
const FAULTS: Record<string, string[]> = {
  cybernetic: ['burnt wiring', 'grinding actuator', 'cloudy lens', 'cracked housing'],
  weapon: ['cracked slide', 'bent barrel'],
  tool: ['sheared teeth', 'bent shank'],
  oxygen: ['leaking valve', 'clogged mesh'],
  medicine: ['expired seal'],
  food: ['swollen tin'],
  personal: ['fake silver'],
  corporate: ['dead cell'],
  electronics: ['dead cell'],
  mineral: ['hairline fracture'],
};
export function rollInstance(rng: Rng, id: string, stolenChance = 0): Instance {
  const r = rng.next();
  const cond = r < 0.18 ? 0.5 + rng.next() * 0.1 : r < 0.5 ? 0.7 + rng.next() * 0.12 : r < 0.88 ? 0.95 + rng.next() * 0.1 : 1.15 + rng.next() * 0.15;
  const pool = FAULTS[ITEMS[id].category] ?? [];
  return { cond, fault: cond < 0.85 && pool.length ? rng.pick(pool) : undefined, stolen: rng.chance(stolenChance) || undefined };
}

interface Persona {
  greed: [number, number];   // their asking price as a multiple of real value
  floor: [number, number];   // lowest they'll take
  pay: [number, number];     // most they'll pay when buying from you
  patience: [number, number];
  proud: boolean;
  lines: Partial<DealDef['lines']> & { scan: Say[]; conceded: Say; caught: Say; scared?: Say; pity: Say; thanks: Say };
}

function dealLines(p: Persona, base: DealDef['lines']): DealDef['lines'] { return { ...base, ...p.lines } as DealDef['lines']; }

const BASE_LINES: DealDef['lines'] = {
  counter: [say('Come on. Be real.'), say('Closer. Not there yet.'), say('Try again.', 'worried')],
  insult: say("Don't waste my time.", 'angry'), repeat: say('You said that already.', 'angry'),
  accept: say('Done.'), overpay: say("Huh. Didn't expect that. Done.", 'smirk'),
  leave: say("I'm done here.", 'angry'), suspicious: say("You're playing me. Price just went up.", 'angry'),
  walkAway: say('Suit yourself.'),
};

/** a customer selling you something */
function sellStep(ctx: GenCtx, p: Persona, item: string, inst: Instance, intro: (price: number) => Say): Step {
  const rng = ctx.rng;
  const real = mid(inst.becomes ?? item) * inst.cond * (inst.tagged ? 0.7 : 1);
  // they price from what they believe, not the truth: faults they hide, stolen goods they dump
  const believed = mid(inst.becomes ?? item) * (inst.fault ? 0.95 : inst.cond) * (inst.stolen ? 0.8 : 1);
  let open = r5(believed * (p.greed[0] + rng.next() * (p.greed[1] - p.greed[0])));
  let limit = Math.min(open - 5, r5(real * (p.floor[0] + rng.next() * (p.floor[1] - p.floor[0]))));
  // a wrapped bundle: they don't know what's inside either, so they guess
  if (item === 'bundle') { open = r5(100 + rng.next() * 60); limit = r5(45 + rng.next() * 30); }
  const v = believed;
  const tactics: TacticDef[] = [];
  if (inst.fault) tactics.push({ id: 'fault', label: `Point out the ${inst.fault}`, needsInspect: true, shift: r5(v * 0.3), patience: 0, suspicion: 0, say: p.lines.conceded, bluffSay: say("You haven't even looked at it.", 'angry') });
  else tactics.push({ id: 'fault', label: rng.pick(['Say it looks damaged', 'Call it a knock-off', 'Claim it barely works']), shift: r5(v * 0.1), patience: 0, suspicion: 2, say: p.lines.caught });
  if (inst.stolen) tactics.push({ id: 'stolen', label: rng.pick(['Where did you get this?', 'Security was asking around', 'Whose was this?']), shift: r5(v * 0.3), patience: -1, suspicion: 0, say: p.lines.scared ?? say('...Does it matter? Fine. Lower.', 'worried') });
  tactics.push({ id: 'pressure', label: rng.pick(['Last offer. Take it or leave it', "I've got other customers", "Nobody else will buy this"]), shift: r5(v * 0.12), patience: -1, suspicion: 0, say: say(rng.pick(["Don't push me.", 'Fine. Fine.', 'You think so?']), 'worried') });
  if (rng.chance(0.6)) tactics.push(p.proud
    ? { id: 'pity', label: rng.pick(['Rough week? I can help', 'You look like you need this']), shift: -r5(v * 0.1), patience: -2, suspicion: 0, trust: -1, say: p.lines.pity }
    : { id: 'kind', label: rng.pick(["I'll treat you fair", 'Take your time']), shift: -r5(v * 0.05), patience: 1, suspicion: 0, trust: 1, say: p.lines.thanks });
  const pat = rng.int(p.patience[0], p.patience[1]);
  return {
    kind: 'sell', item, inst,
    deal: { mode: 'buy', itemId: item, open, limit: Math.max(1, limit), patience: pat, suspicion: rng.int(0, 1), tactics, lines: dealLines(p, BASE_LINES) },
    intro: intro(open), scanSay: rng.pick(p.lines.scan),
  };
}

/** a customer wanting to buy one of a few things from you */
function requestStep(ctx: GenCtx, p: Persona, wants: string[], ask: Say, wrong: Say, none: Say, budgetCap?: number, kindPrice?: number): Step {
  const rng = ctx.rng;
  const payLo = p.pay[0] + rng.next() * (p.pay[1] - p.pay[0]);
  const pat = rng.int(p.patience[0], p.patience[1]);
  return {
    kind: 'request', wants, ask, wrong, none,
    deal: (v) => {
      const val = (v[0] + v[1]) / 2;
      let limit = r5(val * payLo);
      if (budgetCap) limit = Math.min(limit, budgetCap);
      const open = Math.min(limit - 5, r5(val * (0.35 + rng.next() * 0.25)));
      const tactics: TacticDef[] = [
        { id: 'scarce', label: rng.pick(["Last one I've got", "They're impossible to find", 'Prices just went up']), shift: r5(val * 0.15), patience: 0, suspicion: 1, say: say(rng.pick(['...Is that so.', 'Last one. Right.', 'Convenient.']), 'worried') },
      ];
      if (kindPrice !== undefined || rng.chance(0.5)) {
        const give = kindPrice ?? r5(val * 0.35);
        tactics.push({ id: 'kind', label: give === 0 ? 'Take it. No charge' : `Let them have it for ${give}`, shift: 0, patience: 0, suspicion: 0, trust: give === 0 ? 3 : 2, giveAt: give, say: p.lines.thanks });
      }
      return { mode: 'sell', itemId: '', open: Math.max(1, open), limit, patience: pat, suspicion: 0, tactics, lines: dealLines(p, BASE_LINES) };
    },
  };
}

/** pick a few things they want, leaning toward things you actually have */
function pickWants(ctx: GenCtx, pool: string[], n = 2) {
  const have = pool.filter((w) => ctx.stock.includes(w));
  const out = new Set<string>();
  if (have.length && ctx.rng.chance(0.7)) out.add(ctx.rng.pick(have));
  while (out.size < Math.min(n, pool.length)) out.add(ctx.rng.pick(pool));
  return [...out];
}
const names = (ids: string[]) => ids.map(lower).join(' or ');

// ------------------------------------------------------------------------------------------------
// the regulars

const KELL: Persona = {
  greed: [1.1, 1.5], floor: [0.45, 0.6], pay: [1.0, 1.25], patience: [4, 5], proud: true,
  lines: {
    insult: say('That\'s an insult. I bled for this.', 'angry'), accept: say("Fine. Done. Don't ask where it came from."),
    leave: say("Forget it. I'll try the scrapyard.", 'angry'), counter: [say('Not that low. Meet me somewhere real.'), say('You know what this is worth. Come up.'), say('Closer. Not close enough.', 'worried')],
    scan: [say("Careful with it. It's warm.", 'worried'), say('Go on then. Look.'), say("It works. Mostly.", 'worried')],
    conceded: say('...Yeah. I saw that too. Fine.', 'worried'), caught: say("Damaged? It's fine and you know it.", 'angry'),
    pity: say("I told you. I'm not here for charity.", 'angry'), thanks: say("...Thanks. Don't make a thing of it.", 'smirk'),
  },
};
const MARROW: Persona = {
  greed: [1.3, 1.8], floor: [0.35, 0.5], pay: [0.9, 1.15], patience: [4, 6], proud: false,
  lines: {
    accept: say('Pleasure, dearie.', 'smirk'), leave: say('Bah. Plenty of other counters.', 'angry'), overpay: say('Hee! Soft heart, soft head.', 'smirk'),
    scan: [say('Look all you like, dearie.', 'smirk'), say('Found it fair and square. Mostly.', 'smirk')],
    conceded: say('Sharp eyes. Fine, fine.', 'smirk'), caught: say("Ha! Nice try. It's sound.", 'smirk'),
    pity: say('Pity? I buried three husbands, dearie.', 'angry'), thanks: say('Bless you.', 'smirk'),
  },
};
const INES: Persona = {
  greed: [1.0, 1.2], floor: [0.6, 0.8], pay: [0.5, 0.75], patience: [3, 4], proud: false,
  lines: {
    insult: say('That is everything the clinic has. Please.', 'worried'), accept: say('Thank you. I have to run.'),
    leave: say("I can't stand here bargaining while they choke.", 'angry'), counter: [say('We are a charity clinic.', 'worried'), say('Please. Lower.', 'worried')],
    scan: [say('It was donated. I have no idea.', 'worried')],
    conceded: say('I did not know. Then less.', 'worried'), caught: say('It is not. Do not lie to me.', 'angry'),
    pity: say('Do not pity me. Help them.', 'angry'), thanks: say('...Thank you. I will tell them who helped.', 'smirk'),
  },
};
const PIP: Persona = {
  greed: [0.8, 1.1], floor: [0.25, 0.4], pay: [0.9, 1.2], patience: [2, 3], proud: false,
  lines: {
    counter: [say('Come on, come on. Higher.', 'worried'), say('Quick, man, quick.', 'worried')],
    accept: say('Done! I was never here.', 'smirk'), leave: say("Forget it, I'll dump it in the slag.", 'angry'),
    scan: [say("Don't scan it! ...Okay, scan it. Fast.", 'worried')],
    conceded: say('Whatever, whatever. Less. Fine.', 'worried'), caught: say("It's perfect, man!", 'angry'),
    scared: say('...Today? Okay. Okay. Name a number. Fast.', 'worried'), pity: say("I don't need pity, I need credits.", 'angry'), thanks: say('You\'re alright, you know that?', 'smirk'),
  },
};
const ARDENT: Persona = {
  greed: [1.2, 1.4], floor: [0.7, 0.9], pay: [1.1, 1.4], patience: [3, 5], proud: true,
  lines: {
    counter: [say('I think we can do better than that.'), say('Nearer. Try again.')], insult: say('Please. I am not a fool.', 'angry'),
    accept: say('Agreed.', 'smirk'), overpay: say('How generous.', 'smirk'), leave: say('This has been a waste of my evening.', 'angry'),
    suspicious: say('Careful. I notice things.', 'angry'), walkAway: say('A pity.'),
    scan: [say('By all means. Be thorough.', 'smirk')], conceded: say('Hm. So it is.', 'neutral'), caught: say('No. It is not. Do not do that again.', 'angry'),
    pity: say('Do I look like I need your sympathy?', 'angry'), thanks: say('Noted.', 'smirk'),
  },
};
const GENERIC: Persona = {
  greed: [1.0, 1.5], floor: [0.4, 0.65], pay: [0.95, 1.3], patience: [3, 5], proud: false,
  lines: { scan: [say('Go ahead.'), say('Check it if you want.')], conceded: say('...Fine. Less.', 'worried'), caught: say("It's not. Come on.", 'angry'), pity: say("I'm fine.", 'angry'), thanks: say('Thanks.', 'smirk') },
};

const v = (pitch: number, formant: number, wave: OscillatorType, grit = 0.02, vibrato = 0, q = 4): VoiceDef => ({ pitch, formant, q, wave, grit, vibrato, pan: 0 });

export const CUSTOMERS: Record<string, CustomerDef> = {
  kell: {
    id: 'kell', name: 'Kell Abernathy', portrait: 'kell', voice: v(104, 650, 'sawtooth', 0.04, 0, 3.5),
    weight: () => 1.4,
    gen: (ctx) => {
      const { rng } = ctx;
      const steps: Step[] = [];
      // his first visit is always the glowing bundle; what's inside changes every run
      if (ctx.seen === 0 || rng.chance(0.35)) {
        const item = ctx.seen === 0 ? 'bundle' : rng.pick(['bundle', 'drill', 'filters', 'eye']);
        const inst: Instance = item === 'bundle' ? { cond: 1, becomes: 'vel', tagged: rng.chance(0.6) } : rollInstance(rng, item);
        steps.push(sellStep(ctx, KELL, item, inst, (p) => item === 'bundle'
          ? say(`Found this in the slag at Pit ${rng.int(2, 9)}. ${p} and it's yours.`, 'neutral')
          : say(rng.pick([`${ITEMS[item].name}. Off a dead rig. ${p}.`, `Need to move this ${lower(item)}. ${p}.`]), 'neutral')));
      }
      if (steps.length === 0 || rng.chance(0.7)) {
        const w = pickWants(ctx, ['stim', 'filters', 'o2', 'ration']);
        steps.push(requestStep(ctx, KELL, w, say(rng.pick([`While I'm here... got any ${names(w)}?`, `Need ${names(w)}. Shift's in two hours.`]), 'worried'),
          say("That's not what I asked for.", 'angry'), say('Great. Just great.', 'angry')));
      }
      return { greet: say(rng.pick(['Evening. Cold one.', 'Back again.', 'Shift C. Again.'])), steps, bye: say(rng.pick(["Shift's starting. See you around.", 'Wish me luck.'])), byeBad: say('...', 'angry') };
    },
  },

  marrow: {
    id: 'marrow', name: 'Old Marrow', portrait: { coat: '#4a4030', trim: '#8c6a3a', skin: '#6b4a34', eye: '#9cc2a8', hat: 'hood' },
    voice: v(190, 900, 'triangle', 0.06, 7, 5), weight: () => 1.3,
    gen: (ctx) => {
      const { rng } = ctx;
      const item = rng.pick(['drill', 'filters', 'hand', 'locket', 'arm', 'o2', 'pistol']);
      const inst = rollInstance(rng, item, 0.15);
      const steps: Step[] = [sellStep(ctx, MARROW, item, inst, (p) => say(rng.pick([`${ITEMS[item].name}. Pulled it from the slag myself. ${p}.`, `Lovely ${lower(item)}, this. ${p}, dearie.`]), 'smirk'))];
      if (rng.chance(0.6)) {
        const w = pickWants(ctx, ['ration', 'noodles']);
        steps.push(requestStep(ctx, MARROW, w, say('And I could eat. Something hot, or a tin.'), say("Can't eat that, can I?", 'angry'), say('No food? What kind of shop is this.', 'angry')));
      }
      return { greet: say(rng.pick(['Heh. Got bits for you, dearie.', 'Me again. Found a nice one.', 'Cold enough to crack teeth.']), 'smirk'), steps, bye: say('Mind the cold, dearie.', 'smirk'), byeBad: say('Tch.', 'angry') };
    },
  },

  ines: {
    id: 'ines', name: 'Sister Ines', portrait: { coat: '#c8c6bc', trim: '#b4282a', skin: '#a56450', eye: '#2a2a2a', hat: 'bare' },
    voice: v(215, 1200, 'triangle', 0.01, 3, 6), weight: (d) => (d >= 2 ? 1 : 0.3),
    gen: (ctx) => {
      const { rng } = ctx;
      const budget = r5(15 + rng.int(0, 4) * 5);
      const crisis = rng.pick(['Cave-in at Pit 4', 'Gas leak in the east dorms', 'Two men burned at the smelter', 'A child with lung rot']);
      const w = pickWants(ctx, ['o2', 'stim', 'filters']);
      return {
        greet: say(`${crisis}. I need help.`, 'worried'),
        steps: [requestStep(ctx, INES, w, say(`${names(w)[0].toUpperCase()}${names(w).slice(1)}. Anything. The clinic has ${budget} credits.`, 'worried'),
          say("That won't help them.", 'worried'), say("Then I'll try the company store. They'll want triple.", 'worried'), budget, 0)],
        bye: say('God keep you.'), byeBad: say('I hope you never need us.', 'angry'),
      };
    },
  },

  pip: {
    id: 'pip', name: 'Pip Varga', portrait: { coat: '#2f4263', trim: '#58f0dc', skin: '#c4836a', eye: '#58f0dc', hat: 'visor' },
    voice: v(160, 1400, 'square', 0.03, 11), weight: (d) => (d >= 2 ? 1 : 0.2),
    gen: (ctx) => {
      const { rng } = ctx;
      const item = rng.pick(['goldhand', 'eye2', 'spike', 'pistol', 'locket', 'arm']);
      const inst = rollInstance(rng, item, 0.9);
      return {
        greet: say("Hey hey. Quick one, yeah? I'm in a hurry. Don't ask.", 'worried'),
        steps: [sellStep(ctx, PIP, item, inst, (p) => say(`${ITEMS[item].name}. Real deal. ${p} and I'm gone. Less. Whatever.`, 'worried'))],
        bye: say('Never here!', 'smirk'), byeBad: say('Whatever, man.', 'angry'),
      };
    },
  },

  ardent: {
    id: 'ardent', name: 'Councillor Ardent', portrait: { coat: '#1d2326', trim: '#e6dcbc', skin: '#c4a48a', eye: '#f4dc93', hat: 'collar' },
    voice: v(128, 800, 'sine', 0, 4, 6), weight: (d) => (d >= 2 ? 0.8 : 0),
    gen: (ctx) => {
      const { rng } = ctx;
      const w = pickWants(ctx, ['eye2', 'spike', 'vel', 'goldhand'], 2);
      return {
        greet: say('Good evening. I am told you are... discreet.', 'smirk'),
        steps: [requestStep(ctx, ARDENT, w, say(`${names(w)[0].toUpperCase()}${names(w).slice(1)}. Things that should not be here. I pay well for silence.`), say('No. That is ordinary.'), say('Then I was misinformed.', 'angry'))],
        bye: say('We never spoke.', 'smirk'), byeBad: say('I will remember this shop.', 'angry'),
      };
    },
  },

  // ---------------------------------------------- new regulars (portraits pending)
  dace: {
    id: 'dace', name: 'Sgt. Dace Holloway', portrait: { coat: '#2a2f3a', trim: '#b4282a', skin: '#82493a', eye: '#ff4f86', hat: 'cap' },
    voice: v(95, 600, 'sawtooth', 0.02, 0, 3), weight: (d) => (d >= 2 ? 0.8 : 0),
    gen: (ctx) => {
      const { rng } = ctx;
      const steps: Step[] = [];
      if (rng.chance(0.6)) {
        const item = rng.pick(['pistol', 'spike', 'eye', 'vel']);
        const inst = { ...rollInstance(rng, item), stolen: true };
        steps.push(sellStep(ctx, { ...GENERIC, greed: [1.2, 1.6], floor: [0.5, 0.7], proud: true }, item, inst, (p) => say(`Evidence locker's full. ${ITEMS[item].name}. ${p}. Cash.`, 'smirk')));
      }
      const w = pickWants(ctx, ['stim', 'pistol', 'ration']);
      steps.push(requestStep(ctx, { ...GENERIC, pay: [0.9, 1.3], proud: true }, w, say(`Off the books: ${names(w)}.`), say('Wrong.', 'angry'), say('Noted. I note everything.', 'angry')));
      return { greet: say(rng.pick(['Security. Relax. Off duty.', 'Evening, shopkeeper. Just looking.']), 'smirk'), steps, bye: say('Keep your nose clean.'), byeBad: say("I'll be back. On duty.", 'angry') };
    },
  },
  neve: {
    id: 'neve', name: 'Neve Calloway', portrait: { coat: '#3d2163', trim: '#b384ec', skin: '#c4836a', eye: '#b384ec', hat: 'hood' },
    voice: v(200, 1100, 'triangle', 0.02, 5, 5), weight: (d) => (d >= 2 ? 0.8 : 0.2),
    gen: (ctx) => {
      const { rng } = ctx;
      const item = rng.pick(['vel', 'spike', 'eye2', 'o2']);
      const inst = rollInstance(rng, item, 0.6);
      if (item === 'vel') inst.tagged = rng.chance(0.4);
      const steps: Step[] = [sellStep(ctx, { ...GENERIC, greed: [1.3, 1.7], floor: [0.55, 0.75] }, item, inst, (p) => say(`Fresh off the ship. ${ITEMS[item].name}. ${p}. No haggling. Well. A little.`, 'smirk'))];
      if (rng.chance(0.5)) { const w = pickWants(ctx, ['o2', 'filters']); steps.push(requestStep(ctx, GENERIC, w, say(`I need ${names(w)} for the run out.`), say('No.'), say('Shame.'))); }
      return { greet: say("Shopkeeper. You didn't see me come in.", 'smirk'), steps, bye: say('You never saw me leave either.', 'smirk'), byeBad: say('Bad business.', 'angry') };
    },
  },
  glass: {
    id: 'glass', name: 'The Glass Man', portrait: { coat: '#26163d', trim: '#e2c9ff', skin: '#8650c4', eye: '#e2c9ff', hat: 'bare' },
    voice: v(140, 2000, 'sine', 0.05, 13, 9), weight: (d) => (d >= 3 ? 0.6 : 0),
    gen: (ctx) => {
      const { rng } = ctx;
      const steps: Step[] = [];
      if (rng.chance(0.7)) steps.push(sellStep(ctx, { ...GENERIC, greed: [0.5, 0.9], floor: [0.2, 0.35], patience: [5, 6] }, 'vel', { cond: 0.9 + rng.next() * 0.4, tagged: false },
        (p) => say(`It grew out of me last night. ${p}. It wants to go somewhere warm.`, 'smirk')));
      const w = pickWants(ctx, ['stim', 'ration']);
      steps.push(requestStep(ctx, GENERIC, w, say(`${names(w)[0].toUpperCase()}${names(w).slice(1)}. To slow it down. It sings louder at night.`, 'worried'), say('No. Not that.'), say('Then it will keep singing.', 'worried')));
      return { greet: say(rng.pick(['Can you hear it? The humming?', 'Do not touch my hand. It is not mine anymore.']), 'worried'), steps, bye: say('Listen for it.', 'smirk'), byeBad: say('It will remember you.', 'angry') };
    },
  },
  sutura: {
    id: 'sutura', name: 'Doc Sutura', portrait: { coat: '#5e1016', trim: '#c3c8bc', skin: '#a8ad9c', eye: '#58f0dc', hat: 'bare' },
    voice: v(118, 900, 'square', 0.01, 2, 7), weight: (d) => (d >= 2 ? 0.8 : 0),
    gen: (ctx) => {
      const { rng } = ctx;
      const steps: Step[] = [];
      const w = pickWants(ctx, ['eye', 'eye2', 'hand', 'arm', 'goldhand'], 3);
      steps.push(requestStep(ctx, { ...GENERIC, pay: [0.9, 1.25] }, w, say(`Parts. ${names(w)}. I have a patient on the table and an empty socket.`), say('Useless to me.'), say('Then he wakes up without one.', 'smirk')));
      if (rng.chance(0.5)) {
        const item = rng.pick(['eye', 'hand', 'arm', 'stim']);
        steps.push(sellStep(ctx, { ...GENERIC, greed: [1.2, 1.5] }, item, rollInstance(rng, item, 0.3), (p) => say(`Spare ${lower(item)}. Previous owner has no further use. ${p}.`, 'smirk')));
      }
      return { greet: say("Doctor's visit. Don't get up.", 'smirk'), steps, bye: say('Do stay healthy.', 'smirk'), byeBad: say('We may meet professionally.', 'angry') };
    },
  },
  reyk: {
    id: 'reyk', name: 'Tomas Reyk', portrait: { coat: '#6c2d1c', trim: '#e6bf5c', skin: '#82493a', eye: '#2a2a2a', hat: 'cap' },
    voice: v(112, 700, 'sawtooth', 0.03, 0, 4), weight: (d) => (d >= 2 ? 0.9 : 0.3),
    gen: (ctx) => {
      const { rng } = ctx;
      const w = pickWants(ctx, ['ration', 'noodles', 'filters', 'o2'], 2);
      return {
        greet: say(rng.pick(['Local 7. The strike fund needs supplies.', 'The men are going out on Friday. We need to eat.'])),
        steps: [requestStep(ctx, { ...KELL, pay: [0.7, 0.95] }, w, say(`${names(w)[0].toUpperCase()}${names(w).slice(1)} for the picket line. Fair price, comrade.`), say("That's no use to a picket."), say('The company store, then. God help us.', 'angry'))],
        bye: say('Solidarity.'), byeBad: say("We'll remember who stood with us.", 'angry'),
      };
    },
  },
  cross: {
    id: 'cross', name: 'Halden Cross', portrait: { coat: '#e6dcbc', trim: '#43597d', skin: '#c4a48a', eye: '#58f0dc', hat: 'collar' },
    voice: v(150, 1300, 'triangle', 0.01, 8, 6), weight: (d) => (d >= 3 ? 0.6 : 0),
    gen: (ctx) => {
      const { rng } = ctx;
      const item = rng.pick(['spike', 'eye2', 'vel']);
      const inst = { ...rollInstance(rng, item), stolen: true, tagged: item === 'vel' };
      return {
        greet: say("I'm from the ship. I'm not going back. Please don't call anyone.", 'worried'),
        steps: [sellStep(ctx, { ...PIP, greed: [0.7, 1.0], floor: [0.3, 0.45], patience: [3, 4] }, item, inst, (p) => say(`${ITEMS[item].name}. Engineering stores. I need passage money. ${p}.`, 'worried'))],
        bye: say('Thank you. Forget my face.', 'worried'), byeBad: say("They'll find me anyway.", 'worried'),
      };
    },
  },
};

// ------------------------------------------------------------------------------------------------
// walk-ins: one-off strangers, rolled entirely from the seed

const FIRST = ['Ash', 'Bryn', 'Cato', 'Dov', 'Esme', 'Fen', 'Grey', 'Hale', 'Iko', 'Jory', 'Kit', 'Lune', 'Moss', 'Nell', 'Oren', 'Pell', 'Quill', 'Rook', 'Sable', 'Tamsin', 'Ude', 'Vash', 'Wren', 'Yara'];
const ROLES = [
  { role: 'Shift worker', sells: ['locket', 'eye', 'filters', 'ration'], wants: ['ration', 'noodles', 'filters', 'stim'], coat: ['#8c3d22', '#4c7b6e', '#5b6662'] },
  { role: 'Off-shift hauler', sells: ['drill', 'arm', 'o2'], wants: ['stim', 'o2', 'filters'], coat: ['#6c2d1c', '#454f4e'] },
  { role: 'Stim addict', sells: ['locket', 'eye', 'hand', 'pistol'], wants: ['stim'], coat: ['#3d2163', '#343d3e'] },
  { role: 'Dock clerk', sells: ['spike', 'ration', 'noodles'], wants: ['eye2', 'stim', 'ration'], coat: ['#22314d', '#c3c8bc'] },
  { role: 'Widow', sells: ['locket', 'arm', 'hand', 'goldhand'], wants: ['ration', 'o2'], coat: ['#14181a', '#272f31'] },
];
export function walkIn(seed: number, rng: Rng): CustomerDef {
  const R = rng.pick(ROLES);
  const name = `${rng.pick(FIRST)}, ${R.role.toLowerCase()}`;
  const hat = rng.pick<Silhouette['hat']>(['hood', 'cap', 'bare', 'bare']);
  const voice = v(rng.int(95, 220), rng.int(600, 1500), rng.pick<OscillatorType>(['sawtooth', 'triangle', 'square']), rng.next() * 0.05, rng.chance(0.4) ? rng.int(3, 9) : 0, rng.int(3, 7));
  const desperate = R.role === 'Stim addict' || R.role === 'Widow';
  const persona: Persona = { ...GENERIC, floor: desperate ? [0.2, 0.4] : GENERIC.floor, patience: desperate ? [2, 4] : GENERIC.patience };
  return {
    id: `walkin-${seed}`, name, voice,
    portrait: { coat: rng.pick(R.coat), trim: rng.pick(['#e6bf5c', '#9aa49a', '#b4282a', '#58f0dc']), skin: rng.pick(['#a56450', '#82493a', '#c4836a', '#5f3326', '#dcaa8c']), eye: rng.pick(['#9cc2a8', '#e6bf5c', '#c4cfde', '#58f0dc']), hat },
    weight: () => 0,
    gen: (ctx) => {
      const steps: Step[] = [];
      if (rng.chance(0.65)) {
        const item = rng.pick(R.sells);
        steps.push(sellStep(ctx, persona, item, rollInstance(rng, item, desperate ? 0.5 : 0.15), (p) => say(rng.pick([`${ITEMS[item].name}. ${p}?`, `I need to sell this ${lower(item)}. ${p}.`, `What'll you give me for a ${lower(item)}? I was thinking ${p}.`]), desperate ? 'worried' : 'neutral')));
      }
      if (steps.length === 0 || rng.chance(0.45)) {
        const w = pickWants(ctx, R.wants);
        steps.push(requestStep(ctx, persona, w, say(rng.pick([`Got any ${names(w)}?`, `I'm after ${names(w)}.`])), say('Not that.'), say('Never mind, then.')));
      }
      return { greet: say(rng.pick(['Hey.', 'You open?', 'Evening.', 'Cold out there.'])), steps, bye: say(rng.pick(['Thanks.', 'Right.', 'Night.'])), byeBad: say('Whatever.', 'angry') };
    },
  };
}
