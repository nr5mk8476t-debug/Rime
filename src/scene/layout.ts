// Layout of the shop scene, matched to the painted interior plate (src/art/plates).
// Layout is authored in 640x360 "design units". The game renders at RES x that (1280x720):
// new high-density art is drawn at full resolution; older art is upscaled until it is replaced.
export const W = 640;
export const H = 360;
export const RES = 2;
export const DW = W * RES;
export const DH = H * RES;

/** The service window: customer stands here, exterior visible behind. */
export const WIN = { x: 179, y: 47, w: 280, h: 156 };
/** Where a customer's 132x124 canvas sits (bottom tucked behind the counter). */
export const CUSTOMER = { x: 252, y: 85 };
/** Counter top surface and front lip. */
export const COUNTER = { top: 203, surfBottom: 230, lipBottom: 238 };
/** Lit tray directly below the window where goods are placed. */
export const TRAY = { x: 247, y: 204, w: 147, h: 25 };
/** Inventory grid */
export const CELL = 20;
export const GRID = { cols: 13, rows: 5, x: 190, y: 258 };
export const GRID_FRAME = { x: 184, y: 254, w: 13 * 20 + 12, h: 106 };
/** Physical control strip (accept / reject / inspect) */
export const CONTROLS = { x: 260, y: 239, w: 120, h: 15 };
