// DOM HUD (score, waypoint / target arrow, throttle/speed/alt/flares, seeker feedback, warnings, toasts) .
import { CFG } from './config.js';
import { U, font, tint, phosphor } from './ui.js';
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = { score: $('score-val'), passed: $('passed-val'), thr: $('thr-fill'), thrv: $('thr-val'), spd: $('spd'), alt: $('alt'), flares: $('flares'), flareBar: $('flare-bar'), flareBox: $('flare-box'),
      sk: $('seeker'), skTitle: $('sk-title'), skFill: $('sk-fill'), skLine: $('sk-line'), wptArrow: $('wpt-arrow'), wptTxt: $('wpt-txt'), wptSub: $('wpt-sub'),
      warn: $('warn'), toasts: $('toasts'), overlay: $('overlay'), ovTitle: $('ov-title'), ovBody: $('ov-body'), };
    this.warnKey = '';
    this.cv = $('hudc'); this.g = this.cv.getContext('2d'); phosphor(this.g); this.hudOn = false;
    const fit = () => { const d = 1; this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; this.dpr = d; };
    addEventListener('resize', fit); fit();
  }
  // radio caption (bottom-left); null clears. Auto-clears after the clip.
  caption(who, text, dur = 4) {
    const el = $('cap'); clearTimeout(this._capT);
    if (!who) { el.style.opacity = 0; return; }
    el.innerHTML = `<b>${who}</b> ${text}`; el.style.opacity = 1; this._capT = setTimeout(() => { el.style.opacity = 0; }, (dur + 0.6) * 1000);
  }
  show(on) { if (on !== this.hudOn) { this.hudOn = on; this.cv.style.display = on ? 'block' : 'none'; } }

  // USAF-style monochrome HUD: heading tape (top), airspeed tape (left), radar-altitude tape (right), countermeasure + status line (bottom)
  drawHUD(p, time, flags) {
    this._hf = (this._hf || 0) + 1; if (this._hf & 1) return;          // redraw at half frame rate: it is a big full-screen canvas
    const c = this.g, W = this.cv.width / this.dpr, H = this.cv.height / this.dpr, cx = W / 2, cy = H / 2;
    const G = U.green, A = U.amber, R = U.red, dim = tint(U.green, U.dimA);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.font = font('m'); c.lineWidth = U.line.thin; c.shadowBlur = U.glow;
    const blink = Math.floor(time * 4) % 2 === 0, txt = (t, x, y, col = G, al = 'center', f) => { c.fillStyle = col; c.textAlign = al; if (f) c.font = f; c.fillText(t, x, y); if (f) c.font = font('m'); };
    const line = (x1, y1, x2, y2, col = G) => { c.strokeStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };

    // ---- heading tape
    const hdg = ((p.heading * 180 / Math.PI) % 360 + 360) % 360, tw = 300, ty = 26, pxDeg = 4.2;
    c.save(); c.beginPath(); c.rect(cx - tw / 2, ty - 14, tw, 40); c.clip();
    for (let d = Math.floor((hdg - tw / 2 / pxDeg) / 5) * 5; d <= hdg + tw / 2 / pxDeg; d += 5) {
      const x = cx + (d - hdg) * pxDeg, dd = ((d % 360) + 360) % 360, major = dd % 10 === 0;
      line(x, ty + 12, x, ty + (major ? 3 : 7));
      if (major) { const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd]; txt(card || String(dd / 10).padStart(2, '0'), x, ty - 1, G, 'center'); }
    }
    c.restore(); line(cx - tw / 2, ty + 12, cx + tw / 2, ty + 12);
    c.beginPath(); c.moveTo(cx, ty + 14); c.lineTo(cx - 6, ty + 24); c.lineTo(cx + 6, ty + 24); c.closePath(); c.stroke();
    c.strokeRect(cx - 24, ty + 26, 48, 20); txt(String(Math.round(hdg) % 360).padStart(3, '0'), cx, ty + 41, G, 'center', font('l'));

    // ---- generic vertical tape
    const tape = (x, side, val, per, unit, label, marks) => {
      const h = 250, top = cy - h / 2, dir = side === 'l' ? -1 : 1;
      c.save(); c.beginPath(); c.rect(x - 70, top, 140, h); c.clip();
      const lo = val - h / 2 / per, hi = val + h / 2 / per;
      for (let v = Math.ceil(lo / unit) * unit; v <= hi; v += unit) {
        const y = cy - (v - val) * per, major = Math.round(v / unit) % 5 === 0;
        line(x, y, x + dir * (major ? 12 : 6), y);
        if (major) txt(String(Math.round(v)), x + dir * 16, y + 4, G, side === 'l' ? 'right' : 'left');
      }
      for (const m of marks) { const y = cy - (m.v - val) * per; if (y > top && y < top + h) { c.fillStyle = m.col; c.beginPath(); const s = side === 'l' ? 1 : -1; c.moveTo(x + s * 3, y); c.lineTo(x + s * 13, y - 5); c.lineTo(x + s * 13, y + 5); c.closePath(); c.fill(); } }
      c.restore(); line(x, top, x, top + h);
      // readout box
      const bx = side === 'l' ? x + 6 : x - 66; c.strokeStyle = G; c.strokeRect(bx, cy - 11, 60, 22);
      txt(String(Math.round(val)), bx + 30, cy + 6, G, 'center', font('l')); txt(label, x, top - 8, G, 'center');
    };
    const kt = p.kt, ft = Math.max(0, p.y * 3.281), aglFt = Math.max(0, p.agl * 3.281);
    tape(cx - 250, 'l', kt, 1.5, 10, 'CAS KT', [{ v: CFG.V_STALL * 4, col: R }, { v: (CFG.V_STALL + 11) * 4, col: A }]);
    tape(cx + 250, 'r', ft, 0.16, 100, 'ALT FT', []);
    txt('R ' + Math.round(aglFt), cx + 284, cy + 152, p.alt < CFG.ALT_LOW_WARN ? R : G, 'center');
    const mach = (p.v * 4 * 0.5144) / 340;
    txt('M ' + mach.toFixed(2), cx - 344, cy + 152, G, 'center'); txt('THR ' + Math.round(p.throttle * 100), cx - 344, cy + 170, G, 'center');
    // throttle bar
    c.strokeRect(cx - 296, cy + 140, 8, 32 + 0); c.fillStyle = G; c.fillRect(cx - 296, cy + 172 - 32 * p.throttle, 8, 32 * p.throttle);

    // ---- bottom line: countermeasures + master status
    const by = H - 34, low = p.flares <= 8;
    c.strokeStyle = low ? R : G; c.strokeRect(cx - 150, by - 20, 300, 34);
    txt('CMD FLR/CHF', cx - 92, by + 2, low ? R : G, 'center'); txt(String(p.flares).padStart(2, '0'), cx + 10, by + 4, low && blink ? A : (low ? R : G), 'center', font('xl'));
    c.strokeStyle = low ? R : G; c.strokeRect(cx + 50, by - 8, 88, 10); c.fillStyle = low ? R : G; c.fillRect(cx + 50, by - 8, 88 * p.flares / CFG.FLARES_MAX, 10);
    c.strokeStyle = flags.bombs ? G : R; c.strokeRect(cx - 262, by - 20, 104, 34);
    txt(flags.wpn, cx - 210, by - 5, flags.bombs ? G : R, 'center'); txt((flags.wpnLbl || 'BOMBS') + ' ' + flags.bombs, cx - 210, by + 10, flags.bombs ? G : R, 'center');
    if (flags.nvg) { c.strokeStyle = G; c.strokeRect(cx + 156, by - 20, 48, 34); txt('NVG', cx + 180, by + 3, G, 'center'); }
    // stealth state annunciators
    const ann = flags.ann || [['RADAR', flags.track, A], ['LOCK', flags.lock, R], ['MSL', flags.msl, R], ['STALL', p.stalled, R], ['BAY', flags.bay, A]];   // a mission may pass its own five
    ann.forEach(([t, on, col], i) => { const x = cx - 150 + i * 76; if (on && blink) { c.fillStyle = col; c.fillRect(x, by - 58, 70, 18); txt(t, x + 35, by - 45, U.ink, 'center'); } else { c.strokeStyle = on ? col : dim; c.strokeRect(x, by - 58, 70, 18); txt(t, x + 35, by - 45, on ? col : dim, 'center'); } });

    // ---- designated target marker (flags.mark): box + diamond on the target, or a caret at the screen edge pointing at it
    const S = flags.sight, mk = flags.mark, km = (d) => (d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m');
    if (mk) {
      const col = S && S.armed ? (S.inRange ? G : A) : dim;
      c.strokeStyle = col;
      if (mk.on) {
        c.strokeRect(mk.x - 14, mk.y - 14, 28, 28);
        c.beginPath(); c.moveTo(mk.x, mk.y - 6); c.lineTo(mk.x + 6, mk.y); c.lineTo(mk.x, mk.y + 6); c.lineTo(mk.x - 6, mk.y); c.closePath(); c.stroke();
        txt(mk.label, mk.x, mk.y - 20, col, 'center');
      } else {
        const ex = Math.min(W - 40, Math.max(40, mk.x)), ey = Math.min(H - 120, Math.max(90, mk.y));
        c.save(); c.translate(ex, ey); c.rotate(Math.atan2(mk.x - cx, -(mk.y - cy)));
        c.beginPath(); c.moveTo(0, -12); c.lineTo(9, 4); c.lineTo(-9, 4); c.closePath(); c.stroke(); c.restore();
        txt(`${mk.label} ${km(mk.dist)}`, ex, ey + 22, col, 'center');
      }
    }

    // ---- bombing reticle (flags.sight, from weapons.solution): flight-path marker fixed just ahead of the jet, steering line offset by the
    // cross-track miss (turn toward it), release cue sliding down it with time to release; release when the cue meets the marker.
    // Doors shut: dimmed steering line only. Out of the guidance envelope: amber. Past the release point: cue below the marker, red, flashing.
    if (S) {
      const fx0 = cx, fy0 = cy - CFG.RETICLE_FPM_UP, cueH = Math.min(CFG.RETICLE_CUE_PX, H * 0.2);
      const sx = fx0 + Math.max(-220, Math.min(220, S.cross * CFG.RETICLE_PX_PER_M)), steerOk = Math.abs(S.cross) <= S.lim.cross;
      const passed = S.tRel < 0, col = !S.armed ? dim : S.inRange ? G : A;
      c.strokeStyle = S.armed ? G : dim; c.beginPath(); c.arc(fx0, fy0, 7, 0, 7); c.stroke();
      line(fx0 - 22, fy0, fx0 - 7, fy0, S.armed ? G : dim); line(fx0 + 7, fy0, fx0 + 22, fy0, S.armed ? G : dim); line(fx0, fy0 - 7, fx0, fy0 - 14, S.armed ? G : dim);
      line(sx, fy0 - cueH - 14, sx, fy0 + 36, !S.armed ? dim : steerOk ? G : A);
      const head = `${CFG.TARGET_TYPES[S.type].label}  ${km(S.dist)}`;
      if (S.armed) {
        const yc = fy0 - Math.max(-0.25, Math.min(1, S.tRel / CFG.RETICLE_CUE_TIME)) * cueH;
        if (!passed || blink) { c.lineWidth = U.line.heavy; line(sx - 26, yc, sx + 26, yc, passed ? R : col); c.lineWidth = U.line.thin; }
        txt(`${head}   REL ${passed ? 'PASSED' : S.tRel.toFixed(1) + ' s'}   ${S.inRange ? 'IN RNG' : 'OUT OF RNG'}${S.auto ? '   AUTO REL' : ''}`, fx0, fy0 - cueH - 26, passed ? R : col, 'center');
      } else txt(`${head}   BAY SHUT`, fx0, fy0 - cueH - 26, dim, 'center');
    }
  }
  score(s, passed) { this.el.score.textContent = String(s).padStart(6, '0'); this.el.passed.textContent = passed; }
  gauges(p) {
    const key = `${p.throttle.toFixed(2)}|${p.kt}|${p.stalled}|${p.v < CFG.V_STALL + 11}|${Math.round(p.alt)}|${p.flares}`;   // skip the DOM writes (style recalcs) when nothing visible changed
    if (key === this._gk) return; this._gk = key;
    this.el.thr.style.height = (p.throttle * 100).toFixed(0) + '%';
    this.el.thrv.textContent = Math.round(p.throttle * 100) + '%';
    this.el.spd.textContent = p.kt;
    this.el.spd.className = p.stalled || p.v < CFG.V_STALL + 11 ? 'bad' : '';
    this.el.alt.textContent = Math.round(p.alt);
    this.el.alt.className = p.alt < CFG.ALT_LOW_WARN ? 'bad' : '';
    this.el.flares.textContent = p.flares;
    this.el.flareBar.style.width = (p.flares / CFG.FLARES_MAX * 100).toFixed(0) + '%';
    this.el.flareBox.className = p.flares <= 8 ? 'bad' : '';
  }
  // objective arrow (rel = bearing to the waypoint / target relative to the nose, rad), distance readout, label
  wpt(rel, dist, label, undetected) {
    this.el.wptArrow.style.transform = `rotate(${(rel * 180 / Math.PI).toFixed(1)}deg)`;
    this.el.wptTxt.textContent = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
    this.el.wptSub.textContent = `${label}${undetected ? '  ·  UNDETECTED +' + CFG.SCORE_UNDETECTED : ''}`;
  }
  // seeker feedback for the most dangerous missile (undefined = hide)
  seeker(m) {
    const e = this.el;
    if (!m) { e.sk.style.display = 'none'; return; }
    e.sk.style.display = 'block';
    const inS = m.dPlayer < CFG.SEEKER_RANGE, q = m.q;
    let title, cls;
    if (m.mode === 'decoy') { title = 'SEEKER SEDUCED BY DECOY'; cls = 'good'; }
    else if (m.mode === 'lost') { title = m.beaming ? 'TRACK BROKEN — KEEP BEAMING' : 'TRACK BROKEN — MAY REACQUIRE'; cls = 'warn'; }
    else if (!inS) { title = 'MISSILE ON DATALINK'; cls = 'dim'; }
    else if (m.depth > 0) { title = 'NOTCHING — HOLD BEAM'; cls = 'notch'; }
    else { title = 'SEEKER TRACKING'; cls = 'lock'; }
    e.sk.className = cls;
    e.skTitle.textContent = title + (inS ? `  ${Math.round(q * 100)}%` : '');
    e.skFill.style.width = (q * 100).toFixed(0) + '%';
    const gate = m.gateN ? `  ·  DECOYS ${Math.min(m.gateN, CFG.FLARE_GATE_SAT)}/${CFG.FLARE_GATE_SAT}` : '';
    e.skLine.textContent = `MSL ${Math.round(m.speed)} m/s ${m.burning ? 'MOTOR' : 'COASTING'}  ·  BEAM ${inS ? Math.round(Math.abs(m.vr ?? 0)) : '--'}/${CFG.NOTCH_GATE_VR} m/s${gate}`;
  }
  // warnings: list of {text, cls}
  warnings(list) {
    const key = list.map((w) => w.text + w.cls).join('|');
    if (key === this.warnKey) return; this.warnKey = key;
    this.el.warn.innerHTML = list.map((w) => `<div class="${w.cls}">${w.text}</div>`).join('');
  }
  toast(text, cls = '') {
    const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text;
    this.el.toasts.appendChild(d); setTimeout(() => d.remove(), 2600);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }
  overlay(show, title = '', body = '') { this.el.overlay.style.display = show ? 'flex' : 'none'; this.el.ovTitle.textContent = title; this.el.ovBody.innerHTML = body; }
}
