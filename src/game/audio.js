// WebAudio sound engine: continuous engine/wind/missile loops driven by game state + one-shot effects.
// API kept compatible with the old beeper: init(), beep(freq,dur,vol,type), boom(vol,dur), muted.
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.volume = 0.8; this.master = null; this.loops = null; this.noiseBuf = null; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);
    // 3 s looping noise
    const n = c.sampleRate * 3, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 6; }
    this.noiseBuf = b;
    this._buildLoops();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _noise(loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; if (loop) s.loopStart = Math.random() * 1.5; return s; }

  _buildLoops() {
    const c = this.ctx, L = (this.loops = {});
    // engine: two detuned saws through a lowpass + filtered noise roar
    const eng = c.createGain(); eng.gain.value = 0; eng.connect(this.master);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(eng);
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'sawtooth';
    const og = c.createGain(); og.gain.value = 0.35; o1.connect(og); o2.connect(og); og.connect(lp); o1.start(); o2.start();
    const rn = this._noise(), rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 700; rf.Q.value = 0.6;
    const rg = c.createGain(); rg.gain.value = 0.5; rn.connect(rf).connect(rg).connect(eng); rn.start();
    Object.assign(L, { eng, lp, o1, o2, rf, rg });
    // wind
    const wg = c.createGain(); wg.gain.value = 0; wg.connect(this.master);
    const wn = this._noise(), wf = c.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 900; wn.connect(wf).connect(wg); wn.start();
    Object.assign(L, { wg, wf });
    // incoming missile: rocket rumble + whistle (position/pan set per frame)
    const mg = c.createGain(); mg.gain.value = 0; const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { mg.connect(pan).connect(this.master); } else mg.connect(this.master);
    const mn = this._noise(), mf = c.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 900; mf.Q.value = 0.9; mn.connect(mf).connect(mg); mn.start();
    const mo = c.createOscillator(); mo.type = 'sawtooth'; mo.frequency.value = 220; const mog = c.createGain(); mog.gain.value = 0.06; mo.connect(mog).connect(mg); mo.start();
    Object.assign(L, { mg, mf, mo, pan });
    // flare hiss
    const fg = c.createGain(); fg.gain.value = 0; fg.connect(this.master);
    const fn = this._noise(), ff = c.createBiquadFilter(); ff.type = 'highpass'; ff.frequency.value = 3500; fn.connect(ff).connect(fg); fn.start();
    L.fg = fg;
  }

  // per-frame: p = player {throttle, v, stalled, alive, g}, msl = nearest live missile {dist, pan, closing} | null, flaring bool
  update(p, msl, flaring, playing) {
    if (!this.ctx || !this.loops) return; const t = this.ctx.currentTime, L = this.loops, k = 0.08;
    const on = playing && p.alive ? 1 : 0, th = p.throttle;
    L.eng.gain.setTargetAtTime(on * (0.10 + 0.16 * th), t, k);
    const f = 55 + th * 45 + (p.v || 0) * 0.08;
    L.o1.frequency.setTargetAtTime(f, t, k); L.o2.frequency.setTargetAtTime(f * 1.008, t, k);
    L.lp.frequency.setTargetAtTime(350 + th * 900, t, k); L.rf.frequency.setTargetAtTime(500 + th * 900, t, k); L.rg.gain.setTargetAtTime(0.3 + th * 0.9, t, k);
    L.wg.gain.setTargetAtTime(on * Math.min(0.12, (p.v || 0) / 260 * 0.09 + (p.stalled ? 0.03 : 0)), t, 0.15);
    L.wf.frequency.setTargetAtTime(700 + (p.v || 0) * 5, t, 0.2);
    L.fg.gain.setTargetAtTime(flaring && on ? 0.10 : 0, t, 0.03);
    if (msl && on) {
      const near = Math.max(0, 1 - msl.dist / 2600);
      L.mg.gain.setTargetAtTime(0.03 + near * near * 0.4, t, 0.05);
      if (L.pan) L.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, msl.pan)), t, 0.05);
      const dop = 1 + Math.max(-0.4, Math.min(0.4, -msl.closing / 700));   // higher pitch when closing, drops after passing
      L.mf.frequency.setTargetAtTime(700 * dop + near * 500, t, 0.05); L.mo.frequency.setTargetAtTime(200 * dop + near * 120, t, 0.05);
    } else L.mg.gain.setTargetAtTime(0, t, 0.1);
  }
  silence() { if (this.loops) { const t = this.ctx.currentTime; for (const g of [this.loops.eng, this.loops.wg, this.loops.mg, this.loops.fg]) g.gain.setTargetAtTime(0, t, 0.05); } }

  beep(freq, dur = 0.08, vol = 0.05, type = 'square') {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  chime(notes = [660, 990], vol = 0.05) { notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.16, vol, 'triangle'), i * 95)); }
  // explosion: noise burst with falling lowpass + sub thump. vol scales with proximity.
  boom(vol = 0.25, dur = 0.9, pan = 0) {
    if (this.muted || !this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = this._noise(false), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(90, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 1.5, dur + 0.1);
    const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + dur * 0.8);
    og.gain.setValueAtTime(vol * 1.4, t); og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9); o.connect(og).connect(this.master); o.start(t); o.stop(t + dur);
  }
  // rocket launch whoosh (SAM site fire), distance-attenuated
  launch(dist) {
    if (this.muted || !this.ctx) return; const c = this.ctx, t = c.currentTime, v = 0.05 + 0.3 * Math.max(0, 1 - dist / 3500);
    const s = this._noise(false), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 1.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 1.5, 2);
  }
  flare() { if (this.muted || !this.ctx) return; const c = this.ctx, t = c.currentTime, s = this._noise(false), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 2500; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 1.5, 0.25); }
}
