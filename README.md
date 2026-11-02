# Rime

A pixel-art pawn shop survival game set on a frozen mining moon. Buy, sell, haggle and scan goods, and keep enough credits to pay Mr. Voss every five days.

Runs in any desktop browser. TypeScript + HTML5 Canvas, built with Vite, no game engine.

## Play locally

```
npm install
npm run dev        # opens a local server with live reload
```

## Build

```
npm run build          # web build -> dist/  (this is what gets hosted)
npm run build:single   # one self-contained HTML file -> dist-single/index.html
npm run typecheck
```

## Hosting (Cloudflare Pages)

The site deploys automatically from this repository.

- Framework preset: **None** (or Vite)
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 22 (pinned in `.nvmrc`)

Every push to `main` publishes a new version. Pull requests and other branches get their own preview link.

## Controls

Drag goods between the stock tray and the counter. Click an item to inspect it. Drag a customer's goods onto the scanner to check them. Click the rent monitor to pay early. `M` sound, `R` reset windows, `Esc` cancel, `H` hide the help bar.

**Dev mode:** add `#dev` to the end of the address for a dev window (credits, rent, skip customer, close day, restart day, jump to day 5) and the `N` night / `T` tremor / `C` hide customer keys.

## Where things live

```
src/main.ts              entry: canvas scaling, input, game loop
src/scene/shopScene.ts   the shop: drawing, input, windows, Voss scenes, title/death screens
src/scene/ui.ts          speech plate, tooltips, buttons, deal sheet pieces
src/game/run.ts          the run: seed, days, customer queue, rent, saving
src/game/encounter.ts    one customer visit (they sell / they want to buy / talk)
src/game/negotiation.ts  haggling rules: offers, counters, patience, suspicion, tactics
src/game/inventory.ts    the stock grid; every item is in exactly one place
src/data/customers.ts    customers as generators: goods, wants, personalities, lines
src/data/items.ts        item definitions and values
src/data/balance.ts      start credits, rent, rent growth
src/audio/audio.ts       all sound, synthesized with Web Audio
src/art/                 plates, portraits and item images (from ChatGPT), plus older code-drawn art
art-src/                 original ChatGPT images and conversion sources
tools/                   image conversion scripts and browser tests (Python + Playwright)
```

## Randomness

Every new run gets a random seed (shown on the end-of-day card). The seed decides the starting stock, who visits each day, what they bring or want, item condition and hidden faults, prices, patience and which day Mr. Voss visits early. The same seed always plays out the same way.

## Art pipeline

Characters, the shop interior, the stock tray and item icons were generated with ChatGPT and converted with the scripts in `tools/` (background keying, alignment of animation frames, scaling to the game's 1280x720 layout). Customers without a portrait yet are drawn as dark placeholder silhouettes.

## Tests

Browser tests drive the real game through Playwright (Python) and need a build first:

```
npm run build:single && python3 tools/single.py
python3 tools/test_inventory.py   # drag and drop: no item lost, duplicated or overlapping
python3 tools/test_deal.py        # negotiation: credits, stock, blocking rules
python3 tools/test_loop.py        # five-day loop: rent, early payment, death, save/continue
python3 tools/test_seeds.py 16    # determinism, variety and balance across seeds
```
