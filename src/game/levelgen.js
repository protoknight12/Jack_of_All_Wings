// Deterministic level: waypoints and SAM batteries are generated together, one leg at a time.
// Layout rules (see genSites):
//  - one battery per site; sites never bunch (at most a mutual-support pair inside NEIGHBOR_R)
//  - every leg has a narrow "safe lane" weaving from waypoint to waypoint. No site ever covers it (its full broadside
//    range + a small margin stays clear), so a route that is never tracked always exists, but only just:
//    batteries are deliberately placed hugging both edges of the lane, so the gap is tight, winding and hard to fly
//  - the straight line to the waypoint is always blocked by batteries on the axis, and the waypoint is ringed by more
//  - the rest of the field is filled with spread-out batteries, preferring high ground
import { CFG } from './config.js';
import { terrainH, terrainSlope } from './terrain.js';

export function rng(seed) {                                   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export class Level {
  constructor(seed) {
    this.seed = (seed || 1) >>> 0;
    this.wps = [{ x: 0, z: 0 }];       // wps[n] = waypoint n (0 = start)
    this.legs = [];                    // legs[n-1] = leg ending at waypoint n
    this.sites = [];                   // site descriptors, all generated legs
    this.sitesDone = 0;                // sites generated for legs 1..sitesDone
    this.targets = [];                 // ground targets {key, leg, type, x, z, alive}; leg n's cluster sits at wps[n]
    this.targetsDone = 0;
  }

  ramp(n) { return clamp((n - 1) / CFG.RAMP_LEGS, 0, 1); }
  rangeK(n) { return 1 + Math.min(CFG.RANGE_RAMP_MAX, CFG.RANGE_RAMP_PER_WP * (n - 1)); }

  // leg n runs wps[n-1] -> wps[n]; also builds its safe lane
  genLeg(n) {
    const r = rng(this.seed * 7919 + n * 104729 + 17), t = this.ramp(n), p0 = this.wps[n - 1];
    const prev = n > 1 ? this.legs[n - 2] : { ang: 0 };
    const ang = clamp(prev.ang + (r() * 2 - 1) * CFG.WP_TURN_STEP, -CFG.WP_MAX_OFFSET, CFG.WP_MAX_OFFSET);
    const dx = Math.sin(ang), dz = -Math.cos(ang), rx = -dz, rz = dx;
    const len = lerp(CFG.LEG_LEN[0], CFG.LEG_LEN[1], r());
    const p1 = { x: p0.x + dx * len, z: p0.z + dz * len };
    const margin = lerp(CFG.LANE_MARGIN[0], CFG.LANE_MARGIN[1], t);
    // lane: control points every LANE_STEP along the axis with a random-walk sideways offset,
    // pinched to zero at both ends so it starts at p0 and finishes exactly on the waypoint
    const amp = lerp(CFG.LANE_WEAVE[0], CFG.LANE_WEAVE[1], r());
    const steps = Math.max(3, Math.round(len / CFG.LANE_STEP));
    const lane = [p0], side = r() < 0.5 ? -1 : 1; let off = side * amp * 0.5;
    for (let i = 1; i < steps; i++) {
      off = clamp(off + (r() * 2 - 1) * CFG.LANE_SWING, -amp, amp);
      const s = (i / steps) * len, env = Math.min(1, Math.sin((i / steps) * Math.PI) * 1.8);
      // through the middle of the leg the lane must really leave the axis (so the straight line can be blocked)
      const o = env > 0.85 ? side * Math.max(side * off, CFG.LANE_DETOUR_MIN) : off;
      lane.push({ x: p0.x + dx * s + rx * o * env, z: p0.z + dz * s + rz * o * env });
    }
    lane.push(p1);
    this.wps[n] = p1;
    this.legs[n - 1] = { n, ang, dx, dz, rx, rz, p0, p1, len, lane, margin };
  }
  ensureLegs(n) { while (this.legs.length < n) this.genLeg(this.legs.length + 1); }

  laneClear(x, z, range, n) {                  // distance to any lane of legs n-1..n+1, minus range and margin
    let worst = Infinity;
    for (let k = Math.max(1, n - 1); k <= Math.min(this.legs.length, n + 1); k++) {
      const L = this.legs[k - 1], lane = L.lane;
      for (let i = 0; i < lane.length - 1; i++) worst = Math.min(worst, distToSeg(x, z, lane[i].x, lane[i].z, lane[i + 1].x, lane[i + 1].z) - range - L.margin);
    }
    return worst;
  }

  // may a battery go here? spacing rules + lane + start area
  canPlace(x, z, range, n, R) {
    if (Math.hypot(x, z) < CFG.SAFE_START_RADIUS) return false;
    if (terrainH(x, z) < CFG.WATER_Y + 1 || terrainSlope(x, z, 20) > 0.2) return false;   // no batteries in lakes or on steep slopes
    if (this.laneClear(x, z, range, n) < 0) return false;
    const near = [];
    for (const s of this.sites) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < CFG.SITE_MIN_SEP) return false;
      if (d < R) near.push(s);
    }
    if (near.length > CFG.NEIGHBOR_MAX) return false;
    for (const s of near) {                     // a neighbour that already has a partner would become a trio
      let c = 0; for (const o of this.sites) if (o !== s && Math.hypot(o.x - s.x, o.z - s.z) < R) c++;
      if (c + 1 > CFG.NEIGHBOR_MAX) return false;
    }
    return true;
  }

  genSites(n) {
    this.ensureLegs(n + 1);
    const L = this.legs[n - 1], r = rng(this.seed * 15485863 + n * 32452843 + 5), t = this.ramp(n), rk = this.rangeK(n);
    const R = lerp(CFG.NEIGHBOR_R[0], CFG.NEIGHBOR_R[1], t);
    const ammo = Math.min(CFG.AMMO_MAX, CFG.AMMO_BASE + Math.floor((n - 1) / CFG.AMMO_EVERY));
    let id = 0;
    const newRange = () => lerp(CFG.SAM_RANGE[0], CFG.SAM_RANGE[1], r()) * rk;
    const add = (x, z, range, role) => { this.sites.push({ key: `${n}:${id++}`, leg: n, x, z, range, ammo, maxAmmo: ammo, yaw: r() * Math.PI * 2, role }); };
    const tryAdd = (x, z, range, role) => { if (this.canPlace(x, z, range, n, R)) { add(x, z, range, role); return true; } return false; };

    // Strategic placement: greedy weighted coverage. Cells near the safe lane, near the straight line and near the waypoint are
    // worth the most; a cell already covered by one battery still has value (layered defence: whoever slips past the first radar
    // meets the second), a cell covered twice has none. Every pick is the spot that would hurt a pilot the most.
    const count = Math.max(2, Math.round(lerp(CFG.SITES_LEG[0], CFG.SITES_LEG[1], t)));
    const CS = CFG.STRAT_CELL, K = CFG.STRAT_COVER_K, lane = L.lane, cells = [];
    const laneDist = (x, z) => { let d = Infinity; for (let i = 0; i < lane.length - 1; i++) d = Math.min(d, distToSeg(x, z, lane[i].x, lane[i].z, lane[i + 1].x, lane[i + 1].z)); return d; };
    for (let ax = -CFG.FIELD_END * 0.6; ax <= L.len + CFG.FIELD_END * 0.6; ax += CS) for (let lat = -CFG.STRAT_HALF_WIDTH; lat <= CFG.STRAT_HALF_WIDTH; lat += CS) {
      const x = L.p0.x + L.dx * ax + L.rx * lat, z = L.p0.z + L.dz * ax + L.rz * lat, dl = laneDist(x, z);
      if (dl < L.margin || Math.hypot(x, z) < CFG.SAFE_START_RADIUS * 0.8) continue;
      const w = 1 + 4.5 * Math.exp(-dl / 450) + 1.5 * Math.exp(-Math.abs(lat) / 800) + 2.5 * Math.exp(-Math.hypot(x - L.p1.x, z - L.p1.z) / 1000);
      let cnt = 0; for (const o of this.sites) if (Math.hypot(o.x - x, o.z - z) < o.range * K) cnt++;
      cells.push({ x, z, w, cnt });
    }
    const score = (c) => { const rc = c.range * K, r2 = rc * rc; let sc = 0; for (const q of cells) { const dx = q.x - c.x, dz = q.z - c.z; if (dx * dx + dz * dz < r2) sc += q.cnt === 0 ? q.w : q.cnt === 1 ? q.w * CFG.STRAT_LAYER : 0; } return sc; };
    const commit = (c, role) => { add(c.x, c.z, c.range, role); const rc = c.range * K, r2 = rc * rc; for (const q of cells) { const dx = q.x - c.x, dz = q.z - c.z; if (dx * dx + dz * dz < r2) q.cnt++; } };

    // waypoint defence first: the last approach is always guarded
    const ringN = Math.round(lerp(CFG.WP_RING_N[0], CFG.WP_RING_N[1], t)), a0 = r() * Math.PI * 2;
    let placed = 0;
    for (let i = 0; i < ringN * 4 && placed < ringN; i++) {
      const a = a0 + (placed / ringN) * Math.PI * 2 + (r() - 0.5) * 0.9, rad = lerp(CFG.WP_RING_R[0], CFG.WP_RING_R[1], r()), range = newRange();
      const x = L.p1.x + Math.cos(a) * rad, z = L.p1.z + Math.sin(a) * rad;
      if (this.canPlace(x, z, range, n, R)) { commit({ x, z, range }, 'point'); placed++; }
    }
    // greedy picks
    const ls = []; { let acc = 0; for (let i = 0; i < lane.length - 1; i++) { const sl = Math.hypot(lane[i + 1].x - lane[i].x, lane[i + 1].z - lane[i].z); for (let d = 0; d < sl; d += CFG.STRAT_LANE_STEP) ls.push({ x: lane[i].x + (lane[i + 1].x - lane[i].x) * d / sl, z: lane[i].z + (lane[i + 1].z - lane[i].z) * d / sl, ux: (lane[i + 1].x - lane[i].x) / sl, uz: (lane[i + 1].z - lane[i].z) / sl }); } }
    while (placed < count) {
      const cand = [];
      for (const q of ls) for (const sd of [-1, 1]) {           // hugging the lane edge: the gap stays flyable, but only just
        const range = newRange(), dist = range + L.margin + 20 + r() * CFG.GUARD_JITTER;
        cand.push({ x: q.x - q.uz * dist * sd, z: q.z + q.ux * dist * sd, range, role: 'guard' });
      }
      for (let k = 0; k < CFG.STRAT_RANDOM; k++) {               // free positions anywhere in the corridor
        const ax = r() * (L.len + CFG.FIELD_END) - CFG.FIELD_END * 0.5, lat = (r() * 2 - 1) * CFG.STRAT_HALF_WIDTH;
        cand.push({ x: L.p0.x + L.dx * ax + L.rx * lat, z: L.p0.z + L.dz * ax + L.rz * lat, range: newRange(), role: 'axis' });
      }
      for (const c of cand) c.sc = score(c) * (0.9 + 0.2 * r());
      cand.sort((a, b) => b.sc - a.sc);
      let ok = false;
      for (let k = 0; k < cand.length; k++) { const c = cand[k]; if (c.sc <= 0) break; if (this.canPlace(c.x, c.z, c.range, n, R)) { commit(c, c.role); placed++; ok = true; break; } }
      if (!ok) break;
    }
    this.sitesDone = n;
  }

  // target cluster at the end of leg n (random: seeded weighted types on valid ground; fixed: CFG.TARGET_FIXED cycled per leg)
  genTargets(n) {
    const L = this.legs[n - 1], r = rng(this.seed * 49979687 + n * 86028121 + 3), p = L.p1, out = [];
    const add = (type, x, z) => out.push({ key: `t${n}:${out.length}`, leg: n, type, x, z, alive: true });
    if (CFG.TARGET_MODE === 'fixed') {
      for (const e of CFG.TARGET_FIXED[(n - 1) % CFG.TARGET_FIXED.length]) add(e.type, p.x + e.dx, p.z + e.dz);
    } else {
      const types = Object.entries(CFG.TARGET_TYPES), total = types.reduce((a, [, T]) => a + T.weight, 0);
      const count = Math.max(1, Math.round(lerp(CFG.TARGETS_LEG[0], CFG.TARGETS_LEG[1], this.ramp(n))));
      for (let i = 0; i < count; i++) {
        let w = r() * total, type = types[0][0]; for (const [k, T] of types) { if ((w -= T.weight) < 0) { type = k; break; } }
        for (let tries = 0; tries < 60; tries++) {                       // widen the search when the ground is bad (lake, steep slope)
          const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * CFG.TARGET_CLUSTER_R * (1 + tries / 15), x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad;
          if (terrainH(x, z) < CFG.WATER_Y + 1 || terrainSlope(x, z, 12) > 0.3) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.z - z) < CFG.TARGET_MIN_SEP)) continue;
          add(type, x, z); break;
        }
      }
      if (!out.length) add(types[0][0], p.x, p.z);                        // never an empty leg
    }
    this.targets.push(...out); this.targetsDone = n;
  }

  // make sure everything needed while flying toward waypoint `n` exists (leg n-1..n+1)
  ensure(n) {
    this.ensureLegs(n + 2);
    while (this.sitesDone < n + 1) this.genSites(this.sitesDone + 1);
    while (this.targetsDone < n + 1) this.genTargets(this.targetsDone + 1);
    this.sites = this.sites.filter((s) => s.leg >= n - 1);
    this.targets = this.targets.filter((t) => t.leg >= n);
  }
}
