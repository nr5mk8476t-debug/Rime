// Drives a character's idle life: breathing, blinking, glances, talking mouth, expression changes.

import { Surface } from '../engine/surface';
import type { CharacterArt, Lids } from '../art/characters/types';

export class CustomerView {
  art: CharacterArt;
  expr = 0;
  t = 0;
  nextBlink = 3 + Math.random() * 3;
  blinkT = -1;
  talking = 0; // seconds of talking left
  cache = new Map<string, Surface>();
  fx: Surface;
  counterLayer: Surface | null = null;
  /** -1 = looking up/around (during tremors), small head offset */
  startle = 0;

  constructor(art: CharacterArt) {
    this.art = art;
    this.fx = new Surface(art.w, art.h);
    if (art.counter) this.counterLayer = new Surface(art.counter.w, art.counter.h);
  }

  update(dt: number) {
    this.t += dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) { this.blinkT = 0; this.nextBlink = 2.2 + Math.random() * 4 + (this.art.id === 'voss' ? 3 : 0); }
    if (this.blinkT >= 0) { this.blinkT += dt; if (this.blinkT > 0.22) this.blinkT = -1; }
    if (this.talking > 0) this.talking -= dt;
    if (this.startle > 0) this.startle -= dt;
  }

  lids(): Lids {
    if (this.blinkT < 0) return this.expr === 2 && this.art.id === 'kell' ? 1 : 0;
    return this.blinkT < 0.05 || this.blinkT > 0.17 ? 1 : 2;
  }
  talkFrame(): number {
    if (this.talking <= 0) return 0;
    return [1, 2, 1, 0, 2, 1][Math.floor(this.t * 9) % 6];
  }

  headSurface(): Surface {
    const e = this.art.expressions[this.expr];
    const lids = this.lids();
    const talk = this.talkFrame();
    const gaze = this.startle > 0 ? -1 : e.gaze;
    const key = `${this.expr}|${lids}|${talk}|${gaze}`;
    let s = this.cache.get(key);
    if (!s) {
      s = new Surface(this.art.w, this.art.h);
      s.buf.set(this.art.head.buf);
      this.art.face(s, { ...e, gaze: gaze as -1 | 0 | 1 }, lids, talk);
      s.flush();
      this.cache.set(key, s);
    }
    return s;
  }

  breath(): number {
    const p = (this.t % this.art.breathPeriod) / this.art.breathPeriod;
    return p < 0.42 ? -1 : 0;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const b = this.breath();
    if (!this.art.body.canvas.dataset.flushed) { this.art.body.flush(); this.art.body.canvas.dataset.flushed = '1'; }
    ctx.drawImage(this.art.body.canvas, x, y + b);
    if (this.art.accents) {
      this.fx.clear();
      this.art.accents(this.fx, this.t);
      ctx.drawImage(this.fx.flush(), x, y + b);
    }
    const headDy = this.startle > 0 ? -1 : 0;
    ctx.drawImage(this.headSurface().canvas, x, y + b + headDy);
  }

  drawCounter(ctx: CanvasRenderingContext2D, ox = 0, oy = 0) {
    const c = this.art.counter;
    if (!c || !this.counterLayer) return;
    this.counterLayer.clear();
    c.draw(this.counterLayer, this.t);
    ctx.drawImage(this.counterLayer.flush(), c.x + ox, c.y + oy);
  }
}
