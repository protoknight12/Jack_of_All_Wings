// The F-117: flight model (speed, throttle, stall, altitude) and its visuals.
import * as THREE from 'three';
import { CFG } from './config.js';
import { loadModel } from '../core/assets.js';
import { terrainH, terrainNormal } from './terrain.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor(scene, renderer, onProgress) {
    this._n = [0, 1, 0]; this._v = new THREE.Vector3();
    this.scene = scene;
    this.renderer = renderer;
    this.onProgress = onProgress;
    this.root = new THREE.Group();      // heading, world position
    this.tilt = new THREE.Group();      // roll / pitch
    this.root.add(this.tilt);
    this.shadow = new THREE.Group();
    scene.add(this.root, this.shadow);
    this.reset();
  }

  async load() {
    const m = await loadModel('f-117-nighthawk', { renderer: this.renderer, lowRes: true, onProgress: this.onProgress });
    const k = CFG.PLAYER_LENGTH / m.userData.size.x;
    m.scale.setScalar(k);
    this.tilt.add(m);
    // flat dark silhouette on the ground (moves away from the jet as altitude rises)
    const sm = m.clone(true);
    const dark = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    sm.traverse((o) => { if (o.isMesh) o.material = dark; });
    this.shadowFlat = new THREE.Group();
    this.shadowFlat.scale.set(1, 0.002, 1);
    this.shadowFlat.add(sm);
    this.shadow.add(this.shadowFlat);
  }

  reset() {
    this.x = 0; this.z = 0; this.heading = 0;       // heading 0 = north (-Z), clockwise
    this.v = CFG.V_START; this.throttle = 0.35;
    this.alt = CFG.ALT_START;
    this.turnCmd = 0; this.roll = 0; this.pitch = 0; this.bump = 0; this.turb = 0;
    this.stalled = false; this.stallTime = 0;
    this.alive = true;
    this.root.visible = true; this.shadow.visible = true;
    this.flares = CFG.FLARES_START; this.flareCd = 0;
    this.omega = 0;
    this.t = 0;
    this.gy = terrainH(this.x, this.z);
    this.yS = this.gy + this.aglBase; this.climb = 0;
  }

  get fx() { return Math.sin(this.heading); }
  get fz() { return -Math.cos(this.heading); }
  get aglBase() { return CFG.AGL_MIN + CFG.AGL_RANGE * clamp(this.alt / CFG.ALT_START, 0, 1); }
  get y() { return this.yS; }              // smoothed, terrain-following height above sea datum
  get agl() { return this.yS - this.gy; }
  get kt() { return Math.round(this.v * 4); }

  omegaMax() {
    const { V_STALL: vs, V_CORNER: vc, TURN_MAX: tm } = CFG, v = this.v;
    if (v < vs) return 0.3;
    if (v < vc) return lerp(0.35, tm, (v - vs) / (vc - vs));
    return tm * vc / v;
  }

  // events: {onStall, onStallExit}
  update(dt, input, ev) {
    if (!this.alive) return;
    this.t += dt;
    this.throttle = clamp(this.throttle + input.throttle * CFG.THROTTLE_RATE * dt, 0, 1);
    this.turnCmd += (input.turn - this.turnCmd) * Math.min(1, dt * 6);
    this.flareCd = Math.max(0, this.flareCd - dt);

    // stall state (with hysteresis so you have to actually recover speed)
    if (!this.stalled && this.v < CFG.V_STALL) { this.stalled = true; this.stallTime = 0; ev.onStall && ev.onStall(); }
    else if (this.stalled && this.v > CFG.V_STALL_EXIT) { this.stalled = false; ev.onStallExit && ev.onStallExit(); }

    const authority = this.stalled ? 0.2 : 1;
    this.omega = this.turnCmd * this.omegaMax() * authority;
    this.heading += this.omega * dt;

    const drag = CFG.DRAG_IDLE + CFG.DRAG_K * this.v * this.v;
    const induced = CFG.INDUCED_K * this.omega * this.omega * (this.v / 90) ** 2;
    let dv = this.throttle * CFG.THRUST_MAX - drag - induced - 9.8 * Math.sin(this.climb) * CFG.CLIMB_ENERGY;   // climbing ridges bleeds speed, diving gives it back
    if (this.stalled) { this.stallTime += dt; dv += CFG.STALL_DIVE_ACCEL; }
    this.v = clamp(this.v + dv * dt, 25, 210);

    this.x += this.fx * this.v * dt;
    this.z += this.fz * this.v * dt;
    this.gy = terrainH(this.x, this.z);
    this.followTerrain(dt);

    if (this.stalled) this.alt -= CFG.STALL_SINK * dt;
    else if (this.throttle > 0.45) this.alt = Math.min(CFG.ALT_START, this.alt + CFG.ALT_RECOVER * dt);
    if (this.alt <= 0) { this.alt = 0; this.alive = false; ev.onCrash && ev.onCrash(); }

    // visuals
    this.roll += (clamp(this.turnCmd * 0.95, -1, 1) - this.roll) * Math.min(1, dt * 5);
    const wobble = this.stalled ? Math.sin(this.t * 22) * 0.06 : 0;
    this.pitch += ((this.stalled ? -0.55 : this.climb * CFG.PITCH_GAIN) - this.pitch) * Math.min(1, dt * 4);
    this.bump += ((Math.random() - 0.5) * 2 - this.bump) * Math.min(1, dt * 8);    // low-level turbulence over rough ground
    this.syncMesh(wobble);
  }

  // terrain following: aim for the base height over the ground here, but never lower than the highest ground in the next ~1.8 s
  // (plus clearance). Vertical speed is limited to a realistic climb/dive angle, so the jet pitches up ahead of ridges and noses down into valleys.
  followTerrain(dt) {
    const v = this.v, fx = this.fx, fz = this.fz; let ahead = this.gy;
    for (const t of [0.5, 1.0, 1.5, 2.0]) ahead = Math.max(ahead, terrainH(this.x + fx * v * t, this.z + fz * v * t));
    const target = Math.max(this.gy + this.aglBase, ahead + CFG.TERRAIN_CLEARANCE);
    const up = v * Math.tan(CFG.CLIMB_MAX), down = v * Math.tan(CFG.DIVE_MAX);
    const dy = clamp((target - this.yS) * Math.min(1, dt * CFG.FOLLOW_RATE), -down * dt, up * dt);
    this.yS += dy;
    if (this.yS < this.gy + CFG.TERRAIN_FLOOR) this.yS = this.gy + CFG.TERRAIN_FLOOR;     // hard floor: never clip the ground
    this.climb += (Math.atan2(dy / Math.max(dt, 1e-4), v) - this.climb) * Math.min(1, dt * 6);
    this.turb = clamp(1 - this.agl / 90, 0, 1) * CFG.TURB_ROLL;
  }

  syncMesh(wobble = 0) {
    const phi = Math.PI / 2 - this.heading;
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, phi, 0);
    this.tilt.rotation.set(this.roll + this.bump * this.turb, 0, this.pitch + wobble);
    // shadow lands on the terrain, tilted to the local slope
    const h = Math.max(6, this.agl), sx = this.x + h * 0.35, sz = this.z + h * 0.25, n = terrainNormal(sx, sz, this._n);
    this.shadow.position.set(sx, terrainH(sx, sz) + 0.8, sz);
    this.shadow.quaternion.setFromUnitVectors(UP, this._v.set(n[0], n[1], n[2]));
    if (this.shadowFlat) this.shadowFlat.rotation.y = phi;
  }

  // where the tail exhaust is, for engine glow particles
  tailPos(out) {
    const b = CFG.PLAYER_LENGTH * 0.45;
    return out.set(this.x - this.fx * b, this.y, this.z - this.fz * b);
  }
}
