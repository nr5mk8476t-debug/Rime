// RIME sound: everything is synthesized with Web Audio so it ships inside the page.
// Mixer: ambience / sfx / ui / voice / music buses -> master. A generated small-metal-room reverb
// is shared by all buses through sends. Any synth sound can later be replaced by a recorded file
// (see `samples` / play()), without touching game code.

type Bus = 'amb' | 'sfx' | 'ui' | 'voice' | 'music';
export type Material = 'metal' | 'glass' | 'soft' | 'plastic' | 'chain' | 'crystal';

const LEVELS: Record<Bus, number> = { amb: 0.34, sfx: 1.5, ui: 0.95, voice: 1.25, music: 0.38 };
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Sound {
  ctx: AudioContext | null = null;
  master!: GainNode;
  bus = {} as Record<Bus, GainNode>;
  verb!: ConvolverNode;
  verbIn!: GainNode;
  noise = {} as Record<'white' | 'pink' | 'brown', AudioBuffer>;
  muted = false;
  volume = 0.8;
  night = false;
  amb: Record<string, any> = {};
  musicTimer = 0;
  chord = 0;
  started = false;
  samples: Record<string, AudioBuffer> = {};
  /** final output node (after the limiter); recordings tap here */
  outNode: AudioNode | null = null;

  constructor() {
    try {
      const v = JSON.parse(localStorage.getItem('rime.sound') || 'null');
      if (v) { this.muted = !!v.muted; this.volume = typeof v.volume === 'number' ? v.volume : 0.8; }
    } catch { /* storage blocked */ }
  }

  /** Browsers only allow audio after a user gesture: call from the first click/key. */
  start() {
    if (this.started) { this.ctx?.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    // gentle bus compression so stacked sounds never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    // brick-wall limiter last, so nothing ever clips
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
    this.master.connect(comp).connect(lim).connect(ctx.destination);
    this.outNode = lim;
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.roomIR(1.6);
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 1;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.35;
    this.verbIn.connect(this.verb).connect(verbOut).connect(this.master);
    for (const b of Object.keys(LEVELS) as Bus[]) {
      const g = ctx.createGain(); g.gain.value = LEVELS[b];
      g.connect(this.master);
      this.bus[b] = g;
    }
    this.makeNoise();
    this.startAmbience();
    document.addEventListener('visibilitychange', () => { if (document.hidden) ctx.suspend(); else ctx.resume(); });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    this.save();
  }
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    this.save();
  }
  private save() { try { localStorage.setItem('rime.sound', JSON.stringify({ muted: this.muted, volume: this.volume })); } catch { /* blocked */ } }

  // ---------------------------------------------------------------------------------- building blocks
  private makeNoise() {
    const ctx = this.ctx!, n = ctx.sampleRate * 3;
    const w = ctx.createBuffer(1, n, ctx.sampleRate), p = ctx.createBuffer(1, n, ctx.sampleRate), br = ctx.createBuffer(1, n, ctx.sampleRate);
    const W = w.getChannelData(0), Pk = p.getChannelData(0), Br = br.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      W[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      Pk[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      last = (last + 0.02 * x) / 1.02; Br[i] = last * 3.5;
    }
    this.noise = { white: w, pink: p, brown: br };
  }

  /** Small corrugated-metal room: short bright early reflections, metallic ring, quick decay. */
  private roomIR(sec: number) {
    const ctx = this.ctx!, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        const env = Math.pow(1 - i / n, 3.2);
        const ring = Math.sin(t * 2 * Math.PI * (c ? 1730 : 1690)) * 0.06 + Math.sin(t * 2 * Math.PI * 412) * 0.04;
        d[i] = ((Math.random() * 2 - 1) * 0.9 + ring) * env * (t < 0.004 ? 0 : 1);
      }
      for (const [ms, g] of [[7, 0.6], [13, 0.45], [19, 0.35], [29, 0.25]]) d[Math.floor((ms / 1000) * ctx.sampleRate) + c * 37] += g;
    }
    return b;
  }

  /** output chain for a one-shot: gain -> panner -> bus (+ reverb send) */
  private out(bus: Bus, pan = 0, verb = 0.2): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.bus[bus]);
    if (verb > 0) { const s = ctx.createGain(); s.gain.value = verb; p.connect(s).connect(this.verbIn); }
    return g;
  }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private osc(type: OscillatorType, f: number, dest: AudioNode, t: number, dur: number, f2?: number) {
    const o = this.ctx!.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  private noiseSrc(kind: 'white' | 'pink' | 'brown', dest: AudioNode, t: number, dur: number, loop = false) {
    const s = this.ctx!.createBufferSource(); s.buffer = this.noise[kind]; s.loop = loop;
    s.playbackRate.value = rand(0.9, 1.1);
    s.connect(dest); s.start(t, rand(0, 2)); if (!loop) s.stop(t + dur + 0.05); return s;
  }
  private filter(type: BiquadFilterType, f: number, q = 1) {
    const b = this.ctx!.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  }
  /** struck metal: a cluster of inharmonic partials */
  private partials(freqs: number[], dest: AudioNode, t: number, decay: number, gain = 1) {
    freqs.forEach((f, i) => {
      const g = this.ctx!.createGain(); g.connect(dest);
      this.env(g, t, 0.002, gain / (i + 1.4), decay * (1 - i * 0.12));
      this.osc('sine', f, g, t, decay);
    });
  }
  private get now() { return this.ctx ? this.ctx.currentTime : 0; }
  private ok() { return !!this.ctx && this.ctx.state !== 'closed'; }

  // ---------------------------------------------------------------------------------- ambience
  private startAmbience() {
    const ctx = this.ctx!, t = ctx.currentTime;
    // wind outside: brown noise through a wandering band-pass, muffled by the window
    const wind = this.out('amb', 0, 0.1); wind.gain.value = 0.0001; wind.gain.linearRampToValueAtTime(0.35, t + 4);
    const wbp = this.filter('bandpass', 420, 0.6), wlp = this.filter('lowpass', 1400);
    this.noiseSrc('brown', wbp, t, 0, true); wbp.connect(wlp).connect(wind);
    const whistle = this.out('amb', 0.2, 0.15); whistle.gain.value = 0.04;
    const wh = this.filter('bandpass', 1650, 9);
    this.noiseSrc('pink', wh, t, 0, true); wh.connect(whistle);
    // mains hum + transformer buzz, from the lights
    const hum = this.out('amb', 0, 0.05); hum.gain.value = 0.035;
    const hlp = this.filter('lowpass', 420);
    hlp.connect(hum);
    [50, 100, 150, 200].forEach((f, i) => { const g = ctx.createGain(); g.gain.value = [0.9, 0.5, 0.25, 0.12][i]; g.connect(hlp); this.osc(i % 2 ? 'sawtooth' : 'sine', f, g, t, 1e6); });
    // neon tube whine on the right wall
    const tube = this.out('amb', 0.75, 0); tube.gain.value = 0.006;
    this.osc('sine', 7700, tube, t, 1e6);
    // wall fan (right): pink noise, amplitude chopped by the blades
    const fan = this.out('amb', 0.65, 0.1); fan.gain.value = 0.0;
    const fbp = this.filter('bandpass', 700, 0.8);
    this.noiseSrc('pink', fbp, t, 0, true); fbp.connect(fan);
    const chop = ctx.createOscillator(); chop.frequency.value = 22; const cg = ctx.createGain(); cg.gain.value = 0.03;
    chop.connect(cg).connect(fan.gain); chop.start(); fan.gain.value = 0.07;
    // heater (left): low warm rumble + faint electric fizz
    const heat = this.out('amb', -0.45, 0.05); heat.gain.value = 0.018;
    const hb = this.filter('lowpass', 180); this.noiseSrc('brown', hb, t, 0, true); hb.connect(heat);
    const fizz = this.out('amb', -0.6, 0); fizz.gain.value = 0.004;
    const fz = this.filter('highpass', 6000); this.noiseSrc('white', fz, t, 0, true); fz.connect(fizz);
    // the ship's drills: deep, continuous grind under everything
    const drill = this.out('amb', 0, 0.3); drill.gain.value = 0.05;
    const dlp = this.filter('lowpass', 110, 2); this.noiseSrc('brown', dlp, t, 0, true); dlp.connect(drill);
    const grind = this.out('amb', 0.15, 0.3); grind.gain.value = 0.02;
    const gbp = this.filter('bandpass', 230, 4); this.noiseSrc('pink', gbp, t, 0, true); gbp.connect(grind);
    const gl = ctx.createOscillator(); gl.frequency.value = 0.31; const gg = ctx.createGain(); gg.gain.value = 0.015; gl.connect(gg).connect(grind.gain); gl.start();
    this.amb = { wind, wbp, whistle, wh, hum, hlp, drill, fan, heat, tube };
    this.scheduleAmbient();
    this.music();
  }

  /** irregular events: gusts, distant drill impacts, ship horn, metal creaks */
  private scheduleAmbient() {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const tick = () => {
      if (!this.ok()) return;
      const t = ctx.currentTime;
      // gusts move the wind band and level
      const a = this.amb;
      a.wbp.frequency.setTargetAtTime(rand(260, 780), t, rand(1.5, 4));
      a.wind.gain.setTargetAtTime((this.night ? 0.45 : 0.32) * rand(0.6, 1.3), t, rand(1, 3));
      a.wh.frequency.setTargetAtTime(rand(1300, 2100), t, 2);
      a.whistle.gain.setTargetAtTime(Math.random() < 0.3 ? rand(0.03, 0.07) : 0.012, t, 2);
      if (Math.random() < 0.35) this.drillThump();
      if (Math.random() < 0.06) this.shipHorn();
      if (Math.random() < 0.12) this.creak();
      if (Math.random() < 0.05) this.distantSiren();
      setTimeout(tick, rand(1800, 4200));
    };
    setTimeout(tick, 1500);
  }

  drillThump() {
    if (!this.ok()) return;
    const t = this.now, o = this.out('amb', rand(-0.2, 0.3), 0.5);
    this.env(o, t, 0.01, 0.22, 0.9);
    this.osc('sine', 52, o, t, 0.9, 34);
    const n = this.out('amb', 0.1, 0.4); this.env(n, t, 0.005, 0.12, 0.5);
    const lp = this.filter('lowpass', 300); this.noiseSrc('brown', lp, t, 0.5); lp.connect(n);
  }
  shipHorn() {
    if (!this.ok()) return;
    const t = this.now, o = this.out('amb', -0.3, 0.9);
    o.gain.setValueAtTime(0.0001, t); o.gain.linearRampToValueAtTime(0.09, t + 1.5); o.gain.setValueAtTime(0.09, t + 3.5); o.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    const lp = this.filter('lowpass', 380, 1.5); lp.connect(o);
    for (const f of [61.7, 62.3, 92.5, 123.5]) this.osc('sawtooth', f, lp, t, 6);
  }
  creak() {
    if (!this.ok()) return;
    const t = this.now, o = this.out('amb', rand(-1, 1), 0.6);
    this.env(o, t, 0.2, 0.025, 0.9);
    const bp = this.filter('bandpass', rand(300, 600), 12); bp.connect(o);
    const s = this.osc('sawtooth', rand(18, 30), bp, t, 1.1);
    s.frequency.linearRampToValueAtTime(rand(12, 40), t + 1.1);
  }
  distantSiren() {
    if (!this.ok()) return;
    const t = this.now, o = this.out('amb', rand(-0.6, 0.6), 0.9);
    o.gain.setValueAtTime(0.0001, t); o.gain.linearRampToValueAtTime(0.012, t + 1); o.gain.linearRampToValueAtTime(0.0001, t + 7);
    const lp = this.filter('lowpass', 1200); lp.connect(o);
    const s = this.osc('triangle', 620, lp, t, 7);
    for (let k = 0; k < 7; k++) { s.frequency.linearRampToValueAtTime(760, t + k + 0.5); s.frequency.linearRampToValueAtTime(620, t + k + 1); }
  }

  /** after hours: wind louder, room hum drops, music darker */
  setNight(on: boolean) {
    this.night = on;
    if (!this.ok()) return;
    const t = this.now;
    this.amb.hum.gain.setTargetAtTime(on ? 0.012 : 0.035, t, 0.6);
    this.amb.tube.gain.setTargetAtTime(on ? 0 : 0.006, t, 0.3);
    this.amb.wind.gain.setTargetAtTime(on ? 0.45 : 0.32, t, 1.2);
  }

  // ---------------------------------------------------------------------------------- music
  /** sparse generative bed: slow, cold minor pads with a few distant plucks */
  private music() {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const DAY = [[45, 52, 57, 60], [41, 48, 53, 57], [38, 45, 50, 53], [40, 47, 52, 56]];     // Am F Dm E
    const NIGHT = [[40, 47, 50, 55], [41, 48, 51, 56], [38, 44, 50, 53], [40, 46, 52, 55]];  // darker, chromatic
    const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const play = () => {
      if (!this.ok()) return;
      const t = ctx.currentTime, dur = 9;
      const prog = this.night ? NIGHT : DAY;
      const notes = prog[this.chord++ % prog.length];
      const o = this.out('music', 0, 0.6);
      o.gain.setValueAtTime(0.0001, t); o.gain.linearRampToValueAtTime(0.11, t + 3.5); o.gain.setValueAtTime(0.11, t + dur - 3); o.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
      const lp = this.filter('lowpass', this.night ? 420 : 680, 0.7); lp.connect(o);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 160; lfo.connect(lg).connect(lp.frequency); lfo.start(t); lfo.stop(t + dur + 2);
      for (const m of notes) for (const det of [-6, 6]) { const s = this.osc('sawtooth', mtof(m), lp, t, dur + 2); s.detune.value = det + rand(-3, 3); }
      // a low sub on the root
      const sub = this.out('music', 0, 0); sub.gain.setValueAtTime(0.0001, t); sub.gain.linearRampToValueAtTime(0.05, t + 3); sub.gain.linearRampToValueAtTime(0.0001, t + dur + 1);
      this.osc('sine', mtof(notes[0] - 12), sub, t, dur + 1.5);
      // one or two far-off plucks from the chord, heavy in the reverb
      for (let k = 0; k < (Math.random() < 0.6 ? 2 : 1); k++) {
        const pt = t + rand(1.5, dur - 1);
        const p = this.out('music', rand(-0.7, 0.7), 1.4);
        this.env(p, pt, 0.004, 0.06, 2.4);
        this.osc('triangle', mtof(notes[Math.floor(rand(1, 4))] + 24), p, pt, 2.4);
      }
      setTimeout(play, dur * 1000);
    };
    play();
  }

  // ---------------------------------------------------------------------------------- one-shots
  /** chunky panel push-button */
  click(pan = 0) {
    if (!this.ok()) return;
    const t = this.now, o = this.out('ui', pan, 0.15);
    this.env(o, t, 0.001, 0.4, 0.05);
    const hp = this.filter('bandpass', 2600, 1.5); this.noiseSrc('white', hp, t, 0.05); hp.connect(o);
    const b = this.out('ui', pan, 0.1); this.env(b, t, 0.001, 0.35, 0.08); this.osc('sine', 160, b, t, 0.08, 90);
  }
  /** offer stepper detent */
  tick(up: boolean, pan = 0) {
    if (!this.ok()) return;
    const t = this.now, o = this.out('ui', pan, 0.05);
    this.env(o, t, 0.001, 0.18, 0.03); this.osc('square', up ? 1900 : 1500, o, t, 0.03);
  }
  /** something can't go there */
  deny(pan = 0) {
    if (!this.ok()) return;
    const t = this.now;
    for (const dt of [0, 0.11]) {
      const o = this.out('ui', pan, 0.1); this.env(o, t + dt, 0.004, 0.16, 0.08);
      const lp = this.filter('lowpass', 900); lp.connect(o); this.osc('square', 118, lp, t + dt, 0.09);
    }
  }
  /** lifting an item off the tray */
  pickup(m: Material, pan = 0) {
    if (!this.ok()) return;
    const t = this.now, o = this.out('sfx', pan, 0.2);
    if (m === 'soft') { this.env(o, t, 0.02, 0.25, 0.16); const bp = this.filter('bandpass', 1800, 0.7); this.noiseSrc('pink', bp, t, 0.18); bp.connect(o); return; }
    if (m === 'chain') { for (let k = 0; k < 4; k++) this.partials([rand(4200, 5200), rand(6300, 7400)], o, t + k * rand(0.025, 0.05), 0.12, 0.08); o.gain.value = 1; return; }
    o.gain.value = 1;
    const base = m === 'glass' || m === 'crystal' ? 2600 : m === 'plastic' ? 1400 : rand(820, 1050);
    this.partials([base, base * 2.76, base * 5.4], o, t, m === 'plastic' ? 0.05 : 0.16, 0.12);
    const s = this.out('sfx', pan, 0); this.env(s, t, 0.01, 0.05, 0.1); const bp = this.filter('bandpass', 3000, 1); this.noiseSrc('white', bp, t, 0.1); bp.connect(s);
  }
  /** setting an item down. heavy = bigger footprint */
  drop(m: Material, heavy: boolean, pan = 0, onCounter = false) {
    if (!this.ok()) return;
    const t = this.now;
    // the body of the impact
    const th = this.out('sfx', pan, onCounter ? 0.35 : 0.2);
    this.env(th, t, 0.002, heavy ? 0.7 : 0.4, heavy ? 0.22 : 0.12);
    this.osc('sine', heavy ? 120 : 190, th, t, 0.2, heavy ? 55 : 90);
    const n = this.out('sfx', pan, 0.2); this.env(n, t, 0.001, heavy ? 0.3 : 0.15, 0.08);
    const lp = this.filter('lowpass', heavy ? 900 : 1600); this.noiseSrc('brown', lp, t, 0.1); lp.connect(n);
    // the material voice
    const o = this.out('sfx', pan, 0.3); o.gain.value = 1;
    if (m === 'soft') return;
    if (m === 'chain') { for (let k = 0; k < 6; k++) this.partials([rand(3800, 5600), rand(6000, 8000)], o, t + k * rand(0.02, 0.045), 0.15, 0.09); return; }
    if (m === 'crystal') { this.partials([1760, 2637, 3520, 5274], o, t + 0.01, 1.4, 0.13); return; }
    if (m === 'glass') { this.partials([2400, 3900, 6100], o, t, 0.4, 0.12); return; }
    if (m === 'plastic') { this.partials([900, 1700], o, t, 0.05, 0.12); return; }
    const f = heavy ? rand(380, 520) : rand(700, 950);
    this.partials([f, f * 2.41, f * 3.93, f * 5.6], o, t, heavy ? 0.5 : 0.28, heavy ? 0.16 : 0.12);
  }
  /** register: drawer slides open, coins, bell. in = money received */
  register(incoming: boolean, pan = -0.6) {
    if (!this.ok()) return;
    const t = this.now;
    const d = this.out('sfx', pan, 0.25); d.gain.setValueAtTime(0.0001, t); d.gain.linearRampToValueAtTime(0.25, t + 0.04); d.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    const bp = this.filter('bandpass', 700, 2); this.noiseSrc('pink', bp, t, 0.4); bp.connect(d);
    bp.frequency.linearRampToValueAtTime(400, t + 0.3);
    const stop = this.out('sfx', pan, 0.3); this.env(stop, t + 0.32, 0.002, 0.4, 0.15); this.osc('sine', 140, stop, t + 0.32, 0.15, 70);
    const coins = this.out('sfx', pan, 0.35); coins.gain.value = 1;
    for (let k = 0; k < (incoming ? 7 : 4); k++) this.partials([rand(3000, 4200), rand(5200, 6800)], coins, t + 0.36 + k * rand(0.03, 0.07), 0.18, 0.06);
    const bell = this.out('sfx', pan, 0.5); bell.gain.value = 1;
    this.partials(incoming ? [2093, 2637, 4186, 5274] : [1568, 1976, 3136], bell, t + 0.42, 1.3, 0.12);
  }
  /** scanner: power-up whine, sweep chirps, result */
  scan(tagged: boolean, pan = 0.75) {
    if (!this.ok()) return;
    const t = this.now;
    const up = this.out('sfx', pan, 0.2); up.gain.setValueAtTime(0.0001, t); up.gain.linearRampToValueAtTime(0.06, t + 0.2); up.gain.linearRampToValueAtTime(0.0001, t + 1.15);
    this.osc('sine', 300, up, t, 1.15, 2400);
    const hum = this.out('sfx', pan, 0); hum.gain.setValueAtTime(0.0001, t); hum.gain.linearRampToValueAtTime(0.05, t + 0.1); hum.gain.linearRampToValueAtTime(0.0001, t + 1.1);
    const hl = this.filter('lowpass', 500); hl.connect(hum); this.osc('sawtooth', 100, hl, t, 1.1);
    for (let k = 0; k < 6; k++) { const b = this.out('ui', pan, 0.1); this.env(b, t + 0.12 + k * 0.16, 0.002, 0.08, 0.04); this.osc('square', 1320 + k * 90, b, t + 0.12 + k * 0.16, 0.04); }
    if (tagged) {
      for (let k = 0; k < 3; k++) for (const [f, dt] of [[880, 0], [660, 0.13]]) {
        const b = this.out('ui', pan, 0.25); this.env(b, t + 1.2 + k * 0.32 + dt, 0.004, 0.14, 0.11);
        const lp = this.filter('lowpass', 2200); lp.connect(b); this.osc('square', f, lp, t + 1.2 + k * 0.32 + dt, 0.12);
      }
    } else {
      const b = this.out('ui', pan, 0.2); this.env(b, t + 1.2, 0.004, 0.12, 0.25); this.osc('sine', 1760, b, t + 1.2, 0.25);
    }
  }
  /** the ground shudders: deep swell, rattling stock, falling grit */
  tremor() {
    if (!this.ok()) return;
    const t = this.now;
    const r = this.out('sfx', 0, 0.4); r.gain.setValueAtTime(0.0001, t); r.gain.linearRampToValueAtTime(0.55, t + 0.35); r.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const lp = this.filter('lowpass', 90, 3); this.noiseSrc('brown', lp, t, 2.5); lp.connect(r);
    this.osc('sine', 38, r, t, 2.4, 28);
    const rat = this.out('sfx', 0, 0.3); rat.gain.value = 1;
    for (let k = 0; k < 22; k++) { const p = this.out('sfx', rand(-0.8, 0.8), 0.3); p.gain.value = 1; this.partials([rand(900, 2400), rand(2600, 5200)], p, t + rand(0.1, 1.3), 0.12, 0.09); }
    const grit = this.out('sfx', 0, 0.2); grit.gain.setValueAtTime(0.0001, t + 0.3); grit.gain.linearRampToValueAtTime(0.06, t + 0.7); grit.gain.linearRampToValueAtTime(0.0001, t + 2.2);
    const hp = this.filter('highpass', 3500); this.noiseSrc('white', hp, t + 0.3, 2); hp.connect(grit);
    void rat;
  }
  /** bulb stutter: crackle of a failing filament */
  flicker(pan = -0.55) {
    if (!this.ok()) return;
    const t = this.now;
    // a couple of dry ticks and a short filament buzz
    for (let k = 0; k < 2; k++) { const o = this.out('sfx', pan, 0.05); this.env(o, t + k * rand(0.02, 0.05), 0.001, 0.025, 0.015); const bp = this.filter('bandpass', 3200, 2); this.noiseSrc('white', bp, t + k * 0.03, 0.03); bp.connect(o); }
    const z = this.out('sfx', pan, 0); this.env(z, t, 0.005, 0.012, 0.12); const lp = this.filter('lowpass', 1200); lp.connect(z); this.osc('sawtooth', 100, lp, t, 0.12);
  }
  /** footsteps crunching away through snow */
  footsteps(pan = 0) {
    if (!this.ok()) return;
    const t = this.now;
    for (let k = 0; k < 6; k++) {
      const o = this.out('sfx', pan + k * 0.08, 0.25); const at = t + k * 0.42;
      this.env(o, at, 0.005, 0.22 * Math.pow(0.72, k), 0.16);
      const bp = this.filter('bandpass', 1300 - k * 120, 0.9); this.noiseSrc('white', bp, at, 0.18); bp.connect(o);
    }
  }
  /** Voss steps up to the window: a low cluster swells in */
  sting() {
    if (!this.ok()) return;
    const t = this.now, o = this.out('music', 0, 0.8);
    o.gain.setValueAtTime(0.0001, t); o.gain.linearRampToValueAtTime(0.16, t + 1.6); o.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    const lp = this.filter('lowpass', 500, 2); lp.connect(o);
    for (const f of [55, 58.27, 82.4, 87.3]) this.osc('sawtooth', f, lp, t, 5);
    const rise = this.out('music', 0, 0.6); rise.gain.setValueAtTime(0.0001, t); rise.gain.linearRampToValueAtTime(0.05, t + 1.5); rise.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    const bp = this.filter('bandpass', 400, 2); this.noiseSrc('white', bp, t, 2); bp.connect(rise); bp.frequency.exponentialRampToValueAtTime(5000, t + 1.6);
  }
  /** a window being dragged: paper/metal slide */
  slide(pan = 0) {
    if (!this.ok()) return;
    const t = this.now, o = this.out('ui', pan, 0.05);
    this.env(o, t, 0.02, 0.07, 0.14); const bp = this.filter('bandpass', 2200, 0.8); this.noiseSrc('pink', bp, t, 0.16); bp.connect(o);
  }
  /** cold breath */
  exhale(pan = 0) {
    if (!this.ok()) return;
    const t = this.now, o = this.out('voice', pan, 0.05);
    o.gain.setValueAtTime(0.0001, t); o.gain.linearRampToValueAtTime(0.05, t + 0.15); o.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const bp = this.filter('bandpass', 900, 0.6); this.noiseSrc('pink', bp, t, 0.9); bp.connect(o);
  }

  /** dialogue voice: one syllable blip, shaped per character */
  voice(who: 'kell' | 'voss' | { pitch: number; formant: number; q: number; wave: OscillatorType; grit: number; vibrato: number; pan: number }, ch: string, mood: string) {
    if (!this.ok() || !/[a-z0-9]/i.test(ch)) return;
    const t = this.now;
    const vowel = 'aeiouy'.includes(ch.toLowerCase());
    if (typeof who === 'object') {
      const v = who;
      const o = this.out('voice', v.pan, 0.18);
      this.env(o, t, 0.01, vowel ? 0.26 : 0.18, 0.08);
      const f1 = this.filter('bandpass', v.formant * rand(0.85, 1.15), v.q); f1.connect(o);
      const p = v.pitch * (mood === 'angry' ? 1.15 : mood === 'worried' ? 1.08 : 1) * rand(0.95, 1.06);
      const a = this.osc(v.wave, p, f1, t, 0.11);
      if (v.vibrato) { const vib = this.ctx!.createOscillator(); vib.frequency.value = v.vibrato; const vg = this.ctx!.createGain(); vg.gain.value = p * 0.03; vib.connect(vg).connect(a.frequency); vib.start(t); vib.stop(t + 0.13); }
      if (v.grit) { const gr = this.out('voice', v.pan, 0); this.env(gr, t, 0.005, v.grit, 0.06); const bp = this.filter('bandpass', 2600, 1); this.noiseSrc('white', bp, t, 0.07); bp.connect(gr); }
      return;
    }
    if (who === 'kell') {
      // low, rough, tired: buzzy saw through a moving formant, with breathy grit
      const o = this.out('voice', -0.02, 0.15);
      this.env(o, t, 0.008, vowel ? 0.3 : 0.2, 0.07);
      const f1 = this.filter('bandpass', rand(480, 820), 3.5), f2 = this.filter('bandpass', rand(1100, 1600), 4);
      f1.connect(o); f2.connect(o);
      const p = (mood === 'angry' ? 128 : mood === 'worried' ? 120 : 104) * rand(0.94, 1.08);
      const s = this.osc('sawtooth', p, f1, t, 0.09); s.connect(f2);
      const gr = this.out('voice', 0, 0); this.env(gr, t, 0.005, 0.04, 0.06); const bp = this.filter('bandpass', 2400, 1); this.noiseSrc('white', bp, t, 0.07); bp.connect(gr);
    } else {
      // smooth, nasal, unhurried: sine+square with a tight high formant and a slow vibrato
      const o = this.out('voice', 0.02, 0.35);
      this.env(o, t, 0.015, vowel ? 0.22 : 0.15, 0.11);
      const f1 = this.filter('bandpass', rand(1050, 1350), 7); f1.connect(o);
      const p = (mood === 'flat' ? 150 : 172) * rand(0.97, 1.04);
      const a = this.osc('square', p, f1, t, 0.13), b = this.osc('sine', p * 2, o, t, 0.13);
      const vib = this.ctx!.createOscillator(); vib.frequency.value = 6; const vg = this.ctx!.createGain(); vg.gain.value = 4;
      vib.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency); vib.start(t); vib.stop(t + 0.15);
    }
  }
}

export const sound = new Sound();
