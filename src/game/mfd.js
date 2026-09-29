// The top-right MFD: north-up radar scope with SAM symbols, detection rings, waypoint, missiles (with track quality) and decoys.
import { CFG } from './config.js';

const SIZE = 300;

export class MFD {
  constructor(canvas) {
    this.cv = canvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = canvas.height = SIZE * dpr;
    canvas.style.width = canvas.style.height = SIZE + 'px';
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.rangeIdx = 1;
  }
  get range() { return CFG.MFD_RANGES[this.rangeIdx]; }
  cycle(d) { this.rangeIdx = Math.min(CFG.MFD_RANGES.length - 1, Math.max(0, this.rangeIdx + d)); }

  draw(s) {
    const c = this.ctx, R = SIZE / 2 - 14, cx = SIZE / 2, cy = SIZE / 2, k = R / this.range;
    const { player, sites, missiles, flares, time, wp, wpNext, wpN } = s;
    const blink = Math.floor(time * 6) % 2 === 0;
    const threat = missiles.some((m) => m.mode !== 'lost');
    const P = (x, z) => [cx + (x - player.x) * k, cy + (z - player.z) * k];

    c.clearRect(0, 0, SIZE, SIZE);
    c.save();
    c.fillStyle = 'rgba(4,16,10,0.88)'; c.fillRect(0, 0, SIZE, SIZE);
    c.beginPath(); c.rect(2, 2, SIZE - 4, SIZE - 4); c.clip();

    // grid + range rings
    c.strokeStyle = 'rgba(70,255,140,0.22)'; c.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75, 1]) { c.beginPath(); c.arc(cx, cy, R * f, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
    c.fillStyle = 'rgba(70,255,140,0.75)'; c.font = '11px ui-monospace, Consolas, monospace'; c.textAlign = 'center';
    c.fillText('N', cx, 13);
    c.textAlign = 'left'; c.fillText(`RNG ${(this.range / 1000).toFixed(1)}km`, 8, SIZE - 8);
    c.textAlign = 'right'; c.fillText(`HDG ${String(Math.round(((player.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}`, SIZE - 8, SIZE - 8);

    // SAM sites
    for (const st of sites) {
      const [x, y] = P(st.x, st.z);
      const reach = Math.max(st.range, st.effRange) * k + 40;
      if (x < -reach || x > SIZE + reach || y < -reach || y > SIZE + reach) continue;
      const lock = st.lock;
      // nominal (broadside) range: dashed; current effective range vs your aspect: solid
      c.setLineDash([5, 5]); c.strokeStyle = 'rgba(255,70,60,0.4)'; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, st.range * k, 0, 7); c.stroke(); c.setLineDash([]);
      c.strokeStyle = lock > 0 ? (blink && lock > 0.6 ? '#ffb020' : '#ff5a3c') : 'rgba(255,60,50,0.9)';
      c.lineWidth = lock > 0 ? 2 : 1.4;
      c.beginPath(); c.arc(x, y, st.effRange * k, 0, 7); c.stroke();
      c.fillStyle = 'rgba(255,50,40,0.07)'; c.fill();
      this.diamond(c, x, y, 8, st.flash > 0 ? '#ffffff' : '#ff3b30', true);
      if (lock > 0) {
        c.strokeStyle = lock >= 1 ? '#ff2a2a' : '#ffb020'; c.lineWidth = 3;
        c.beginPath(); c.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + lock * Math.PI * 2); c.stroke();
      }
    }

    // waypoints: dashed course line, next one dim, active one as a gold crosshair ring (arrow + distance at the edge when off-scope)
    if (wp) {
      const [wx, wy] = P(wp.x, wp.z);
      c.setLineDash([2, 6]); c.strokeStyle = 'rgba(255,210,58,0.45)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(wx, wy); c.stroke(); c.setLineDash([]);
      if (wpNext) { const [nx, ny] = P(wpNext.x, wpNext.z); this.waypoint(c, nx, ny, 'rgba(255,210,58,0.4)', false); }
      const m0 = 14, off = wx < m0 || wx > SIZE - m0 || wy < m0 || wy > SIZE - m0;
      if (!off) this.waypoint(c, wx, wy, blink ? '#ffd23a' : '#ffe98a', true, wpN);
      else {
        const ex = Math.min(SIZE - m0, Math.max(m0, wx)), ey = Math.min(SIZE - m0, Math.max(m0, wy));
        c.save(); c.translate(ex, ey); c.rotate(Math.atan2(wx - cx, -(wy - cy)));
        c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 6); c.lineTo(0, 2); c.lineTo(-7, 6); c.closePath(); c.fill(); c.restore();
      }
    }

    // decoys: flares orange, chaff as a faint white haze
    for (const f of flares) {
      const [x, y] = P(f.x, f.z);
      if (f.kind === 'chaff') { c.fillStyle = 'rgba(220,235,255,0.35)'; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); }
      else { c.fillStyle = '#ffa030'; c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); }
    }

    // missiles: bright while the motor burns, dim once coasting; ring = track quality inside seeker range
    for (const m of missiles) {
      let [x, y] = P(m.x, m.z);
      const live = m.mode !== 'lost';
      const col = m.mode === 'decoy' ? '#7dffb0' : !live ? '#8a8a8a' : m.burning ? '#ff2a2a' : '#c9705a';
      if (live && blink) {                                   // dotted heading line
        c.setLineDash([3, 4]); c.strokeStyle = col; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + m.fx * this.range * 0.32 * k, y + m.fz * this.range * 0.32 * k); c.stroke(); c.setLineDash([]);
      }
      let off = false;
      const m0 = 10;
      if (x < m0 || x > SIZE - m0 || y < m0 || y > SIZE - m0) { off = true; x = Math.min(SIZE - m0, Math.max(m0, x)); y = Math.min(SIZE - m0, Math.max(m0, y)); }
      c.save(); c.translate(x, y); c.rotate(m.heading); c.fillStyle = col;
      c.beginPath(); c.moveTo(0, -7); c.lineTo(4.5, 6); c.lineTo(-4.5, 6); c.closePath(); c.fill();
      if (m.burning && live) { c.fillStyle = '#ffe9a0'; c.beginPath(); c.arc(0, 8, 2.4, 0, 7); c.fill(); }
      if (off) { c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke(); }
      c.restore();
      if (m.dPlayer < CFG.SEEKER_RANGE && m.mode !== 'decoy') {
        c.strokeStyle = m.depth > 0 ? '#39d0ff' : live ? '#ff5a3c' : '#a0a0a0'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + Math.max(0.02, m.q) * Math.PI * 2); c.stroke();
        c.fillStyle = c.strokeStyle; c.font = '10px ui-monospace, Consolas, monospace'; c.textAlign = 'left';
        c.fillText(`${Math.round(m.q * 100)}%`, x + 15, y + 3);
      }
    }

    // player: arrow, north-up, rotated to heading
    c.save(); c.translate(cx, cy); c.rotate(player.heading);
    c.fillStyle = '#39d0ff'; c.strokeStyle = '#0b2a35'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();

    c.restore();
    // frame (flashes red when a missile is inbound)
    c.lineWidth = 3; c.strokeStyle = threat && blink ? '#ff2a2a' : 'rgba(90,255,150,0.55)';
    c.strokeRect(1.5, 1.5, SIZE - 3, SIZE - 3);
  }

  // waypoint symbol: ring with crosshair ticks (and its number when active)
  waypoint(c, x, y, col, active, n) {
    c.strokeStyle = col; c.lineWidth = active ? 2 : 1.4;
    c.beginPath(); c.arc(x, y, active ? 8 : 5, 0, 7); c.stroke();
    if (active) {
      c.beginPath(); for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { c.moveTo(x + ax * 8, y + ay * 8); c.lineTo(x + ax * 14, y + ay * 14); } c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill();
      c.font = '10px ui-monospace, Consolas, monospace'; c.textAlign = 'left'; c.fillText(String(n), x + 12, y - 10);
    }
  }

  // NATO-style hostile ground symbol (diamond) with a small SAM dome
  diamond(c, x, y, r, col, dome) {
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.stroke();
    if (dome) { c.beginPath(); c.arc(x, y + 3, 4, Math.PI, 0); c.stroke(); }
  }
}
