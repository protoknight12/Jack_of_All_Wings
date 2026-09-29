// PAC-3-style interceptor with a real energy budget, a doppler-notch track model and decoy seduction.
//   energy:  thrust only while the motor burns; parasitic drag ~ v^2; induced drag ~ omega^2 * v; turn rate ~ v.
//   seeker:  track quality q (1..0). Sustained beaming and chaff drain it, it recovers otherwise, low q = wandering aim.
//   decoys:  a hazard rate that depends on missile range to the jet, decoys in the seeker gate, and jet maneuvering.
import * as THREE from 'three';
import { CFG } from './config.js';
import { terrainH } from './terrain.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let dashTex;
function dashTexture() {
  if (dashTex) return dashTex;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
  const c = cv.getContext('2d'); c.fillStyle = '#ff2a2a'; c.fillRect(0, 0, 36, 8);
  dashTex = new THREE.CanvasTexture(cv); dashTex.wrapS = THREE.RepeatWrapping; dashTex.colorSpace = THREE.SRGBColorSpace;
  return dashTex;
}

export class Missile {
  constructor(site, player, proto, scene) {
    this.scene = scene; this.site = site;
    this.x = site.x; this.z = site.z; this.y = terrainH(site.x, site.z) + CFG.MSL_AGL_LAUNCH;
    this.heading = Math.atan2(player.x - site.x, -(player.z - site.z));   // 0 = north (-Z), clockwise
    this.speed = CFG.MSL_LAUNCH_SPEED; this.age = 0; this.omega = 0;
    this.mode = 'track';                          // 'track' | 'decoy' | 'lost'
    this.q = 1; this.depth = 0; this.gate = 0; this.beaming = false; this.burning = true;
    this.decoy = null; this.lostAge = 0; this.dead = false; this.errAng = Math.random() * 6.283; this.errMag = 0;
    this.fx = Math.sin(this.heading); this.fz = -Math.cos(this.heading);
    this.rel = [player.x - this.x, player.z - this.z];
    this.dPlayer = Math.hypot(this.rel[0], this.rel[1]);

    this.mesh = proto.clone(true);
    this.mesh.scale.setScalar(CFG.MSL_VISUAL_SCALE);
    this.rig = new THREE.Group(); this.rig.add(this.mesh); scene.add(this.rig);

    // flashing dotted warning line showing where the missile is heading
    const mat = new THREE.MeshBasicMaterial({ map: dashTexture().clone(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.map.wrapS = THREE.RepeatWrapping; mat.map.needsUpdate = true;
    this.lineLen = 1800;
    this.line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.line.rotation.x = -Math.PI / 2;
    this.line.scale.set(this.lineLen, 5, 1);
    this.line.position.x = this.lineLen / 2;
    this.lineRig = new THREE.Group(); this.lineRig.add(this.line); scene.add(this.lineRig);
    mat.map.repeat.set(this.lineLen / 40, 1);
    this.syncMesh();
  }

  syncMesh() {
    const phi = Math.atan2(-this.fz, this.fx);
    this.rig.position.set(this.x, this.y, this.z); this.rig.rotation.set(0, phi, 0);
    this.lineRig.position.set(this.x, terrainH(this.x, this.z) + 2, this.z); this.lineRig.rotation.set(0, phi, 0);
  }
  dispose() { this.scene.remove(this.rig, this.lineRig); this.line.material.map.dispose(); this.line.material.dispose(); this.line.geometry.dispose(); }

  get energy() { return clamp((this.speed - CFG.MSL_MIN_SPEED) / (CFG.MSL_SPEED_REF - CFG.MSL_MIN_SPEED), 0, 1); }

  // count decoys inside the seeker gate (angle around the line to the jet, and range around the jet)
  scanGate(flares, px, pz, dx, dz, d) {
    let n = 0; const inGate = [];
    for (const f of flares) {
      if (f.life <= 0 || Math.hypot(f.x - px, f.z - pz) > CFG.FLARE_GATE_RANGE) continue;
      const fx = f.x - this.x, fz = f.z - this.z, fd = Math.hypot(fx, fz) || 1e-6;
      if ((fx * dx + fz * dz) / (fd * d) < Math.cos(CFG.FLARE_GATE_ANGLE)) continue;
      n++; inGate.push(f);
    }
    this.gateN = n; this.gate = Math.min(1, n / CFG.FLARE_GATE_SAT);
    return inGate;
  }

  loseTrack(ctx) {
    this.mode = 'lost'; this.lostAge = 0; this.q = 0;
    ctx.onNotch && ctx.onNotch(this);
  }

  // ctx: {player, particles, flares, time, onNotch, onKill, onSeduced, onDecoyHit, onReacquire, onSpent}
  update(dt, ctx) {
    const { player, particles: fx } = ctx, flares = ctx.flares || [];
    this.age += dt;
    const px = player.x, pz = player.z, pvx = player.fx * player.v, pvz = player.fz * player.v;
    const dx = px - this.x, dz = pz - this.z, d = Math.hypot(dx, dz) || 1e-6;
    this.dPlayer = d;
    const ux = dx / d, uz = dz / d;
    const inSeeker = player.alive && d < CFG.SEEKER_RANGE && d > CFG.SEEKER_MIN;

    // notch geometry: jet's radial speed along the line of sight must be inside the doppler gate, at a speed that keeps the notch valid
    const vr = pvx * ux + pvz * uz;
    this.vr = vr;
    this.depth = inSeeker && player.v > CFG.NOTCH_MIN_SPEED ? Math.max(0, 1 - Math.abs(vr) / CFG.NOTCH_GATE_VR) : 0;
    this.beaming = this.depth > 0;
    const inGate = inSeeker ? this.scanGate(flares, px, pz, dx, dz, d) : (this.gate = 0, this.gateN = 0, []);

    // ---- seeker state machine ----
    if (this.mode === 'track' && player.alive) {
      if (d >= CFG.SEEKER_RANGE) {
        this.q = Math.min(1, this.q + CFG.TRACK_RECOVER * dt);             // command guided from the site
        if (Math.hypot(px - this.site.x, pz - this.site.z) > this.site.range * CFG.MSL_UPLINK_MULT) this.mode = 'lost', this.lostAge = 0, this.q = 0;
      } else if (d > CFG.SEEKER_MIN) {
        const gf = this.gate;
        const drain = this.depth / CFG.NOTCH_TIME * (1 + (CFG.CHAFF_NOTCH_BOOST - 1) * gf) + CFG.CHAFF_DRAIN * gf;
        this.q = drain > 0 ? this.q - drain * dt : Math.min(1, this.q + CFG.TRACK_RECOVER * dt);
        if (gf > 0 && d >= CFG.FLARE_MIN_DIST && d <= CFG.FLARE_MAX_DIST && inGate.length) {
          const win = d < CFG.FLARE_PEAK_DIST ? (d - CFG.FLARE_MIN_DIST) / (CFG.FLARE_PEAK_DIST - CFG.FLARE_MIN_DIST) : (CFG.FLARE_MAX_DIST - d) / (CFG.FLARE_MAX_DIST - CFG.FLARE_PEAK_DIST);
          const maneuver = Math.max(this.depth, Math.min(1, Math.abs(player.omega) / CFG.MANEUVER_OMEGA_REF));
          const hazard = CFG.FLARE_HAZARD * win * gf * (1 + (CFG.FLARE_MANEUVER_MULT - 1) * maneuver) * (1 + CFG.FLARE_LOWQ_BOOST * (1 - this.q));
          this.hazard = hazard;
          if (Math.random() < 1 - Math.exp(-hazard * dt)) {
            this.mode = 'decoy'; this.decoy = inGate[(Math.random() * inGate.length) | 0];
            ctx.onSeduced && ctx.onSeduced(this);
          }
        }
        if (this.mode === 'track' && this.q <= 0) { this.q = 0; this.loseTrack(ctx); }
      }
    } else if (this.mode === 'lost') {
      this.lostAge += dt;
      if (player.alive && d < CFG.SEEKER_RANGE && this.lostAge < CFG.REACQ_TIME && !this.beaming && this.gate < 0.5) {
        this.q += CFG.REACQ_RATE * dt;
        if (this.q >= CFG.REACQ_Q) { this.mode = 'track'; ctx.onReacquire && ctx.onReacquire(this); }
      }
      if (this.lostAge > CFG.LOST_TIMEOUT) { this.explode(fx, 0.5); return; }
    }

    // ---- guidance: proportional navigation on the seeker's estimate ----
    let tx = 0, tz = 0, tvx = 0, tvz = 0, guide = false;
    if (this.mode === 'track' && player.alive) {
      if (d > CFG.SEEKER_MIN) {                                            // below SEEKER_MIN the aim error is frozen
        this.errMag = CFG.AIM_ERR_M * (1 - this.q);
        this.errAng += (Math.random() * 2 - 1) * 3 * dt;
      }
      tx = px + Math.cos(this.errAng) * this.errMag; tz = pz + Math.sin(this.errAng) * this.errMag; tvx = pvx; tvz = pvz; guide = true;
    } else if (this.mode === 'decoy') {
      if (this.decoy && this.decoy.life > 0) { tx = this.decoy.x; tz = this.decoy.z; tvx = this.decoy.vx; tvz = this.decoy.vz; guide = true; }
      else { this.mode = 'lost'; this.lostAge = 0; this.q = 0; }
    }

    const burning = this.age < CFG.MSL_BURN_TIME;
    this.burning = burning;
    let omega = 0;
    if (guide) {
      const rx = tx - this.x, rz = tz - this.z, r2 = rx * rx + rz * rz + 1;
      const lamDot = (rx * (tvz - this.fz * this.speed) - rz * (tvx - this.fx * this.speed)) / r2;
      const wMax = CFG.MSL_TURN_REF * this.speed / CFG.MSL_SPEED_REF;      // turn rate is proportional to speed
      omega = clamp(CFG.MSL_NAV_GAIN * lamDot, -wMax, wMax);
      this.heading += omega * dt;
      this.fx = Math.sin(this.heading); this.fz = -Math.cos(this.heading);
    }
    this.omega = omega;

    // ---- energy ----
    const dv = (burning ? CFG.MSL_THRUST : 0) - CFG.MSL_DRAG_K * this.speed * this.speed - CFG.MSL_INDUCED_K * omega * omega * this.speed;
    this.speed = Math.max(1, this.speed + dv * dt);

    const step = this.speed * dt;
    this.x += this.fx * step; this.z += this.fz * step;
    const gy = terrainH(this.x, this.z);
    this.y += ((player.y - this.y) * Math.min(1, CFG.MSL_AGL_FOLLOW * dt));
    this.y = Math.max(this.y, gy + 2);
    this.syncMesh();

    // motor plume while burning; a coasting missile is dark and quiet
    if (burning) fx.missileBurn(this.x, this.y, this.z, this.fx, this.fz, step);

    this.line.visible = this.mode !== 'lost' && (Math.floor(ctx.time * 8) % 2 === 0);
    this.lineRig.visible = this.mode !== 'lost';

    // ---- endings ----
    if (this.mode === 'decoy' && this.decoy && Math.hypot(this.decoy.x - this.x, this.decoy.z - this.z) < CFG.MSL_DECOY_HIT) {
      this.decoy.life = 0; this.explode(fx, 0.7); ctx.onDecoyHit && ctx.onDecoyHit(this); return;
    }
    // closest approach to the jet over this step (both move), so a fast missile can't tunnel through
    const r0x = this.rel[0], r0z = this.rel[1], r1x = px - this.x, r1z = pz - this.z;
    this.rel = [r1x, r1z];
    const ex = r1x - r0x, ez = r1z - r0z, e2 = ex * ex + ez * ez;
    const s = e2 > 1e-6 ? clamp(-(r0x * ex + r0z * ez) / e2, 0, 1) : 0;
    const dmin = Math.hypot(r0x + ex * s, r0z + ez * s);
    const kr = this.mode === 'decoy' ? CFG.MSL_KILL_RADIUS_DECOY : this.mode === 'lost' ? CFG.MSL_KILL_RADIUS_LOST : CFG.MSL_KILL_RADIUS;
    this.miss = Math.min(this.miss ?? 1e9, dmin);
    if (player.alive && dmin < kr && Math.abs(player.y - this.y) < CFG.MSL_KILL_DY) {
      this.explode(fx, 1.3); ctx.onKill && ctx.onKill(this); return;
    }
    if (!burning && this.speed < CFG.MSL_MIN_SPEED) { this.explode(fx, 0.5); ctx.onSpent && ctx.onSpent(this); return; }
    if (this.age > CFG.MSL_LIFE) { this.explode(fx, 0.5); ctx.onSpent && ctx.onSpent(this); }
  }

  explode(fx, scale) { fx.explosion(this.x, this.y, this.z, scale); this.dead = true; }
}
