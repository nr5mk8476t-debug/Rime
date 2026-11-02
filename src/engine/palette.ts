// RIME master palette.
// Every sprite and surface is drawn from these ramps so the whole scene stays coherent.
// Ramps run dark -> light. Colours are stored as packed ABGR uint32 for direct ImageData writes.

export type Col = number;

export function hex(h: string, a = 255): Col {
  const n = parseInt(h.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
export function rgbOf(c: Col): [number, number, number, number] {
  return [c & 255, (c >> 8) & 255, (c >> 16) & 255, (c >>> 24) & 255];
}
export function css(c: Col): string {
  const [r, g, b, a] = rgbOf(c);
  return `rgba(${r},${g},${b},${a / 255})`;
}

const ramp = (...h: string[]) => h.map((x) => hex(x));

export const P = {
  // grimy teal: walls, panels, CRT glass
  teal: ramp('#0b1618', '#11211f', '#172d2b', '#1f3b37', '#2a4c46', '#376158', '#4c7b6e', '#6e9c89', '#9cc2a8'),
  // rust: frames, shutter, stains, coats
  rust: ramp('#1f0f0c', '#341712', '#4e2117', '#6c2d1c', '#8c3d22', '#ab532b', '#c86f37', '#e0944d', '#efbd78'),
  // faded amber: lamps, displays, paper
  amber: ramp('#2a1d0e', '#4a3315', '#74501d', '#a0732b', '#c99a3d', '#e6bf5c', '#f4dc93', '#fbf0c8'),
  // grimy metal greys (slightly green-biased)
  metal: ramp('#0b0d0e', '#14181a', '#1d2326', '#272f31', '#343d3e', '#454f4e', '#5b6662', '#77837b', '#9aa49a', '#c3c8bc'),
  // cold exterior blues
  cold: ramp('#05070e', '#0a0f1c', '#101829', '#18233a', '#22314d', '#2f4263', '#43597d', '#61789a', '#8ea1bc', '#c4cfde'),
  // skin ramps
  skin: ramp('#24120f', '#40211a', '#5f3326', '#82493a', '#a56450', '#c4836a', '#dcaa8c'),
  pale: ramp('#191b1a', '#2c302c', '#454a43', '#62685d', '#848a7c', '#a8ad9c', '#cdd0bf'),
  // blood / alarm red
  blood: ramp('#1c0507', '#3a0a0e', '#5e1016', '#8a1a1f', '#b4282a', '#d84a3c'),
  // the resource: Vel (violet)
  vel: ramp('#140c22', '#26163d', '#3d2163', '#5d3192', '#8650c4', '#b384ec', '#e2c9ff'),
  // paper / bone
  paper: ramp('#3a3426', '#5c533c', '#857a5a', '#ad9f78', '#cdc09a', '#e6dcbc'),
  // restrained neon accents
  neonCyan: hex('#58f0dc'),
  neonMag: hex('#ff4f86'),
  neonGreen: hex('#82f26a'),
  neonRed: hex('#ff3a33'),
  neonAmber: hex('#ffb33a'),
  white: hex('#f4f1e6'),
  black: hex('#050606'),
  clear: 0,
};
