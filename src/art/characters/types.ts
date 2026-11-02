import { Surface } from '../../engine/surface';

export type Brows = 'neutral' | 'angry' | 'worried' | 'raised';
export type Mouth = 'neutral' | 'frown' | 'smirk' | 'talk' | 'grin' | 'open';
export interface Expression { brows: Brows; mouth: Mouth; gaze: -1 | 0 | 1 }
export type Lids = 0 | 1 | 2; // open, half, closed

export interface CharacterArt {
  id: string;
  name: string;
  w: number; h: number;
  /** offset of the canvas inside the window, relative to its bottom-centre at the counter line */
  body: Surface;
  head: Surface;
  /** paint eyes/brows/mouth over a copy of the head */
  face(target: Surface, e: Expression, lids: Lids, talk: number): void;
  /** optional prop resting on the counter (hands, ledger...) with its own idle animation */
  counter?: { w: number; h: number; x: number; y: number; draw(s: Surface, t: number): void };
  /** extra per-frame accents on the body (status LEDs, etc.) in body coordinates */
  accents?(s: Surface, t: number): void;
  expressions: Expression[];
  breathPeriod: number;
}

export function makeLayer(w: number, h: number) { return new Surface(w, h); }
