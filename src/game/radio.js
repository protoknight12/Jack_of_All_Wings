// Background radio chatter: pre-rendered voice clips (assets/audio/radio) played through the shared audio graph.
// Ambient traffic between other flights / AWACS / tanker fills the silence; reactive calls (lock, launch, waypoint...) take priority.
const BASE = 'assets/audio/radio/';
const AMBIENT = [
  ['a01', 'a02'], ['a03', 'a04'], ['a05', 'a06'], ['a07', 'a08', 'a09'], ['a10'], ['a11', 'a12'], ['a13', 'a14'], ['a15', 'a16'],
  ['a17', 'a18', 'a19'], ['a20', 'a21'], ['a22', 'a23'], ['a24', 'a25'], ['a26', 'a27'], ['a28'], ['a29', 'a30'], ['a31'], ['a32'],
];
export const CALLS = {
  start: ['start1', 'start2'], night: ['night1'], wp: ['wp1', 'wp2', 'wp3'], wpClean: ['wpc1', 'wpc2'], track: ['trk1', 'trk2'], lock: ['lock1', 'lock2'],
  launch: ['msl1', 'msl2', 'msl3', 'msl4'], evaded: ['ok1', 'ok2', 'ok3'], decoy: ['dec1'], stall: ['stall1'], flaresLow: ['low1'], dead: ['dead1', 'dead2'], crash: ['crash1'],
};

export class Radio {
  constructor(audio, onCaption) {
    this.audio = audio; this.onCaption = onCaption || (() => {}); this.enabled = true; this.buffers = new Map(); this.meta = {};
    this.cur = null; this.curPrio = 0; this.queue = []; this.nextAmbient = 20; this.last = {}; this.loaded = false; this.recent = [];
  }

  async load() {
    try { this.meta = await (await fetch(BASE + 'clips.json')).json(); } catch (e) { return; }
    this.loaded = true;                                     // buffers are decoded lazily once the AudioContext exists
  }
  async _buf(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const c = this.audio.ctx; if (!c) return null;
    try {
      const ab = await (await fetch(BASE + id + '.mp3')).arrayBuffer();
      const b = await c.decodeAudioData(ab); this.buffers.set(id, b); return b;
    } catch (e) { this.buffers.set(id, null); return null; }
  }
  // decode everything up front (called after the first user gesture creates the AudioContext)
  async preload() { if (!this.loaded || !this.audio.ctx) return; await Promise.all(Object.keys(this.meta).map((id) => this._buf(id))); }

  stop() { this._tok = (this._tok || 0) + 1; if (this.cur) { try { this.cur.stop(); } catch (e) { /* already stopped */ } this.cur = null; } this.queue.length = 0; this.curPrio = 0; this.onCaption(null); }

  // say(callList | [clip ids], prio 1 ambient / 2 normal / 3 urgent, opts)
  say(ids, prio = 2, { vol = 1, cooldownKey, cooldown = 0 } = {}) {
    if (!this.enabled || !this.loaded || this.audio.muted || !this.audio.ctx) return false;
    const now = performance.now() / 1000;
    if (cooldownKey) { if (now - (this.last[cooldownKey] || -1e9) < cooldown) return false; this.last[cooldownKey] = now; }
    const seq = Array.isArray(ids) ? ids : [ids];
    if (this.cur) {
      if (prio > this.curPrio && prio >= 3) { this.stop(); }                    // urgent calls cut in
      else if (prio >= 2 && this.curPrio >= 2) { if (this.queue.length < 1) this.queue.push({ seq, prio, vol }); return true; }
      else return false;
    }
    this._play(seq, prio, vol); return true;
  }
  pick(list, key) {                                                             // random clip, avoiding an immediate repeat
    let id; for (let i = 0; i < 4; i++) { id = list[Math.floor(Math.random() * list.length)]; if (id !== this.last[key]) break; } this.last[key] = id; return id;
  }
  call(name, prio = 2, opts = {}) { return this.say([this.pick(CALLS[name], 'p_' + name)], prio, { cooldownKey: name, ...opts }); }

  async _play(seq, prio, vol) {
    this.curPrio = prio; const token = (this._tok = (this._tok || 0) + 1); this.cur = { stop() { /* placeholder until first source starts */ } };
    for (let i = 0; i < seq.length; i++) {
      const b = await this._buf(seq[i]); if (token !== this._tok || !b) { if (!b) continue; return; }
      if (!this.enabled) break;
      const c = this.audio.ctx, s = c.createBufferSource(), g = c.createGain(), pan = c.createStereoPanner ? c.createStereoPanner() : null;
      s.buffer = b; g.gain.value = vol * (prio === 1 ? 0.55 : 0.95); if (pan) pan.pan.value = prio === 1 ? (Math.random() - 0.5) * 0.7 : 0;
      s.connect(g); (pan ? g.connect(pan).connect(this.audio.master) : g.connect(this.audio.master));
      this.cur = s; const m = this.meta[seq[i]]; if (m) this.onCaption(m.who, m.text, b.duration);
      await new Promise((res) => { s.onended = res; s.start(); });
      if (token !== this._tok) return;
      if (i < seq.length - 1) await new Promise((r) => setTimeout(r, 350 + Math.random() * 500));
      if (token !== this._tok) return;
    }
    this.cur = null; this.curPrio = 0; this.onCaption(null);
    const q = this.queue.shift(); if (q) this._play(q.seq, q.prio, q.vol);
  }

  // per-frame: schedule background traffic while flying and nothing else is being said
  update(dt, playing, threat) {
    if (!playing || !this.enabled) return;
    this.nextAmbient -= dt;
    if (this.nextAmbient > 0 || this.cur || threat) return;
    this.nextAmbient = 24 + Math.random() * 34;
    let k = 0; for (let i = 0; i < 6; i++) { k = Math.floor(Math.random() * AMBIENT.length); if (!this.recent.includes(k)) break; }
    this.recent.push(k); if (this.recent.length > 5) this.recent.shift();
    this.say(AMBIENT[k], 1);
  }
}
