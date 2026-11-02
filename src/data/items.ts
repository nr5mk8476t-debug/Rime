// Item definitions (data-driven). Values are base credits before condition/provenance/demand.
// Balance numbers live here so they are easy to tune.

export type Category = 'food' | 'medicine' | 'oxygen' | 'tool' | 'weapon' | 'electronics' | 'mineral' | 'personal' | 'cybernetic' | 'corporate';

export interface ItemDef {
  id: string;
  name: string;
  w: number; h: number;          // grid cells
  category: Category;
  blurb: string;                  // hover line
  detail: string;                 // selected detail
  value: [number, number];        // rough resale range in credits
  contraband?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  ration: { id: 'ration', name: 'Protein ration', w: 1, h: 1, category: 'food', blurb: 'Company-issue. Tastes of tin.', detail: 'Dented, seal intact. Expiry stamp scratched off.', value: [8, 14] },
  noodles: { id: 'noodles', name: 'Hot-pack noodles', w: 1, h: 1, category: 'food', blurb: 'Self-heating. Mostly salt.', detail: 'Pull tab to heat. Popular before long shifts.', value: [6, 10] },
  stim: { id: 'stim', name: 'Med-stim', w: 1, h: 1, category: 'medicine', blurb: 'Keeps a body upright. For a while.', detail: 'Single dose. Corporate clinic batch number filed off.', value: [30, 55] },
  o2: { id: 'o2', name: 'O2 canister', w: 2, h: 2, category: 'oxygen', blurb: 'Half a shift of clean air.', detail: 'Pressure gauge reads 60%. Valve sticks.', value: [40, 70] },
  filters: { id: 'filters', name: 'Filter cartridges', w: 1, h: 1, category: 'oxygen', blurb: 'Three respirator filters.', detail: 'One looks used and repacked.', value: [12, 24] },
  pistol: { id: 'pistol', name: 'Kessel sidearm', w: 2, h: 2, category: 'weapon', blurb: 'Old security pistol. Loaded.', detail: 'Serial ground away. Grip wrapped in tape.', value: [110, 170] },
  drill: { id: 'drill', name: 'Core drill bit', w: 2, h: 2, category: 'tool', blurb: 'Heavy. Diamond teeth, mostly.', detail: 'Two teeth sheared. Still bites soft rock.', value: [60, 95] },
  eye: { id: 'eye', name: 'Optic implant', w: 1, h: 1, category: 'cybernetic', blurb: 'A used eye. Recently used.', detail: 'Tissue still on the mount. Iris module flickers.', value: [80, 140] },
  arm: { id: 'arm', name: 'Salvage forearm', w: 2, h: 2, category: 'cybernetic', blurb: 'Company prosthetic. Works, mostly.', detail: 'Elbow actuator grinds. Registration plate removed.', value: [180, 260] },
  hand: { id: 'hand', name: 'Prosthetic hand', w: 2, h: 2, category: 'cybernetic', blurb: 'Dead. Wiring fried.', detail: 'Cover screws stripped. Could be repaired.', value: [40, 160] },
  locket: { id: 'locket', name: 'Silver locket', w: 1, h: 1, category: 'personal', blurb: 'Someone\'s family, in silver.', detail: 'Engraved: "for Mira, come home".', value: [25, 60] },
  spike: { id: 'spike', name: 'Data spike', w: 1, h: 1, category: 'corporate', blurb: 'Halcyon encryption. Still warm.', detail: 'Corporate property tag. Someone will want it back.', value: [90, 300], contraband: true },
  vel: { id: 'vel', name: 'Vel shard', w: 1, h: 1, category: 'mineral', blurb: 'Raw. It hums if you hold it.', detail: 'Unlicensed possession is a Class II offence.', value: [150, 400], contraband: true },
  goldhand: { id: 'goldhand', name: 'Gilded hand', w: 2, h: 2, category: 'cybernetic', blurb: 'Gold-plated. Official issue, once.', detail: 'Serial intact. Someone important is missing a hand.', value: [300, 520] },
  eye2: { id: 'eye2', name: 'Clinic optic', w: 1, h: 1, category: 'cybernetic', blurb: 'Clean, sealed, factory fresh.', detail: 'Halcyon clinic stock. Should not be outside the ship.', value: [160, 240] },
  bundle: { id: 'bundle', name: 'Wrapped bundle', w: 2, h: 1, category: 'mineral', blurb: 'Rag-wrapped. Something glows inside.', detail: 'He wants a price before you unwrap it.', value: [0, 0] },
};

/** Starting stock layout for the review scene: [id, col, row] on the 13x4 tray */
export const START_STOCK: [string, number, number][] = [
  ['arm', 0, 0], ['pistol', 2, 0], ['drill', 4, 0], ['o2', 6, 0], ['hand', 8, 0], ['ration', 10, 0], ['noodles', 10, 1], ['goldhand', 11, 0],
  ['eye', 0, 2], ['eye2', 1, 2], ['stim', 2, 2], ['stim', 3, 2], ['filters', 4, 2], ['locket', 5, 2], ['spike', 6, 2], ['vel', 7, 2],
  ['ration', 8, 2], ['noodles', 9, 2], ['ration', 0, 3], ['filters', 1, 3],
];
