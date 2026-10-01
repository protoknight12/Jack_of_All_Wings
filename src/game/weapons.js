// Internal bay + bombs. Weapon data lives in CFG.WEAPONS; the flight model is ballistics.js (shared with the release prediction).
// Bay: B toggles the doors (radar signature up while they are not fully shut); G releases a bomb, only with the doors fully open.
// A bomb is only drawn from release to impact. Its physics run in true space (y = true height, falling from the jet's ALT);
// the drawing squeezes that height into the jet's low visual height (b.k), so on screen it leaves the jet and meets the ground.
import * as THREE from 'three';
import { CFG } from './config.js';
import { terrainH } from './terrain.js';
import { ballisticStep, predictImpact, hitGround } from './ballistics.js';

const X = new THREE.Vector3(1, 0, 0), V = new THREE.Vector3();

export class Weapons {
  constructor(scene, models = {}) {                    // models: weapon id -> loaded model (CFG.WEAPONS[id].model); a plain cylinder stands in when missing
    this.scene = scene; this.models = models; this.bombs = [];
    this.geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); this.geo.rotateZ(Math.PI / 2);      // unit length along +x
    this.mat = new THREE.MeshStandardMaterial({ color: 0x4a5148, roughness: 0.6, metalness: 0.4 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; scene.add(this.ring);
    this.reset();
  }
  reset() { for (const b of this.bombs) this.scene.remove(b.mesh); this.bombs = []; this.id = CFG.WEAPON_START; this.rounds = CFG.BAY_ROUNDS; this.door = 0; this.doorWant = false; this.relCd = 0; this.ring.visible = false; }
  get spec() { return CFG.WEAPONS[this.id]; }
  get doorsOpen() { return this.door > 0; }          // not fully shut: radar signature is up
  get bayReady() { return this.door >= 1; }          // fully open: a bomb can leave
  rearm(n = CFG.BAY_REFILL_PER_LEG) { this.rounds = Math.min(CFG.BAY_ROUNDS, this.rounds + n); }
  get empty() { return this.rounds <= 0 && !this.bombs.length; }
  toggleBay() { this.doorWant = !this.doorWant; return this.doorWant; }

  // bomb state if released now (true space: falls from the jet's ALT, with its speed and vertical rate)
  releaseState(p) { return { x: p.x, y: p.gy + p.trueAGL, z: p.z, vx: p.fx * p.v, vy: p.vy, vz: p.fz * p.v }; }
  // where a bomb released now would land if nothing steers it (same function the bomb itself flies with)
  predict(p) { return predictImpact(this.releaseState(p), this.spec); }

  // bombing solution for target t from this frame's release prediction (this.aim, via predictImpact): nothing is a fixed distance.
  // along = m the target lies beyond the predicted impact point along the track (> 0 = release still ahead), cross = m right of it,
  // tRel = s until the impact point reaches the target flying straight, lim = the miss the guidance can still fix from a release now
  // (from the weapon's fin authority and the fall time), inRange = a release now would be steered onto the target.
  solution(p, t) {
    if (!t || !this.aim || !p.alive) return null;
    const q = this.aim, dx = t.x - q.x, dz = t.z - q.z, along = dx * p.fx + dz * p.fz, cross = -dx * p.fz + dz * p.fx;
    const g = this.spec.guidance, cl = g ? 0.5 * g.maxG * CFG.GRAVITY * q.t * q.t : 0, lim = { cross: cl, along: cl * CFG.GUIDE_ALONG_FACTOR };
    return { along, cross, lim, tRel: along / Math.max(1, p.v), tFall: q.t, inRange: Math.abs(along) <= lim.along && Math.abs(cross) <= lim.cross,
      dist: Math.hypot(t.x - p.x, t.z - p.z), type: t.type };
  }

  // kill / damage radii of weapon s against a target type (null = can't hurt it)
  radii(s, type) {
    const cls = CFG.TARGET_TYPES[type]?.cls, e = s.effects[cls];
    if (!e || !s.validTargets.includes(type)) return null;
    const f = cls === 'hard' && !s.penetrator ? s.hardFactor : 1;
    return { kill: e.kill * f, dmg: e.dmg * f };
  }

  // release key: 'ok' | 'shut' | 'empty' | 'busy'. target = the designated ground target (laser spot), or null for a plain gravity drop
  pickle(p, target) {
    if (!p.alive || this.relCd > 0) return 'busy';
    if (this.rounds <= 0) return 'empty';
    if (!this.bayReady) return 'shut';
    this.release(p, target); return 'ok';
  }

  // the designator keeps the spot on the target while the jet is alive and the target is within the gimbal limit of the nose (3D line of sight)
  lasing(b, p) {
    const t = b.target, g = CFG.WEAPONS[b.id].guidance;
    if (!t || !g || g.type !== 'laser' || !p.alive) return false;
    const dx = t.x - p.x, dz = t.z - p.z, dy = terrainH(t.x, t.z) - (p.gy + p.trueAGL), d = Math.hypot(dx, dy, dz);
    return d < 1 || Math.acos(Math.max(-1, Math.min(1, (dx * p.fx + dz * p.fz) / d))) <= g.gimbal;
  }

  // fin acceleration toward the spot: null the predicted miss (miss * gain / t_go^2), only perpendicular to the velocity
  // (sideways for cross-track; lift in the vertical plane for along-track: up = longer, down = shorter), capped at maxG
  guide(b, s) {
    const q = predictImpact(b, s), tgo = Math.max(q.t, 0.5), k = s.guidance.gain / (tgo * tgo);
    const mx = (b.target.x - q.x) * k, mz = (b.target.z - q.z) * k;
    const vh = Math.hypot(b.vx, b.vz) || 1e-6, hx = b.vx / vh, hz = b.vz / vh, along = mx * hx + mz * hz, cross = -mx * hz + mz * hx;
    const v = Math.hypot(b.vx, b.vy, b.vz) || 1e-6, ux = b.vx / v, uy = b.vy / v, uz = b.vz / v;
    let nx = -uy * ux, ny = 1 - uy * uy, nz = -uy * uz; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;   // "up", perpendicular to v
    let fx = -hz * cross + nx * along, fy = ny * along, fz = hx * cross + nz * along;
    const f = Math.hypot(fx, fy, fz), cap = s.guidance.maxG * CFG.GRAVITY;
    if (f > cap) { fx *= cap / f; fy *= cap / f; fz *= cap / f; }
    return { x: fx, y: fy, z: fz };
  }

  // ctx: { targets (alive), sel (designated target or null), particles, audio, hit(target, accuracy), damaged(target), lase(on), shake(v) }
  update(dt, p, ctx) {
    this.door = Math.min(1, Math.max(0, this.door + (this.doorWant ? dt : -dt) / CFG.BAY_DOOR_TIME));
    p.rcsMult = this.doorsOpen ? 1 + CFG.BAY_RCS_BOOST : 1;
    this.relCd = Math.max(0, this.relCd - dt);
    const DT = CFG.BALLISTIC_DT;
    for (const b of this.bombs) {
      const s = CFG.WEAPONS[b.id];
      b.acc += dt;
      while (b.acc >= DT && !b.dead) {                // fixed steps, exactly like predictImpact()
        b.acc -= DT;
        const on = this.lasing(b, p);
        if (on !== b.lased) { b.lased = on; ctx.lase(on); }
        ballisticStep(b, s, on ? this.guide(b, s) : null);
        if (hitGround(b)) { b.dead = true; this.detonate(b, ctx); }
      }
      this.place(b);
    }
    this.bombs = this.bombs.filter((b) => { if (b.dead) this.scene.remove(b.mesh); return !b.dead; });
    this.ring.visible = p.alive && this.rounds > 0;
    if (this.ring.visible) {
      const q = this.predict(p), r = ctx.sel && this.radii(this.spec, ctx.sel.type);
      this.aim = q; this.aimR = r ? r.kill : this.spec.effects.soft.kill;
      this.ring.position.set(q.x, terrainH(q.x, q.z) + 2, q.z); this.ring.scale.set(this.aimR, this.aimR, 1);
    }
  }

  // draw a bomb: true height above the ground squeezed by b.k into the visual height, nose along the (squeezed) velocity
  place(b) {
    const g = terrainH(b.x, b.z);
    b.mesh.position.set(b.x, g + Math.max(0, b.y - g) * b.k, b.z);
    b.mesh.quaternion.setFromUnitVectors(X, V.set(b.vx, b.vy * b.k, b.vz).normalize());
  }

  release(p, target) {
    const s = this.spec, proto = this.models[this.id], k = CFG.BOMB_VISUAL_SCALE;
    const mesh = proto ? proto.clone(true) : new THREE.Mesh(this.geo, this.mat);
    if (proto) mesh.scale.setScalar(k); else mesh.scale.set(s.length * k, s.length * k * 0.09, s.length * k * 0.09);
    this.scene.add(mesh);
    this.rounds--; this.relCd = CFG.RELEASE_INTERVAL;
    const b = { ...this.releaseState(p), mesh, id: this.id, target, acc: 0, k: Math.max(0, p.y - 2 - p.gy) / Math.max(1, p.trueAGL) };
    b.lased = this.lasing(b, p);
    this.bombs.push(b); this.place(b);
  }

  // inside kill radius (or a second hit inside the damage radius on a damaged target) = destroyed; inside damage radius = damaged
  detonate(b, ctx) {
    const s = CFG.WEAPONS[b.id], g = terrainH(b.x, b.z);
    ctx.particles.explosion(b.x, g + 2, b.z, s.blastFx); ctx.audio.boom(0.35, 1.2); ctx.shake(0.4);
    for (const t of ctx.targets) {
      const r = this.radii(s, t.type), d = Math.hypot(t.x - b.x, t.z - b.z);
      if (!r || d > r.dmg) continue;
      if (d <= r.kill || t.damaged) ctx.hit(t, Math.max(0, 1 - d / r.kill));
      else { t.damaged = true; ctx.damaged(t); }
    }
  }
}
