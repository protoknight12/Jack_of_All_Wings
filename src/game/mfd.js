// The top-right MFD: north-up radar scope with SAM symbols, detection rings, waypoint / target symbols, missiles (with track quality) and decoys.
import { CFG } from './config.js';
import { U, font, tint, phosphor } from './ui.js';

const SIZE = 300;

export class MFD {
  constructor(canvas) {
    this.cv = canvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = canvas.height = SIZE * dpr;
    canvas.style.width = canvas.style.height = SIZE + 'px';
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(dpr, dpr); phosphor(this.ctx);
    this.rangeIdx = 1;
  }
  get range() { return CFG.MFD_RANGES[this.rangeIdx]; }
  cycle(d) { this.rangeIdx = Math.min(CFG.MFD_RANGES.length - 1, Math.max(0, this.rangeIdx + d)); }

  draw(s) {
    const c = this.ctx, R = SIZE / 2 - 14, cx = SIZE / 2, cy = SIZE / 2, k = R / this.range;
    const { player, sites, missiles, flares, time, wp, wpNext, wpN, targets, sel, aim } = s;
    const blink = Math.floor(time * 6) % 2 === 0;
    const threat = missiles.some((m) => m.mode !== 'lost');
    const P = (x, z) => [cx + (x - player.x) * k, cy + (z - player.z) * k];

    c.clearRect(0, 0, SIZE, SIZE);
    c.save();
    c.shadowBlur = 0; c.fillStyle = U.scope; c.fillRect(0, 0, SIZE, SIZE); c.shadowBlur = U.glow;
    c.beginPath(); c.rect(2, 2, SIZE - 4, SIZE - 4); c.clip();

    // grid + range rings
    c.strokeStyle = tint(U.green, U.faintA); c.lineWidth = U.line.hair;
    for (const f of [0.25, 0.5, 0.75, 1]) { c.beginPath(); c.arc(cx, cy, R * f, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
    c.fillStyle = tint(U.green, U.softA); c.font = font('s'); c.textAlign = 'center';
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
      c.setLineDash([5, 5]); c.strokeStyle = tint(U.red, U.dimA); c.lineWidth = U.line.hair;
      c.beginPath(); c.arc(x, y, st.range * k, 0, 7); c.stroke(); c.setLineDash([]);
      c.strokeStyle = lock > 0 ? (blink && lock > 0.6 ? U.amber : U.red) : U.red;
      c.lineWidth = lock > 0 ? U.line.bold : U.line.thin;
      c.beginPath(); c.arc(x, y, st.effRange * k, 0, 7); c.stroke();
      c.fillStyle = tint(U.red, 0.07); c.fill();
      this.diamond(c, x, y, 8, st.flash > 0 ? '#fff' : U.red, true);
      if (lock > 0) {
        c.strokeStyle = lock >= 1 ? U.red : U.amber; c.lineWidth = U.line.heavy;
        c.beginPath(); c.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + lock * Math.PI * 2); c.stroke();
      }
    }

    // waypoints: dashed course line, next one dim, active one as a gold crosshair ring (arrow + distance at the edge when off-scope)
    if (wp) {
      const [wx, wy] = P(wp.x, wp.z);
      c.setLineDash([2, 6]); c.strokeStyle = tint(U.gold, U.dimA); c.lineWidth = U.line.hair;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(wx, wy); c.stroke(); c.setLineDash([]);
      if (wpNext) { const [nx, ny] = P(wpNext.x, wpNext.z); this.waypoint(c, nx, ny, tint(U.gold, U.dimA), false); }
      const m0 = 14, off = wx < m0 || wx > SIZE - m0 || wy < m0 || wy > SIZE - m0;
      if (!off) this.waypoint(c, wx, wy, blink ? U.gold : U.hot, true, wpN);
      else {
        this.edge(c, wx, wy, cx, cy, U.gold);
      }
    }

    // targets (current leg, alive): amber square with a type letter; dashed line + edge arrow toward the nearest
    if (targets && targets.length) {
      let near = sel || null, nd = sel ? -1 : Infinity;    // the designated target, else the nearest
      for (const t of targets) {
        const d = Math.hypot(t.x - player.x, t.z - player.z); if (d < nd) { nd = d; near = t; }
        const [x, y] = P(t.x, t.z);
        if (x > 0 && x < SIZE && y > 0 && y < SIZE) this.target(c, x, y, CFG.TARGET_TYPES[t.type]?.sym || '?', t === near && blink);
      }
      const [nx, ny] = P(near.x, near.z);
      c.setLineDash([2, 6]); c.strokeStyle = tint(U.amber, U.dimA); c.lineWidth = U.line.hair;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(nx, ny); c.stroke(); c.setLineDash([]);
      if (nx < 14 || nx > SIZE - 14 || ny < 14 || ny > SIZE - 14) this.edge(c, nx, ny, cx, cy, U.amber);
    }

    // bomb impact point (unguided release now): cross + kill radius vs the designated target
    if (aim) {
      const [ax, ay] = P(aim.x, aim.z);
      c.strokeStyle = tint(U.amber, U.dimA); c.lineWidth = U.line.hair; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(cx, cy); c.lineTo(ax, ay); c.stroke();
      c.strokeStyle = U.amber; c.lineWidth = U.line.thin; c.setLineDash([3, 3]); c.beginPath(); c.arc(ax, ay, Math.max(3, aim.r * k), 0, 7); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(ax - 5, ay); c.lineTo(ax + 5, ay); c.moveTo(ax, ay - 5); c.lineTo(ax, ay + 5); c.stroke();
    }

    // designated target: solid box around it
    if (sel) { const [x, y] = P(sel.x, sel.z); if (x > 0 && x < SIZE && y > 0 && y < SIZE) { c.setLineDash([]); c.strokeStyle = U.amber; c.lineWidth = U.line.thin; c.strokeRect(x - 10, y - 10, 20, 20); } }

    // decoys: flares orange, chaff as a faint white haze
    for (const f of flares) {
      const [x, y] = P(f.x, f.z);
      if (f.kind === 'chaff') { c.fillStyle = 'rgba(220,235,255,0.35)'; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); }
      else { c.fillStyle = U.amber; c.beginPath(); c.arc(x, y, 2.2, 0, 7); c.fill(); }
    }

    // missiles: bright while the motor burns, dim once coasting; ring = track quality inside seeker range
    for (const m of missiles) {
      let [x, y] = P(m.x, m.z);
      const live = m.mode !== 'lost';
      const col = m.mode === 'decoy' ? U.green : !live ? U.grey : m.burning ? U.red : tint(U.red, 0.6);
      if (live && blink) {                                   // dotted heading line
        c.setLineDash([3, 4]); c.strokeStyle = col; c.lineWidth = U.line.thin;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + m.fx * this.range * 0.32 * k, y + m.fz * this.range * 0.32 * k); c.stroke(); c.setLineDash([]);
      }
      let off = false;
      const m0 = 10;
      if (x < m0 || x > SIZE - m0 || y < m0 || y > SIZE - m0) { off = true; x = Math.min(SIZE - m0, Math.max(m0, x)); y = Math.min(SIZE - m0, Math.max(m0, y)); }
      c.save(); c.translate(x, y); c.rotate(m.heading); c.fillStyle = col;
      c.beginPath(); c.moveTo(0, -7); c.lineTo(4.5, 6); c.lineTo(-4.5, 6); c.closePath(); c.fill();
      if (m.burning && live) { c.fillStyle = U.hot; c.beginPath(); c.arc(0, 8, 2.4, 0, 7); c.fill(); }
      if (off) { c.strokeStyle = '#fff'; c.lineWidth = U.line.thin; c.stroke(); }
      c.restore();
      if (m.dPlayer < CFG.SEEKER_RANGE && m.mode !== 'decoy') {
        c.strokeStyle = m.depth > 0 ? U.cyan : live ? U.red : U.grey; c.lineWidth = U.line.heavy;
        c.beginPath(); c.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + Math.max(0.02, m.q) * Math.PI * 2); c.stroke();
        c.fillStyle = c.strokeStyle; c.font = font('s'); c.textAlign = 'left';
        c.fillText(`${Math.round(m.q * 100)}%`, x + 15, y + 3);
      }
    }

    // player: arrow, north-up, rotated to heading
    c.save(); c.translate(cx, cy); c.rotate(player.heading);
    c.fillStyle = U.cyan; c.strokeStyle = '#0b2a35'; c.lineWidth = U.line.thin;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();

    c.restore();
    // frame (flashes red when a missile is inbound)
    c.lineWidth = U.line.heavy; c.strokeStyle = threat && blink ? U.red : tint(U.green, U.softA);
    c.strokeRect(1.5, 1.5, SIZE - 3, SIZE - 3);
  }

  // waypoint symbol: ring with crosshair ticks (and its number when active)
  waypoint(c, x, y, col, active, n) {
    c.strokeStyle = col; c.lineWidth = active ? U.line.bold : U.line.thin;
    c.beginPath(); c.arc(x, y, active ? 8 : 5, 0, 7); c.stroke();
    if (active) {
      c.beginPath(); for (const [ax, ay] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { c.moveTo(x + ax * 8, y + ay * 8); c.lineTo(x + ax * 14, y + ay * 14); } c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill();
      c.font = font('s'); c.textAlign = 'left'; c.fillText(String(n), x + 12, y - 10);
    }
  }

  // edge-of-scope arrow toward an off-scope point (wx, wy)
  edge(c, wx, wy, cx, cy, col) {
    const m0 = 14, ex = Math.min(SIZE - m0, Math.max(m0, wx)), ey = Math.min(SIZE - m0, Math.max(m0, wy));
    c.save(); c.translate(ex, ey); c.rotate(Math.atan2(wx - cx, -(wy - cy)));
    c.fillStyle = col; c.beginPath(); c.moveTo(0, -9); c.lineTo(7, 6); c.lineTo(0, 2); c.lineTo(-7, 6); c.closePath(); c.fill(); c.restore();
  }

  // ground target: amber square with its type letter (nearest one blinks)
  target(c, x, y, sym, hot) {
    c.strokeStyle = hot ? U.hot : U.amber; c.lineWidth = U.line.thin; c.strokeRect(x - 5.5, y - 5.5, 11, 11);
    c.fillStyle = c.strokeStyle; c.font = font('s'); c.textAlign = 'center'; c.fillText(sym, x, y + 3.2);
  }

  // NATO-style hostile ground symbol (diamond) with a small SAM dome
  diamond(c, x, y, r, col, dome) {
    c.strokeStyle = col; c.lineWidth = U.line.bold;
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.stroke();
    if (dome) { c.beginPath(); c.arc(x, y + 3, 4, Math.PI, 0); c.stroke(); }
  }
}
