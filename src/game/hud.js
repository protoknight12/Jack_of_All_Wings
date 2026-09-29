// DOM HUD (score, waypoint arrow, throttle/speed/alt/flares, seeker feedback, warnings, toasts) .
import { CFG } from './config.js';
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = { score: $('score-val'), passed: $('passed-val'), thr: $('thr-fill'), thrv: $('thr-val'), spd: $('spd'), alt: $('alt'), flares: $('flares'), flareBar: $('flare-bar'), flareBox: $('flare-box'),
      sk: $('seeker'), skTitle: $('sk-title'), skFill: $('sk-fill'), skLine: $('sk-line'), wptArrow: $('wpt-arrow'), wptTxt: $('wpt-txt'), wptSub: $('wpt-sub'),
      warn: $('warn'), toasts: $('toasts'), overlay: $('overlay'), ovTitle: $('ov-title'), ovBody: $('ov-body'), };
    this.warnKey = '';
    this.cv = $('hudc'); this.g = this.cv.getContext('2d'); this.hudOn = false;
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
    const G = '#58ff9a', A = '#ffb020', R = '#ff4a3d';
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.font = '13px ui-monospace, Consolas, monospace'; c.lineWidth = 1.4;
    const blink = Math.floor(time * 4) % 2 === 0, txt = (t, x, y, col = G, al = 'center', f) => { c.fillStyle = col; c.textAlign = al; if (f) c.font = f; c.fillText(t, x, y); if (f) c.font = '13px ui-monospace, Consolas, monospace'; };
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
    c.strokeRect(cx - 24, ty + 26, 48, 20); txt(String(Math.round(hdg) % 360).padStart(3, '0'), cx, ty + 41, G, 'center', '16px ui-monospace, Consolas, monospace');

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
      txt(String(Math.round(val)), bx + 30, cy + 6, G, 'center', '16px ui-monospace, Consolas, monospace'); txt(label, x, top - 8, G, 'center');
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
    txt('CMD FLR/CHF', cx - 92, by + 2, low ? R : G, 'center'); txt(String(p.flares).padStart(2, '0'), cx + 10, by + 4, low && blink ? A : (low ? R : G), 'center', '22px ui-monospace, Consolas, monospace');
    c.strokeStyle = low ? R : G; c.strokeRect(cx + 50, by - 8, 88, 10); c.fillStyle = low ? R : G; c.fillRect(cx + 50, by - 8, 88 * p.flares / CFG.FLARES_MAX, 10);
    if (flags.nvg) { c.strokeStyle = G; c.strokeRect(cx + 156, by - 20, 48, 34); txt('NVG', cx + 180, by + 3, G, 'center'); }
    // stealth state annunciators
    const ann = [['RADAR', flags.track, A], ['LOCK', flags.lock, R], ['MSL', flags.msl, R], ['STALL', p.stalled, R]];
    ann.forEach(([t, on, col], i) => { const x = cx - 150 + i * 76; if (on && blink) { c.fillStyle = col; c.fillRect(x, by - 58, 70, 18); txt(t, x + 35, by - 45, '#0a120c', 'center'); } else { c.strokeStyle = on ? col : 'rgba(88,255,154,.35)'; c.strokeRect(x, by - 58, 70, 18); txt(t, x + 35, by - 45, on ? col : 'rgba(88,255,154,.35)', 'center'); } });
  }
  score(s, passed) { this.el.score.textContent = String(s).padStart(6, '0'); this.el.passed.textContent = passed; }
  gauges(p) {
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
  // waypoint arrow (rel = bearing to the waypoint relative to the nose, rad), distance readout
  wpt(rel, dist, n, undetected) {
    this.el.wptArrow.style.transform = `rotate(${(rel * 180 / Math.PI).toFixed(1)}deg)`;
    this.el.wptTxt.textContent = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
    this.el.wptSub.textContent = `WPT ${n}${undetected ? '  ·  UNDETECTED +' + CFG.SCORE_UNDETECTED : ''}`;
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
