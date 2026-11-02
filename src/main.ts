import { ShopScene } from './scene/shopScene';
import { W, H, DW, DH } from './scene/layout';
import { sound } from './audio/audio';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
const bar = document.getElementById('review')!;

// Integer scaling only, so every art pixel maps to an exact square of screen pixels.
function fit() {
  const barH = bar.classList.contains('hidden') ? 0 : bar.offsetHeight;
  const fitW = document.body.clientWidth - 32, fitH = innerHeight - barH;
  const raw = Math.min(fitW / DW, fitH / DH);
  // integer scaling keeps pixels exact; only very small screens fall back to a fractional size
  // whole-number scales where possible; 1.5x is allowed so 1080p screens fill nicely
  const s = raw >= 2 ? Math.floor(raw) : raw >= 1.5 ? 1.5 : raw >= 1 ? 1 : Math.max(0.3, raw);
  canvas.style.width = DW * s + 'px';
  canvas.style.height = DH * s + 'px';
  scene.scale = s;
}

const scene = new ShopScene();
addEventListener('resize', fit);
fit();

function toNative(e: MouseEvent) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
addEventListener('mousemove', (e) => { const p = toNative(e); scene.pointer(p.x, p.y); });
addEventListener('mouseup', (e) => { const p = toNative(e); scene.release(p.x, p.y); });
addEventListener('blur', () => scene.cancelDrag());
canvas.addEventListener('mouseleave', () => { if (!scene.drag) scene.pointer(-1, -1); });
canvas.addEventListener('mousedown', (e) => { sound.start(); if (e.button !== 0) return; e.preventDefault(); const p = toNative(e); scene.click(p.x, p.y); });
addEventListener('keydown', (e) => {
  sound.start();
  if (e.key === 'h' || e.key === 'H') { bar.classList.toggle('hidden'); fit(); return; }
  scene.key(e.key);
});

let last = performance.now();
function frame(now: number) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  // tests can fast-forward with window.__speed (substeps keep timers stable)
  const speed = (window as any).__speed || 1;
  for (let i = 0; i < speed; i++) scene.update(dt);
  scene.render(ctx);
  if (canvas.style.cursor !== scene.cursor) canvas.style.cursor = scene.cursor;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// exposed for automated visual checks
(window as any).__scene = scene;
(window as any).__sound = sound;
