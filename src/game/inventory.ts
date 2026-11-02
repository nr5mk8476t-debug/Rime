// Inventory model: the single source of truth for every physical item in the shop.
// An item is always in exactly one place (the stock grid or the counter). Moves are validated
// and applied atomically, so items can never duplicate, vanish, or overlap.

import { ITEMS } from '../data/items';

export type Owner = 'player' | 'customer';
export interface Item {
  uid: number;
  id: string;
  owner: Owner;
  where: 'grid' | 'counter';
  col: number; row: number;   // grid position (top-left cell)
  x: number; y: number;       // counter position (device px, top-left of the image)
  /** carries a Halcyon tracking tag (found by scanning) */
  tagged?: boolean;
  /** condition multiplier on value (0.5 busted .. 1.3 pristine) */
  cond?: number;
  /** hidden fault, revealed by the scanner */
  fault?: string;
  /** someone else's property */
  stolen?: boolean;
  /** you've looked at it properly (scanned, or your own stock) */
  scanned?: boolean;
}

export class Inventory {
  items: Item[] = [];
  private nextUid = 1;
  constructor(public cols: number, public rows: number) {}

  add(id: string, owner: Owner, at: { col: number; row: number } | { x: number; y: number }): Item | null {
    const it: Item = { uid: this.nextUid++, id, owner, where: 'grid', col: 0, row: 0, x: 0, y: 0 };
    if ('col' in at) {
      if (!this.fits(id, at.col, at.row)) return null;
      it.col = at.col; it.row = at.row;
    } else { it.where = 'counter'; it.x = at.x; it.y = at.y; }
    this.items.push(it);
    return it;
  }

  get(uid: number) { return this.items.find((i) => i.uid === uid) ?? null; }
  onGrid() { return this.items.filter((i) => i.where === 'grid'); }
  onCounter() { return this.items.filter((i) => i.where === 'counter'); }

  /** Item occupying a grid cell, if any. */
  at(col: number, row: number, ignoreUid = -1): Item | null {
    for (const i of this.items) {
      if (i.where !== 'grid' || i.uid === ignoreUid) continue;
      const d = ITEMS[i.id];
      if (col >= i.col && col < i.col + d.w && row >= i.row && row < i.row + d.h) return i;
    }
    return null;
  }

  /** Would item `id` fit with its top-left at (col,row)? Returns blocking items for feedback. */
  check(id: string, col: number, row: number, ignoreUid = -1): { ok: boolean; outOfBounds: boolean; blockers: Item[] } {
    const d = ITEMS[id];
    const outOfBounds = col < 0 || row < 0 || col + d.w > this.cols || row + d.h > this.rows;
    const blockers = new Set<Item>();
    for (let r = row; r < row + d.h; r++) for (let c = col; c < col + d.w; c++) {
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
      const b = this.at(c, r, ignoreUid);
      if (b) blockers.add(b);
    }
    return { ok: !outOfBounds && blockers.size === 0, outOfBounds, blockers: [...blockers] };
  }
  fits(id: string, col: number, row: number, ignoreUid = -1) { return this.check(id, col, row, ignoreUid).ok; }

  moveToGrid(uid: number, col: number, row: number): boolean {
    const it = this.get(uid);
    if (!it || !this.fits(it.id, col, row, uid)) return false;
    it.where = 'grid'; it.col = col; it.row = row;
    return true;
  }
  moveToCounter(uid: number, x: number, y: number): boolean {
    const it = this.get(uid);
    if (!it) return false;
    it.where = 'counter'; it.x = x; it.y = y;
    return true;
  }

  /** First free top-left cell for an item, scanning row by row. */
  firstFit(id: string): { col: number; row: number } | null {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.fits(id, c, r)) return { col: c, row: r };
    return null;
  }

  /** what this particular item is worth, given its condition */
  static value(it: { id: string; cond?: number; tagged?: boolean }): [number, number] {
    const v = ITEMS[it.id].value, k = (it.cond ?? 1) * (it.tagged ? 0.7 : 1);
    return [Math.round(v[0] * k), Math.round(v[1] * k)];
  }

  usedCells() { return this.onGrid().reduce((n, i) => n + ITEMS[i.id].w * ITEMS[i.id].h, 0); }

  /** Debug invariant: no overlaps, everything in bounds, unique uids. */
  validate(): string[] {
    const errs: string[] = [];
    const seen = new Set<number>();
    const occ = new Map<string, number>();
    for (const i of this.items) {
      if (seen.has(i.uid)) errs.push(`duplicate uid ${i.uid}`);
      seen.add(i.uid);
      if (i.where !== 'grid') continue;
      const d = ITEMS[i.id];
      for (let r = i.row; r < i.row + d.h; r++) for (let c = i.col; c < i.col + d.w; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) errs.push(`${i.id}#${i.uid} out of bounds`);
        const k = `${c},${r}`;
        if (occ.has(k)) errs.push(`overlap at ${k}: #${occ.get(k)} and #${i.uid}`);
        occ.set(k, i.uid);
      }
    }
    return errs;
  }
}
