// Encounter content (data-driven). Numbers here are the balance knobs for each deal.
import type { DealDef } from '../game/negotiation';

export const KELL_SELLS_BUNDLE: DealDef = {
  mode: 'buy',
  itemId: 'bundle',
  open: 140,
  limit: 70,
  patience: 5,
  suspicion: 1,
  tactics: [
    {
      id: 'tagged', label: "It's Halcyon-tagged", needsInspect: true, shift: 25, patience: 0, suspicion: 1,
      say: { line: "...They tag them? Then it's poison. Take it off my hands before they come looking.", expr: 'worried' },
      bluffSay: { line: "Tagged? You haven't even unwrapped it. Nice try.", expr: 'smirk' },
    },
    {
      id: 'lowgrade', label: 'Call it low-grade', shift: 10, patience: 0, suspicion: 2,
      say: { line: "Low-grade. Sure. You'd know, would you?", expr: 'angry' },
    },
    {
      id: 'hurry', label: 'Shift starts soon, right?', shift: 10, patience: -1, suspicion: 0,
      say: { line: "Don't push me. ...Fine. I don't have all night.", expr: 'worried' },
    },
    {
      id: 'pity', label: "Rough week? I'll help you out", shift: -10, patience: -2, suspicion: 0, trust: -1,
      say: { line: "I told you. I'm not here for charity. Talk numbers or I walk.", expr: 'angry' },
    },
  ],
  lines: {
    counter: [
      { line: "Not that low. Meet me somewhere real.", expr: 'neutral' },
      { line: "You know what this is worth. Come up.", expr: 'neutral' },
      { line: "Closer. Not close enough.", expr: 'worried' },
    ],
    insult: { line: "That's an insult. I bled for this.", expr: 'angry' },
    repeat: { line: "You said that already.", expr: 'angry' },
    accept: { line: "...Fine. Done. Don't ask where it came from.", expr: 'neutral' },
    overpay: { line: "Huh. Didn't think you'd go that high. Done.", expr: 'smirk' },
    leave: { line: "Forget it. I'll try the scrapyard.", expr: 'angry' },
    suspicious: { line: "You're working me. I can tell. Price just went up.", expr: 'angry' },
    walkAway: { line: "Your loss. Someone'll buy it.", expr: 'angry' },
  },
};

export const KELL_BUYS_STIM: DealDef = {
  mode: 'sell',
  itemId: 'stim',
  open: 25,
  limit: 50,
  patience: 4,
  suspicion: 0,
  tactics: [
    {
      id: 'lastone', label: "Last one I've got", shift: 10, patience: 0, suspicion: 1,
      say: { line: "Last one. Right. ...My hand won't wait.", expr: 'worried' },
    },
    {
      id: 'cheap', label: 'Take it for 10', shift: 0, patience: 0, suspicion: 0, trust: 2, giveAt: 10,
      say: { line: "...Thanks. Don't make a thing of it.", expr: 'smirk' },
    },
  ],
  lines: {
    counter: [
      { line: "For one stim? Come down.", expr: 'neutral' },
      { line: "I just paid you. Have a heart.", expr: 'worried' },
    ],
    insult: { line: "For a stim? You're worse than the company store.", expr: 'angry' },
    repeat: { line: "You said that already.", expr: 'angry' },
    accept: { line: "Deal. Give it here.", expr: 'neutral' },
    overpay: { line: "Cheaper than I thought. Done.", expr: 'smirk' },
    leave: { line: "Forget it. I'll bleed.", expr: 'angry' },
    suspicious: { line: "Stop playing games. Name a price.", expr: 'angry' },
    walkAway: { line: "...Right. I'll manage.", expr: 'worried' },
  },
};

export const KELL_LINES = {
  greet: { line: "Found this in the slag at Pit 4. What's it worth to you?", expr: 'neutral' as const },
  inspect: { line: "Careful with it. It's warm.", expr: 'worried' as const },
  askStim: { line: "While I'm here... got a med-stim? Hand's bleeding again.", expr: 'worried' as const },
  noStock: { line: "No stims? Great.", expr: 'angry' as const },
  bye: { line: "Shift's starting. See you around.", expr: 'neutral' as const },
  byeBad: { line: "...", expr: 'angry' as const },
};

/** Shop clock: minutes added per meaningful action */
export const ACTION_MINUTES = 10;
export const OPEN_TIME = 8 * 60;
